import type { Dealer, SchedulePreferences, DealerWithTables, ScheduleData, DealerAssignment } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTimeSlots, validateSchedule } from "./utils"
import {
  getDealerAvailableTables,
  calculateScheduleParameters,
  initializeDealerAssignments,
} from "./workload-calculator"
import { scheduleBreaks } from "./break-scheduler"
import { ensureCompleteAssignments, fixConsecutiveTableAssignments } from "./slot-filler"
import { resolveRotationsForSlot } from "./rotation-resolver"
import { validateAndFixBreaks, redistributeBreaksEvenly } from "./break-validator"
import { validateAndFixRotations } from "./rotation-validator"
import type { TimeSlot } from "../scheduler-types"
import { SCHEDULER_CONFIG } from "./config"

/**
 * Генерира график за дилъри с подобрен алгоритъм за ротация
 */
export async function generateSchedule(
  dealersInput: Dealer[], // Преименувано за яснота
  shiftType: "day" | "night",
  supabaseClient: SupabaseClient,
  preferences?: SchedulePreferences,
): Promise<ScheduleData> {
  console.log(
    `[generateSchedule] Starting schedule generation for ${dealersInput.length} dealers, shift: ${shiftType}.`,
  )
  try {
    const timeSlots = generateTimeSlots(shiftType)
    const schedule: ScheduleData = {}
    timeSlots.forEach((slot) => {
      schedule[slot.time] = {}
    })

    if (dealersInput.length === 0) {
      console.warn("[generateSchedule] Input dealers array is empty. Returning empty schedule.")
      return schedule
    }

    console.log("[generateSchedule] Fetching available tables for each dealer...")
    const dealersWithTables = await Promise.all(
      dealersInput.map(async (dealerObj) => {
        // Уверете се, че dealerObj има поне id и name за getDealerAvailableTables
        const dealer = dealerObj as DealerWithTables // Кастване за нуждите на getDealerAvailableTables
        const fetchedAvailableTables = await getDealerAvailableTables(dealer, supabaseClient)
        return {
          ...dealerObj, // Запазваме оригиналния обект
          available_tables: fetchedAvailableTables, // Добавяме/обновяваме само това поле
        } as DealerWithTables
      }),
    )
    console.log(
      `[generateSchedule] Fetched available tables. Data: ${JSON.stringify(
        dealersWithTables.map((d) => ({ id: d.id, name: d.name, available_tables: d.available_tables })),
      )}`,
    )

    const eligibleDealers = dealersWithTables.filter(
      (dealer) => dealer.available_tables && dealer.available_tables.length > 0,
    )
    console.log(`[generateSchedule] Found ${eligibleDealers.length} eligible dealers with available tables.`)

    if (eligibleDealers.length === 0) {
      console.warn(
        "[generateSchedule] No eligible dealers found after fetching and filtering available tables. Returning empty schedule.",
      )
      // Връщаме празен график, но с информация за предпочитанията, ако има такива,
      // за да може UI да покаже поне тях, ако е нужно.
      if (preferences) {
        ;(schedule as any)._preferences = preferences
      }
      return schedule
    }

    const allTables = new Set<string>()
    eligibleDealers.forEach((dealer) => dealer.available_tables.forEach((table) => allTables.add(table)))
    const uniqueTables = Array.from(allTables)
    console.log(`[generateSchedule] Unique tables for this schedule: ${uniqueTables.join(", ")}`)

    if (uniqueTables.length === 0) {
      console.warn(
        "[generateSchedule] No unique tables found among eligible dealers. This usually means no dealers can work any tables. Returning empty schedule.",
      )
      if (preferences) {
        ;(schedule as any)._preferences = preferences
      }
      return schedule
    }

    const params = calculateScheduleParameters(uniqueTables, eligibleDealers)
    const dealerAssignments = initializeDealerAssignments(eligibleDealers, params)

    // Стъпка 1: Първоначално планиране на почивките (скелет)
    console.log("[generateSchedule] Scheduling initial breaks...")
    scheduleBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments, preferences)

    // Стъпка 2: Решаване на ротациите слот по слот (НОВАТА ЛОГИКА)
    console.log("[generateSchedule] Resolving rotations slot by slot...")
    for (let i = 0; i < timeSlots.length; i++) {
      resolveRotationsForSlot(i, timeSlots, schedule, eligibleDealers, dealerAssignments, uniqueTables)
    }

    // Стъпка 3: Гарантиране, че всички слотове са запълнени и преизчисляване на статистики
    console.log("[generateSchedule] Ensuring complete assignments (post-rotation-resolver)...")
    ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)

    // Стъпка 4: Итеративен процес на подобряване
    console.log("[generateSchedule] Starting refinement iterations...")
    for (let i = 0; i < SCHEDULER_CONFIG.MAX_REFINEMENT_ITERATIONS; i++) {
      console.log(`[generateSchedule] Refinement iteration ${i + 1}/${SCHEDULER_CONFIG.MAX_REFINEMENT_ITERATIONS}`)

      validateAndFixBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments as Record<string, DealerAssignment>)
      validateAndFixRotations(
        eligibleDealers,
        timeSlots,
        schedule,
        dealerAssignments as Record<string, DealerAssignment>,
      )
      fixConsecutiveTableAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)
      balanceRotationsAndBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments, params)
      redistributeBreaksEvenly(
        eligibleDealers,
        timeSlots,
        schedule,
        dealerAssignments as Record<string, DealerAssignment>,
      )
      ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments) // Важно след всяка итерация

      const validation = validateSchedule(schedule, dealerAssignments, timeSlots, eligibleDealers)
      if (validation.valid) {
        console.log(`[generateSchedule] Schedule is valid after ${i + 1} iterations.`)
        break
      } else {
        console.warn(
          `[generateSchedule] Schedule still has issues after iteration ${i + 1}:`,
          validation.errors.slice(0, 5),
        ) // Показваме само първите 5 грешки
      }
      if (i === SCHEDULER_CONFIG.MAX_REFINEMENT_ITERATIONS - 1) {
        console.warn("[generateSchedule] Max refinement iterations reached.")
      }
    }

    const finalValidation = validateSchedule(schedule, dealerAssignments, timeSlots, eligibleDealers)
    if (!finalValidation.valid) {
      console.warn("[generateSchedule] Schedule still has issues after refinement. Applying aggressive balancing.")
      aggressiveBalancing(eligibleDealers, timeSlots, schedule, dealerAssignments, params)
      ensureCompleteAssignments(eligibleDealers, timeSlots, schedule, dealerAssignments)
      const postAggressiveValidation = validateSchedule(schedule, dealerAssignments, timeSlots, eligibleDealers)
      console.log(
        `[generateSchedule] Validation after aggressive balancing: valid=${postAggressiveValidation.valid}, errors=${JSON.stringify(postAggressiveValidation.errors.slice(0, 5))}`,
      )
    }

    // Извеждане на статистика
    console.log("[generateSchedule] Final dealer statistics:")
    console.log(
      "NAME | ROTATIONS | BREAKS | UNIQUE TABLES (WORKED) | TARGET R/B | TABLES IN CURR SEGMENT | IS FIRST SEG",
    )
    console.log("-".repeat(100))
    eligibleDealers.forEach((dealer) => {
      const stats = dealerAssignments[dealer.id]
      if (!stats) {
        console.error(
          `[generateSchedule] Stats not found for dealer ${dealer.name} (ID: ${dealer.id}) during final logging.`,
        )
        return
      }
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

    // Добавяме предпочитанията към крайния обект, ако съществуват
    if (preferences) {
      ;(schedule as any)._preferences = preferences
    }

    console.log("[generateSchedule] Schedule generation finished.")
    return schedule
  } catch (error: any) {
    console.error("[generateSchedule] Critical error during schedule generation:", error.message, error.stack)
    // Връщаме празен график в случай на критична грешка, за да не се счупи UI
    const emptySchedule: ScheduleData = {}
    if (preferences) {
      ;(emptySchedule as any)._preferences = preferences
    }
    return emptySchedule
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
      if (!stats) continue // Предпазна проверка
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
      // Опростена логика за избор на маса, за да се избегне зацикляне
      if (prevTable === selectedTable && availableTables.length > 1) {
        schedule[timeSlot][dealer.id] = availableTables.find((t) => t !== selectedTable) || selectedTable
      } else {
        schedule[timeSlot][dealer.id] = selectedTable
      }

      assignments.rotations++
      assignments.breaks--
      assignments.assignedTables.add(schedule[timeSlot][dealer.id])
      const bpIndex = assignments.breakPositions.indexOf(breakIndex)
      if (bpIndex > -1) assignments.breakPositions.splice(bpIndex, 1)
      // tablesInCurrentWorkSegment ще се обнови от основния цикъл
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

  // Приоритет на ротации, които не са част от дълъг работен сегмент
  rotationSlotsIndices.sort((a, b) => {
    let scoreA = 0
    let scoreB = 0
    // Логика за оценка на "маловажността" на ротацията - напр. къси сегменти, по-малко уникални маси и т.н.
    // Засега проста сортировка по средата на смяната
    scoreA = Math.abs(a - timeSlots.length / 2)
    scoreB = Math.abs(b - timeSlots.length / 2)
    return scoreA - scoreB // Предпочитаме ротации по-близо до краищата
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
      assignments.assignedTables.delete(removedTable) // Премахваме от общо отработените, ако вече не се работи на нея
      // Проверка дали масата все още се работи от дилъра в друг слот
      let stillWorksTable = false
      for (let k = 0; k < timeSlots.length; k++) {
        if (schedule[timeSlots[k].time][dealer.id] === removedTable) {
          stillWorksTable = true
          break
        }
      }
      if (!stillWorksTable) assignments.assignedTables.delete(removedTable)

      assignments.breakPositions.push(rotationIndex)
      assignments.breakPositions.sort((a, b) => a - b)
      // tablesInCurrentWorkSegment ще се обнови от основния цикъл
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
    (d) => dealerAssignments[d.id] && dealerAssignments[d.id].rotations > dealerAssignments[d.id].targetRotations,
  )
  const dealersWithDeficit = eligibleDealers.filter(
    (d) => dealerAssignments[d.id] && dealerAssignments[d.id].rotations < dealerAssignments[d.id].targetRotations,
  )

  for (const excessDealer of dealersWithExcess) {
    const excessStats = dealerAssignments[excessDealer.id]
    if (!excessStats) continue
    let excessAmount = excessStats.rotations - excessStats.targetRotations
    if (excessAmount <= 0) continue

    for (const deficitDealer of dealersWithDeficit) {
      const deficitStats = dealerAssignments[deficitDealer.id]
      if (!deficitStats) continue
      const deficitAmount = deficitStats.targetRotations - deficitStats.rotations
      if (deficitAmount <= 0) continue

      const swapsToAttempt = Math.min(excessAmount, deficitAmount)
      let swapsMade = 0

      for (let i = 0; i < timeSlots.length && swapsMade < swapsToAttempt && excessAmount > 0; i++) {
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

              excessStats.rotations--
              excessStats.breaks++
              excessStats.breakPositions.push(i)
              excessStats.breakPositions.sort((a, b) => a - b)
              // assignedTables за excessDealer не се променя директно тук, тъй като може да работи на масата в друг слот

              deficitStats.rotations++
              deficitStats.breaks--
              deficitStats.assignedTables.add(excessAssignment)
              const bpIdx = deficitStats.breakPositions.indexOf(i)
              if (bpIdx > -1) deficitStats.breakPositions.splice(bpIdx, 1)

              swapsMade++
              excessAmount--
            }
          }
        }
      }
      if (excessAmount <= 0) break // Преминаваме към следващия excessDealer
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
  console.log("[aggressiveBalancing] Starting aggressive balancing...")

  const dealersWithLargeDeficit = eligibleDealers.filter((dealer) => {
    const stats = dealerAssignments[dealer.id]
    return stats && stats.targetRotations - stats.rotations > SCHEDULER_CONFIG.LARGE_DIFFERENCE_THRESHOLD
  })

  const dealersWithLargeExcess = eligibleDealers.filter((dealer) => {
    const stats = dealerAssignments[dealer.id]
    return stats && stats.rotations - stats.targetRotations > SCHEDULER_CONFIG.LARGE_DIFFERENCE_THRESHOLD
  })

  console.log(`[aggressiveBalancing] Found ${dealersWithLargeDeficit.length} dealers with large rotation deficit`)
  console.log(`[aggressiveBalancing] Found ${dealersWithLargeExcess.length} dealers with large rotation excess`)

  if (dealersWithLargeDeficit.length === 0 && dealersWithLargeExcess.length === 0) {
    console.log("[aggressiveBalancing] No dealers with large differences found.")
    return
  }

  // Сортиране за приоритет
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
    const deficitStats = dealerAssignments[deficitDealer.id]
    if (!deficitStats) continue
    let deficitAmount = deficitStats.targetRotations - deficitStats.rotations
    if (deficitAmount <= 0) continue

    console.log(`[aggressiveBalancing] Dealer ${deficitDealer.name}, deficit: ${deficitAmount}`)

    for (const excessDealer of dealersWithLargeExcess) {
      const excessStats = dealerAssignments[excessDealer.id]
      if (!excessStats) continue
      let excessAmountCurrentLoop = excessStats.rotations - excessStats.targetRotations
      if (excessAmountCurrentLoop <= 0) continue

      const transferAmountLimit = Math.min(deficitAmount, excessAmountCurrentLoop)
      let transferredInThisPairing = 0

      console.log(
        `  Trying to transfer from ${excessDealer.name} (excess: ${excessAmountCurrentLoop}) for ${transferAmountLimit} slots`,
      )

      for (
        let i = 0;
        i < timeSlots.length &&
        transferredInThisPairing < transferAmountLimit &&
        excessAmountCurrentLoop > 0 &&
        deficitAmount > 0;
        i++
      ) {
        const slot = timeSlots[i].time
        const excessAssignment = schedule[slot][excessDealer.id]
        const deficitAssignment = schedule[slot][deficitDealer.id]

        if (excessAssignment && excessAssignment !== "BREAK" && deficitAssignment === "BREAK") {
          if (deficitDealer.available_tables.includes(excessAssignment)) {
            const noConsecutiveForExcess = !(
              (i > 0 && schedule[timeSlots[i - 1].time][excessDealer.id] === "BREAK") ||
              (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][excessDealer.id] === "BREAK")
            )
            const noConsecutiveTableForDeficit = !(
              (i > 0 && schedule[timeSlots[i - 1].time][deficitDealer.id] === excessAssignment) ||
              (i < timeSlots.length - 1 && schedule[timeSlots[i + 1].time][deficitDealer.id] === excessAssignment)
            )

            if (noConsecutiveForExcess && noConsecutiveTableForDeficit) {
              schedule[slot][deficitDealer.id] = excessAssignment
              schedule[slot][excessDealer.id] = "BREAK"

              deficitStats.rotations++
              deficitStats.breaks--
              deficitStats.assignedTables.add(excessAssignment)
              const bpIdxDef = deficitStats.breakPositions.indexOf(i)
              if (bpIdxDef > -1) deficitStats.breakPositions.splice(bpIdxDef, 1)

              excessStats.rotations--
              excessStats.breaks++
              excessStats.breakPositions.push(i)
              excessStats.breakPositions.sort((a, b) => a - b)

              transferredInThisPairing++
              deficitAmount--
              excessAmountCurrentLoop-- // Намаляваме текущия излишък за този дилър
              console.log(
                `    Transferred at ${timeSlots[i].formattedTime}. ${deficitDealer.name} now ${deficitStats.rotations}/${deficitStats.targetRotations}. ${excessDealer.name} now ${excessStats.rotations}/${excessStats.targetRotations}`,
              )
            }
          }
        }
      }
      if (transferredInThisPairing > 0) {
        console.log(
          `  Transferred ${transferredInThisPairing} from ${excessDealer.name} to ${deficitDealer.name}. Deficit remaining: ${deficitAmount}`,
        )
      }
      if (deficitAmount <= 0) break // Дефицитът на текущия дилър е запълнен
    }
  }
  console.log("[aggressiveBalancing] Finished.")
}
