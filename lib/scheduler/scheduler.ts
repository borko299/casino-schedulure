import type { Dealer, SchedulePreferences, DealerWithTables, ScheduleData, DealerAssignment } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTimeSlots, validateSchedule } from "./utils"
import {
  getDealerAvailableTables,
  calculateScheduleParameters,
  initializeDealerAssignments,
} from "./workload-calculator"
import { scheduleBreaks } from "./break-scheduler"
import {
  fillWorkSlots,
  fillRemainingSlots,
  ensureCompleteAssignments,
  fixConsecutiveTableAssignments,
} from "./slot-filler"
import { validateAndFixBreaks, redistributeBreaksEvenly } from "./break-validator"
import { validateAndFixRotations } from "./rotation-validator"
import type { TimeSlot } from "../scheduler-types"
import { SCHEDULER_CONFIG } from "./config"

/**
 * Генерира график за дилъри с подобрен алгоритъм за ротация
 */
export async function generateSchedule(
  dealers: Dealer[],
  shiftType: "day" | "night",
  supabaseClient: SupabaseClient,
  preferences?: SchedulePreferences,
): Promise<ScheduleData> {
  try {
    const timeSlots = generateTimeSlots(shiftType)
    const schedule: ScheduleData = {}
    timeSlots.forEach((slot) => {
      schedule[slot.time] = {}
    })

    const dealersWithTables = await Promise.all(
      dealers.map(async (dealer) => {
        const availableTables = await getDealerAvailableTables(dealer as DealerWithTables, supabaseClient)
        return {
          ...dealer,
          available_tables: availableTables.length > 0 ? availableTables : dealer.available_tables || [],
        } as DealerWithTables
      }),
    )

    const eligibleDealers = dealersWithTables.filter((dealer) => dealer.available_tables.length > 0)
    if (eligibleDealers.length === 0) return schedule

    const allTables = new Set<string>()
    eligibleDealers.forEach((dealer) => dealer.available_tables.forEach((table) => allTables.add(table)))
    const uniqueTables = Array.from(allTables)

    const params = calculateScheduleParameters(uniqueTables, eligibleDealers)
    const dealerAssignments = initializeDealerAssignments(eligibleDealers, params)

    // Стъпка 1: Първоначално планиране на почивките
    scheduleBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments, preferences)

    // Стъпка 2: Запълване на работните слотове
    fillWorkSlots(eligibleDealers, uniqueTables, timeSlots, schedule, dealerAssignments)

    // Стъпка 3: Запълване на останалите слотове (ако има)
    fillRemainingSlots(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 4: Гарантиране, че всички слотове са запълнени (критично преди валидациите)
    ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 5: Итеративен процес на подобряване
    for (let i = 0; i < SCHEDULER_CONFIG.MAX_REFINEMENT_ITERATIONS; i++) {
      console.log(`Refinement iteration ${i + 1}`)

      // Валидиране и коригиране на почивките (включва новото правило за мин. маси и поредни почивки)
      validateAndFixBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments as Record<string, DealerAssignment>)

      // Валидиране и коригиране на ротациите (може да включва правилото за мин. слотове, ако е нужно, или да се адаптира)
      validateAndFixRotations(
        eligibleDealers,
        timeSlots,
        schedule,
        dealerAssignments as Record<string, DealerAssignment>,
      )

      // Коригиране на последователни назначения на една и съща маса
      fixConsecutiveTableAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

      // Балансиране на ротации и почивки спрямо целевите стойности
      balanceRotationsAndBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments, params)

      // Равномерно разпределяне на почивките
      redistributeBreaksEvenly(
        eligibleDealers,
        timeSlots,
        schedule,
        dealerAssignments as Record<string, DealerAssignment>,
      )

      // Финално гарантиране на пълни назначения след всички корекции в итерацията
      ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

      const validation = validateSchedule(schedule, dealerAssignments, timeSlots, eligibleDealers)
      if (validation.valid) {
        console.log(`Schedule is valid after ${i + 1} iterations.`)
        break
      } else {
        console.warn(`Schedule still has issues after iteration ${i + 1}:`, validation.errors.slice(0, 5))
      }
    }

    const finalValidation = validateSchedule(schedule, dealerAssignments, timeSlots, eligibleDealers)
    if (!finalValidation.valid) {
      console.warn("Schedule still has issues after refinement. Applying aggressive balancing.")
      aggressiveBalancing(eligibleDealers, timeSlots, schedule, dealerAssignments, params)
      ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)
    }

    // Извеждане на статистика
    console.log("Dealer statistics (final):")
    console.log(
      "NAME | ROTATIONS | BREAKS | UNIQUE TABLES (WORKED) | TARGET R/B | TABLES IN CURR SEGMENT | IS FIRST SEG",
    )
    console.log("-".repeat(100))
    eligibleDealers.forEach((dealer) => {
      const stats = dealerAssignments[dealer.id]
      console.log(
        `${dealer.nickname || dealer.name} | ${stats.rotations} | ${stats.breaks} | ${
          stats.assignedTables.size
        } | ${stats.targetRotations}/${stats.targetBreaks} | ${Array.from(stats.tablesInCurrentWorkSegment).join(",")} | ${stats.isFirstWorkSegmentOfShift}`,
      )
      const breakPositionsFormatted = stats.breakPositions
        .sort((a, b) => a - b)
        .map((pos) => timeSlots[pos]?.formattedTime || `InvalidPos:${pos}`)
        .join(", ")
      console.log(`  Breaks at: ${breakPositionsFormatted}`)
      console.log("-".repeat(30))
    })

    return schedule
  } catch (error) {
    console.error("Error in generateSchedule:", error)
    return {}
  }
}

function balanceRotationsAndBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
  params: any,
): void {
  const MAX_BALANCE_ATTEMPTS = SCHEDULER_CONFIG.MAX_BALANCE_ATTEMPTS

  for (let attempt = 0; attempt < MAX_BALANCE_ATTEMPTS; attempt++) {
    let imbalanceFound = false
    for (const dealer of eligibleDealers) {
      const stats = dealerAssignments[dealer.id]
      const rotationDiff = stats.targetRotations - stats.rotations

      if (rotationDiff > 0) {
        const converted = convertBreaksToRotations(dealer, timeSlots, schedule, stats, rotationDiff)
        if (converted > 0) imbalanceFound = true
      } else if (rotationDiff < 0) {
        const converted = convertRotationsToBreaks(dealer, timeSlots, schedule, stats, -rotationDiff)
        if (converted > 0) imbalanceFound = true
      }
    }
    if (!imbalanceFound) break
  }
  balanceBetweenDealers(eligibleDealers, timeSlots, schedule, dealerAssignments)
}

function convertBreaksToRotations(
  dealer: DealerWithTables,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  assignments: DealerAssignment,
  count: number,
): number {
  const breakSlotsIndices: number[] = []
  assignments.breakPositions.forEach((pos) => breakSlotsIndices.push(pos))

  breakSlotsIndices.sort((a, b) => {
    return Math.abs(a - timeSlots.length / 2) - Math.abs(b - timeSlots.length / 2)
  })

  let converted = 0
  for (const breakIndex of breakSlotsIndices) {
    if (converted >= count) break
    const timeSlot = timeSlots[breakIndex].time

    const availableTables = dealer.available_tables.filter(
      (table) => !Object.values(schedule[timeSlot]).includes(table),
    )

    if (availableTables.length > 0) {
      const selectedTable = availableTables[0]

      let prevTable = null
      if (
        breakIndex > 0 &&
        schedule[timeSlots[breakIndex - 1].time][dealer.id] &&
        schedule[timeSlots[breakIndex - 1].time][dealer.id] !== "BREAK"
      ) {
        prevTable = schedule[timeSlots[breakIndex - 1].time][dealer.id]
      }
      if (prevTable === selectedTable && assignments.tablesInCurrentWorkSegment.has(selectedTable)) {
        const alternativeTable = availableTables.find((t) => t !== selectedTable)
        if (alternativeTable) {
          schedule[timeSlot][dealer.id] = alternativeTable
        } else {
          schedule[timeSlot][dealer.id] = selectedTable
        }
      } else {
        schedule[timeSlot][dealer.id] = selectedTable
      }

      assignments.rotations++
      assignments.breaks--
      assignments.assignedTables.add(schedule[timeSlot][dealer.id])
      const bpIndex = assignments.breakPositions.indexOf(breakIndex)
      if (bpIndex > -1) assignments.breakPositions.splice(bpIndex, 1)
      converted++
    }
  }
  return converted
}

function convertRotationsToBreaks(
  dealer: DealerWithTables,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  assignments: DealerAssignment,
  count: number,
): number {
  const rotationSlotsIndices: number[] = []
  for (let i = 0; i < timeSlots.length; i++) {
    if (schedule[timeSlots[i].time][dealer.id] && schedule[timeSlots[i].time][dealer.id] !== "BREAK") {
      rotationSlotsIndices.push(i)
    }
  }

  rotationSlotsIndices.sort((a, b) => {
    return Math.abs(a - timeSlots.length / 2) - Math.abs(b - timeSlots.length / 2)
  })

  let converted = 0
  for (const rotationIndex of rotationSlotsIndices) {
    if (converted >= count) break
    const timeSlot = timeSlots[rotationIndex].time

    let wouldCreateConsecutive = false
    if (rotationIndex > 0 && schedule[timeSlots[rotationIndex - 1].time][dealer.id] === "BREAK") {
      wouldCreateConsecutive = true
    }
    if (rotationIndex < timeSlots.length - 1 && schedule[timeSlots[rotationIndex + 1].time][dealer.id] === "BREAK") {
      wouldCreateConsecutive = true
    }

    if (!wouldCreateConsecutive) {
      const removedTable = schedule[timeSlot][dealer.id]
      schedule[timeSlot][dealer.id] = "BREAK"
      assignments.rotations--
      assignments.breaks++
      assignments.breakPositions.push(rotationIndex)
      assignments.breakPositions.sort((a, b) => a - b)
      converted++
    }
  }
  return converted
}

function balanceBetweenDealers(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): void {
  const dealersWithExcess = eligibleDealers.filter(
    (d) => dealerAssignments[d.id].rotations > dealerAssignments[d.id].targetRotations,
  )
  const dealersWithDeficit = eligibleDealers.filter(
    (d) => dealerAssignments[d.id].rotations < dealerAssignments[d.id].targetRotations,
  )

  for (const excessDealer of dealersWithExcess) {
    let excessAmount = dealerAssignments[excessDealer.id].rotations - dealerAssignments[excessDealer.id].targetRotations
    if (excessAmount <= 0) continue

    for (const deficitDealer of dealersWithDeficit) {
      let deficitAmount =
        dealerAssignments[deficitDealer.id].targetRotations - dealerAssignments[deficitDealer.id].rotations
      if (deficitAmount <= 0) continue

      const swapsToAttempt = Math.min(excessAmount, deficitAmount)
      let swapsMade = 0

      for (let i = 0; i < timeSlots.length && swapsMade < swapsToAttempt; i++) {
        const slotTime = timeSlots[i].time
        const excessAssignment = schedule[slotTime][excessDealer.id]
        const deficitAssignment = schedule[slotTime][deficitDealer.id]

        if (excessAssignment && excessAssignment !== "BREAK" && deficitAssignment === "BREAK") {
          if (deficitDealer.available_tables.includes(excessAssignment)) {
            let noConsecutiveForExcess = true
            if (i > 0 && schedule[timeSlots[i - 1].time][excessDealer.id] === "BREAK") noConsecutiveForExcess = false
            if (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][excessDealer.id] === "BREAK")
              noConsecutiveForExcess = false

            let noConsecutiveTableForDeficit = true
            if (i > 0 && schedule[timeSlots[i - 1].time][deficitDealer.id] === excessAssignment)
              noConsecutiveTableForDeficit = false
            if (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][deficitDealer.id] === excessAssignment)
              noConsecutiveTableForDeficit = false

            if (noConsecutiveForExcess && noConsecutiveTableForDeficit) {
              schedule[slotTime][excessDealer.id] = "BREAK"
              schedule[slotTime][deficitDealer.id] = excessAssignment

              const excessStats = dealerAssignments[excessDealer.id]
              excessStats.rotations--
              excessStats.breaks++
              excessStats.breakPositions.push(i)
              excessStats.breakPositions.sort((a, b) => a - b)

              const deficitStats = dealerAssignments[deficitDealer.id]
              deficitStats.rotations++
              deficitStats.breaks--
              deficitStats.assignedTables.add(excessAssignment)
              const bpIdx = deficitStats.breakPositions.indexOf(i)
              if (bpIdx > -1) deficitStats.breakPositions.splice(bpIdx, 1)

              swapsMade++
              excessAmount--
              deficitAmount--
              if (excessAmount <= 0) break
            }
          }
        }
      }
      if (excessAmount <= 0) break
    }
  }
}

function aggressiveBalancing(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
  params: any,
): void {
  console.log("Starting aggressive balancing...")

  const dealersWithLargeDeficit = eligibleDealers.filter((dealer) => {
    const stats = dealerAssignments[dealer.id]
    return stats.targetRotations - stats.rotations > SCHEDULER_CONFIG.LARGE_DIFFERENCE_THRESHOLD
  })

  const dealersWithLargeExcess = eligibleDealers.filter((dealer) => {
    const stats = dealerAssignments[dealer.id]
    return stats.rotations - stats.targetRotations > SCHEDULER_CONFIG.LARGE_DIFFERENCE_THRESHOLD
  })

  console.log(`Found ${dealersWithLargeDeficit.length} dealers with large rotation deficit`)
  console.log(`Found ${dealersWithLargeExcess.length} dealers with large rotation excess`)

  if (dealersWithLargeDeficit.length === 0 && dealersWithLargeExcess.length === 0) {
    return
  }

  dealersWithLargeDeficit.sort((a, b) => {
    const diffA = dealerAssignments[a.id].targetRotations - dealerAssignments[a.id].rotations
    const diffB = dealerAssignments[b.id].targetRotations - dealerAssignments[b.id].rotations
    return diffB - diffA
  })

  dealersWithLargeExcess.sort((a, b) => {
    const diffA = dealerAssignments[a.id].rotations - dealerAssignments[a.id].targetRotations
    const diffB = dealerAssignments[b.id].rotations - dealerAssignments[b.id].targetRotations
    return diffB - diffA
  })

  for (const deficitDealer of dealersWithLargeDeficit) {
    let deficitAmount =
      dealerAssignments[deficitDealer.id].targetRotations - dealerAssignments[deficitDealer.id].rotations
    if (deficitAmount <= 0) continue

    console.log(`Aggressively balancing dealer ${deficitDealer.name} with deficit of ${deficitAmount} rotations`)

    for (const excessDealer of dealersWithLargeExcess) {
      let excessAmount =
        dealerAssignments[excessDealer.id].rotations - dealerAssignments[excessDealer.id].targetRotations
      if (excessAmount <= 0) continue

      const transferAmount = Math.min(deficitAmount, excessAmount)
      console.log(
        `  Attempting to transfer ${transferAmount} rotations from ${excessDealer.name} to ${deficitDealer.name}`,
      )

      let transferredCount = 0
      for (let i = 0; i < timeSlots.length && transferredCount < transferAmount && excessAmount > 0; i++) {
        const slot = timeSlots[i].time
        const excessAssignment = schedule[slot][excessDealer.id]
        const deficitAssignment = schedule[slot][deficitDealer.id]

        if (excessAssignment && excessAssignment !== "BREAK" && deficitAssignment === "BREAK") {
          if (deficitDealer.available_tables.includes(excessAssignment)) {
            let noConsecutiveForExcess = true
            if (i > 0 && schedule[timeSlots[i - 1].time][excessDealer.id] === "BREAK") noConsecutiveForExcess = false
            if (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][excessDealer.id] === "BREAK")
              noConsecutiveForExcess = false

            let noConsecutiveTableForDeficit = true
            if (i > 0 && schedule[timeSlots[i - 1].time][deficitDealer.id] === excessAssignment)
              noConsecutiveTableForDeficit = false
            if (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][deficitDealer.id] === excessAssignment)
              noConsecutiveTableForDeficit = false

            if (noConsecutiveForExcess && noConsecutiveTableForDeficit) {
              schedule[slot][deficitDealer.id] = excessAssignment
              schedule[slot][excessDealer.id] = "BREAK"

              const deficitStats = dealerAssignments[deficitDealer.id]
              deficitStats.rotations++
              deficitStats.breaks--
              deficitStats.assignedTables.add(excessAssignment)
              const bpIdxDef = deficitStats.breakPositions.indexOf(i)
              if (bpIdxDef > -1) deficitStats.breakPositions.splice(bpIdxDef, 1)

              const excessStats = dealerAssignments[excessDealer.id]
              excessStats.rotations--
              excessStats.breaks++
              excessStats.breakPositions.push(i)
              excessStats.breakPositions.sort((a, b) => a - b)

              transferredCount++
              deficitAmount--
              excessAmount--
              console.log(`    Transferred rotation at ${timeSlots[i].formattedTime}`)
            }
          }
        }
      }
      if (transferredCount > 0) {
        console.log(`  Successfully transferred ${transferredCount} rotations`)
      }
      if (deficitAmount <= 0) break
    }
  }
}
