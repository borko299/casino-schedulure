import type {
  DealerWithTables,
  TimeSlot,
  ScheduleData,
  DealerAssignment,
  ScheduleParameters,
  SchedulePreferences,
} from "./types"
import { initializeDealerState, updateDealerStateForSlot } from "./dealer-state"
// import { timeSlots } from "./some-module" // Declare or import the timeSlots variable

const BREAK_PRIORITY_WEIGHTS = {
  SLOTS_SINCE_LAST_BREAK: 10,
  BREAK_DEFICIT: 20,
  RANDOM_FACTOR_RANGE: 5,
}

const PUNISHMENT_BREAK_PRIORITY = -1000000 // Effectively ensures they are not chosen for break

/**
 * Основна функция, която имплементира новата логика с верижна ротация.
 */
export function generateChainRotationSchedule(
  eligibleDealers: DealerWithTables[],
  uniqueTables: string[],
  timeSlots: TimeSlot[],
  params: ScheduleParameters,
  preferences?: SchedulePreferences,
): ScheduleData {
  const schedule: ScheduleData = {}
  timeSlots.forEach((slot) => (schedule[slot.time] = {}))

  // Pass preferences to initializeDealerState
  const dealerState = initializeDealerState(eligibleDealers, params, preferences)

  // Слот 0: Инициализация
  initializeFirstSlot(schedule, timeSlots[0], eligibleDealers, uniqueTables, dealerState, params, preferences)

  // Слотове от 1 до края: Верижна ротация
  for (let i = 1; i < timeSlots.length; i++) {
    generateSlot(
      schedule,
      timeSlots[i],
      timeSlots[i - 1],
      eligibleDealers,
      uniqueTables,
      dealerState,
      params,
      timeSlots,
      preferences, // Pass preferences
    )
  }

  return schedule
}

/**
 * Инициализира първия слот, тъй като няма предишен, на който да се базира.
 */
function initializeFirstSlot(
  schedule: ScheduleData,
  firstSlot: TimeSlot,
  dealers: DealerWithTables[],
  tables: string[],
  state: Record<string, DealerAssignment>,
  params: ScheduleParameters,
  preferences?: SchedulePreferences,
) {
  const slotAssignments: Record<string, string> = {}
  // const dealersToAssign = [...dealers] // Not directly used like this anymore
  const tablesToCover = [...tables]

  // 1. Определяме кои дилъри ще почиват първи
  const dealersOnBreak: DealerWithTables[] = []

  // Filter out punished dealers from break consideration initially
  const nonPunishedDealers = dealers.filter(
    (d) => !(state[d.id].isUnderPunishment && !state[d.id].hasCompletedPunishment),
  )

  const preferredFirstBreakDealerIds =
    preferences?.firstBreakPreferences
      ?.filter((p) => !(p.punishment?.isActive && p.reason === "late_for_table")) // Exclude those with active punishment from *preferred* break
      .map((p) => p.dealerId) || []

  // Add those with preferences (and not under active punishment for this preference)
  preferredFirstBreakDealerIds.forEach((dealerId) => {
    const dealer = nonPunishedDealers.find((d) => d.id === dealerId)
    if (dealer && dealersOnBreak.length < params.dealersOnBreakCount) {
      dealersOnBreak.push(dealer)
    }
  })

  // Допълваме до нужния брой почиващи, използвайки приоритет, from non-punished and non-preferred
  const remainingCandidatesForBreak = nonPunishedDealers.filter((d) => !dealersOnBreak.find((db) => db.id === d.id))
  remainingCandidatesForBreak.sort(
    (a, b) => calculateBreakPriority(b, state, params) - calculateBreakPriority(a, state, params),
  )

  let i = 0
  while (dealersOnBreak.length < params.dealersOnBreakCount && i < remainingCandidatesForBreak.length) {
    dealersOnBreak.push(remainingCandidatesForBreak[i])
    i++
  }

  // 2. Назначаваме почивките
  dealersOnBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
    updateDealerStateForSlot(dealer.id, "BREAK", 0, state)
  })

  // 3. Назначаваме останалите на маси (including punished dealers)
  const workingDealers = dealers.filter((d) => !slotAssignments[d.id])
  const availableTablesForFirstSlot = new Set(tables)

  workingDealers.forEach((dealer) => {
    const targetTable = findBestTableForDealer(dealer, availableTablesForFirstSlot, state, null)
    if (targetTable) {
      slotAssignments[dealer.id] = targetTable
      availableTablesForFirstSlot.delete(targetTable)
      updateDealerStateForSlot(dealer.id, targetTable, 0, state)
    } else if (tablesToCover.length > 0) {
      const table = tablesToCover.shift()! // Should always have a table if tablesToCover > 0
      slotAssignments[dealer.id] = table
      updateDealerStateForSlot(dealer.id, table, 0, state)
    } else {
      // This case should ideally not happen if D > T. If it does, surplus dealers (even punished) might get a break.
      // This needs careful handling if params.dealersOnBreakCount was already met.
      // For now, if no tables, they get a break.
      console.warn(
        `[initializeFirstSlot] No table for dealer ${dealer.name} (ID: ${dealer.id}), assigning BREAK. Punished: ${state[dealer.id].isUnderPunishment}`,
      )
      slotAssignments[dealer.id] = "BREAK"
      updateDealerStateForSlot(dealer.id, "BREAK", 0, state)
    }
  })

  schedule[firstSlot.time] = slotAssignments
}

/**
 * Изчислява приоритет за почивка на дилър.
 */
function calculateBreakPriority(
  dealer: DealerWithTables,
  state: Record<string, DealerAssignment>,
  params: ScheduleParameters,
): number {
  const dealerData = state[dealer.id]
  if (!dealerData) return -1

  // If dealer is under punishment and hasn't completed it, they have lowest priority for break
  if (dealerData.isUnderPunishment && !dealerData.hasCompletedPunishment) {
    return PUNISHMENT_BREAK_PRIORITY + (dealerData.punishmentTablesWorked || 0) // Small increment to differentiate if needed, but still very low
  }

  const slotsSince = dealerData.slotsSinceLastBreak
  const breakDeficit = dealerData.targetBreaks - dealerData.breaks
  const randomFactor = Math.floor(Math.random() * BREAK_PRIORITY_WEIGHTS.RANDOM_FACTOR_RANGE)

  let score = 0
  score += slotsSince * BREAK_PRIORITY_WEIGHTS.SLOTS_SINCE_LAST_BREAK
  score += Math.max(0, breakDeficit) * BREAK_PRIORITY_WEIGHTS.BREAK_DEFICIT

  if (breakDeficit < 0) {
    score += breakDeficit * BREAK_PRIORITY_WEIGHTS.BREAK_DEFICIT * 2
  }

  score += randomFactor
  return score
}

/**
 * Генерира назначенията за един времеви слот, използвайки верижна ротация.
 */
function generateSlot(
  schedule: ScheduleData,
  currentSlot: TimeSlot,
  previousSlot: TimeSlot,
  dealers: DealerWithTables[],
  tables: string[],
  state: Record<string, DealerAssignment>,
  params: ScheduleParameters,
  timeSlots: TimeSlot[],
  preferences?: SchedulePreferences, // Added preferences
) {
  const slotAssignments: Record<string, string> = {}
  const previousAssignments = schedule[previousSlot.time]

  // 1. Determine who goes on a planned break
  // Filter out punished dealers from break consideration
  const potentialBreakCandidates = dealers.filter(
    (d) =>
      previousAssignments[d.id] &&
      previousAssignments[d.id] !== "BREAK" &&
      !(state[d.id].isUnderPunishment && !state[d.id].hasCompletedPunishment),
  )

  // Handle last break preferences
  const preferredLastBreakDealerIds = preferences?.lastBreakPreferences?.map((p) => p.dealerId) || []
  const dealersGoingToPlannedBreak: DealerWithTables[] = []

  // Prioritize dealers with last break preference if it's late in the shift
  const currentSlotIndex = timeSlots.findIndex((ts) => ts.time === currentSlot.time)
  const isLateShift = currentSlotIndex >= timeSlots.length - params.dealersOnBreakCount - 2 // Heuristic for "late"

  if (isLateShift) {
    preferredLastBreakDealerIds.forEach((dealerId) => {
      const dealer = potentialBreakCandidates.find((d) => d.id === dealerId)
      // Ensure they are not already on break and we haven't filled all break slots
      if (dealer && dealersGoingToPlannedBreak.length < params.dealersOnBreakCount) {
        const alreadyTakingBreak = dealersGoingToPlannedBreak.some((bDealer) => bDealer.id === dealer.id)
        if (!alreadyTakingBreak) {
          dealersGoingToPlannedBreak.push(dealer)
        }
      }
    })
  }

  // Fill remaining break slots based on priority
  const remainingCandidatesForBreak = potentialBreakCandidates.filter(
    (d) => !dealersGoingToPlannedBreak.find((bDealer) => bDealer.id === d.id),
  )
  remainingCandidatesForBreak.sort(
    (a, b) => calculateBreakPriority(b, state, params) - calculateBreakPriority(a, state, params),
  )

  let i = 0
  while (dealersGoingToPlannedBreak.length < params.dealersOnBreakCount && i < remainingCandidatesForBreak.length) {
    dealersGoingToPlannedBreak.push(remainingCandidatesForBreak[i])
    i++
  }

  dealersGoingToPlannedBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
  })

  // 2. Identify dealers who will be active (either returning or continuing, including punished)
  const returningDealers = dealers.filter((d) => previousAssignments[d.id] === "BREAK")
  const continuingDealers = dealers.filter(
    (d) =>
      previousAssignments[d.id] &&
      previousAssignments[d.id] !== "BREAK" &&
      !dealersGoingToPlannedBreak.find((bDealer) => bDealer.id === d.id),
  )

  // Punished dealers MUST continue if they were working, unless all tables are full by non-punished returning/continuing.
  // This part is complex. The current logic for `dealersWhoWillWorkOnTables` should handle it if punished dealers
  // are part of `continuingDealers` and have a very low break priority.

  const potentiallyActiveDealers = [...returningDealers, ...continuingDealers]

  returningDealers.forEach((d) => {
    if (state[d.id]) state[d.id].isReturningFromBreak = true
  })
  continuingDealers.forEach((d) => {
    if (state[d.id]) state[d.id].isReturningFromBreak = false
  })

  // 3. Determine who actually works on tables vs. takes additional breaks if not enough tables
  const availableTablesForSlot = new Set(tables)
  const dealersWhoWillWorkOnTables: DealerWithTables[] = []
  const dealersGoingToAdditionalBreak: DealerWithTables[] = []

  if (potentiallyActiveDealers.length <= tables.length) {
    dealersWhoWillWorkOnTables.push(...potentiallyActiveDealers)
  } else {
    // More potentially active dealers than tables. Some must take an additional break.
    // Sort by break priority: those with higher priority (less need for break, or punished) take the additional break.
    // Punished dealers should be at the end of this sort (lowest break priority).
    const sortedActiveDealers = [...potentiallyActiveDealers].sort(
      (a, b) => calculateBreakPriority(b, state, params) - calculateBreakPriority(a, state, params),
    ) // Higher score = higher priority TO WORK (less priority for break)

    const numToWork = tables.length

    for (let j = 0; j < sortedActiveDealers.length; j++) {
      const dealer = sortedActiveDealers[j]
      // Punished dealers should be prioritized to work if tables are available
      if (state[dealer.id].isUnderPunishment && !state[dealer.id].hasCompletedPunishment) {
        if (dealersWhoWillWorkOnTables.length < numToWork) {
          dealersWhoWillWorkOnTables.push(dealer)
        } else {
          // This case is problematic: a punished dealer needs to work but no tables.
          // This implies a flaw in D, T, or break count logic.
          // For now, they might be forced into an additional break if all tables are taken by higher priority (non-punished)
          dealersGoingToAdditionalBreak.push(dealer)
          console.warn(
            `[generateSlot] Punished dealer ${dealer.name} (ID: ${dealer.id}) forced to additional break due to no tables. This might be unexpected.`,
          )
        }
        continue // Process next dealer
      }

      // Non-punished dealers
      if (dealersWhoWillWorkOnTables.length < numToWork) {
        dealersWhoWillWorkOnTables.push(dealer)
      } else {
        dealersGoingToAdditionalBreak.push(dealer)
      }
    }
  }

  dealersGoingToAdditionalBreak.forEach((dealer) => {
    // Ensure not already assigned a planned break
    if (!slotAssignments[dealer.id]) {
      slotAssignments[dealer.id] = "BREAK"
    }
  })

  // 4. Assign tables to dealersWhoWillWorkOnTables
  dealersWhoWillWorkOnTables.sort((a, b) => {
    const aIsReturning = returningDealers.some((rd) => rd.id === a.id)
    const bIsReturning = returningDealers.some((rd) => rd.id === b.id)
    if (aIsReturning && !bIsReturning) return -1
    if (!aIsReturning && bIsReturning) return 1
    return 0
  })

  dealersWhoWillWorkOnTables.forEach((dealer) => {
    if (slotAssignments[dealer.id] === "BREAK") return // Already assigned a break (planned or additional)

    const targetTable = findBestTableForDealer(dealer, availableTablesForSlot, state, previousAssignments)

    if (targetTable) {
      slotAssignments[dealer.id] = targetTable
      availableTablesForSlot.delete(targetTable)
    } else {
      console.error(
        `CRITICAL: No suitable table found for dealer ${dealer.name} (ID: ${dealer.id}) in slot ${currentSlot.formattedTime}. Assigning ERROR_NO_TABLES. Punished: ${state[dealer.id].isUnderPunishment}`,
      )
      slotAssignments[dealer.id] = "ERROR_NO_TABLES"
    }
  })

  // 5. Finalize assignments for the slot and update dealer states
  schedule[currentSlot.time] = slotAssignments
  // const currentSlotIndex = timeSlots.findIndex(ts => ts.time === currentSlot.time); // Already calculated

  dealers.forEach((dealer) => {
    const assignment = slotAssignments[dealer.id]
    if (assignment) {
      updateDealerStateForSlot(dealer.id, assignment, currentSlotIndex, state)
    } else {
      // This dealer was not assigned anything. Treat as BREAK.
      // This can happen if D > T + dealersOnBreakCount
      if (!previousAssignments[dealer.id] || previousAssignments[dealer.id] !== "BREAK") {
        // Only log if they weren't already on break or new to schedule
        console.warn(
          `[generateSlot] Dealer ${dealer.name} (ID: ${dealer.id}) was not assigned in slot ${currentSlot.formattedTime}. Treating as BREAK. Punished: ${state[dealer.id].isUnderPunishment}`,
        )
      }
      updateDealerStateForSlot(dealer.id, "BREAK", currentSlotIndex, state)
      if (!schedule[currentSlot.time]) schedule[currentSlot.time] = {}
      schedule[currentSlot.time][dealer.id] = "BREAK"
    }
  })
}

/**
 * Намира най-добрата маса за дилър по принципа "най-отдавна неработена" и избягване на скорошни.
 */
function findBestTableForDealer(
  dealer: DealerWithTables,
  availableTables: Set<string>,
  state: Record<string, DealerAssignment>,
  previousAssignments: Record<string, string> | null,
): string | null {
  const dealerState = state[dealer.id]
  const lastWorkedTableByDealer = dealerState.lastTable
  const tableWorkedInPrevSlotByDealer = previousAssignments ? previousAssignments[dealer.id] : null

  const scoredTables: { table: string; score: number }[] = []

  for (const table of availableTables) {
    if (
      tableWorkedInPrevSlotByDealer &&
      table === tableWorkedInPrevSlotByDealer &&
      tableWorkedInPrevSlotByDealer !== "BREAK"
    ) {
      continue
    }

    let score = 1000

    dealerState.tableHistory.forEach((historicalTable, index) => {
      if (table === historicalTable) {
        score -= 200 / (index + 1)
      }
    })

    if (!dealerState.tableHistory.includes(table)) {
      score += 50
    }

    if (lastWorkedTableByDealer && table !== lastWorkedTableByDealer) {
      score += 20
    }

    // Ensure punished dealers don't get stuck if all tables are "bad" for them by history
    // Their need to work outweighs table rotation variety during punishment.
    if (dealerState.isUnderPunishment && !dealerState.hasCompletedPunishment) {
      // If score is too low due to history, give it a minimum positive score to be considered
      if (score < 100 && availableTables.size === 1)
        score = 100 // Ensure they get the last table
      else if (score < 100) score += 50 // Boost score slightly
    }

    if (score > 0) {
      scoredTables.push({ table, score })
    }
  }

  if (scoredTables.length === 0) {
    const fallbackCandidates = Array.from(availableTables).filter(
      (t) =>
        !(
          tableWorkedInPrevSlotByDealer &&
          t === tableWorkedInPrevSlotByDealer &&
          tableWorkedInPrevSlotByDealer !== "BREAK"
        ),
    )
    if (fallbackCandidates.length > 0) return fallbackCandidates[0]
    return Array.from(availableTables)[0] || null
  }

  scoredTables.sort((a, b) => b.score - a.score)
  return scoredTables[0].table
}
