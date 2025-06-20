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
  BREAK_DEFICIT: 20, // По-голяма тежест за тези, които изостават с почивките
  RANDOM_FACTOR_RANGE: 5, // Малък диапазон за разбъркване
}

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

  const dealerState = initializeDealerState(eligibleDealers, params)

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
  const dealersToAssign = [...dealers]
  const tablesToCover = [...tables]

  // 1. Определяме кои дилъри ще почиват първи
  const dealersOnBreak: DealerWithTables[] = []
  const preferredFirstBreak = preferences?.firstBreakDealers || []

  // Добавяме тези с предпочитания
  preferredFirstBreak.forEach((dealerId) => {
    const dealer = dealers.find((d) => d.id === dealerId)
    if (dealer && dealersOnBreak.length < params.dealersOnBreakCount) {
      dealersOnBreak.push(dealer)
    }
  })

  // Допълваме до нужния брой почиващи, използвайки приоритет
  const remainingCandidates = dealers.filter((d) => !dealersOnBreak.find((db) => db.id === d.id))
  remainingCandidates.sort(
    (a, b) => calculateBreakPriority(b, state, params) - calculateBreakPriority(a, state, params),
  )

  let i = 0
  while (dealersOnBreak.length < params.dealersOnBreakCount && i < remainingCandidates.length) {
    dealersOnBreak.push(remainingCandidates[i])
    i++
  }

  // 2. Назначаваме почивките
  dealersOnBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
    updateDealerStateForSlot(dealer.id, "BREAK", 0, state)
  })

  // 3. Назначаваме останалите на маси
  const workingDealers = dealers.filter((d) => !slotAssignments[d.id])
  const availableTablesForFirstSlot = new Set(tables)

  workingDealers.forEach((dealer) => {
    const targetTable = findBestTableForDealer(dealer, availableTablesForFirstSlot, state, null) // null за previousAssignments, тъй като е първи слот
    if (targetTable) {
      slotAssignments[dealer.id] = targetTable
      availableTablesForFirstSlot.delete(targetTable)
      updateDealerStateForSlot(dealer.id, targetTable, 0, state)
    } else if (tablesToCover.length > 0) {
      // Fallback, ако findBestTableForDealer не върне нищо (не би трябвало)
      const table = tablesToCover.shift()!
      slotAssignments[dealer.id] = table
      updateDealerStateForSlot(dealer.id, table, 0, state)
    } else {
      slotAssignments[dealer.id] = "BREAK" // Ако няма маси, почива
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
  if (!dealerData) return -1 // Не трябва да се случва

  const slotsSince = dealerData.slotsSinceLastBreak
  const breakDeficit = dealerData.targetBreaks - dealerData.breaks
  const randomFactor = Math.floor(Math.random() * BREAK_PRIORITY_WEIGHTS.RANDOM_FACTOR_RANGE)

  let score = 0
  score += slotsSince * BREAK_PRIORITY_WEIGHTS.SLOTS_SINCE_LAST_BREAK
  score += Math.max(0, breakDeficit) * BREAK_PRIORITY_WEIGHTS.BREAK_DEFICIT // Само положителен дефицит (т.е. изоставане)

  // Ако дилърът е взел повече почивки от целевите, намаляваме приоритета му
  if (breakDeficit < 0) {
    score += breakDeficit * BREAK_PRIORITY_WEIGHTS.BREAK_DEFICIT * 2 // Двойно наказание за излишък
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
) {
  const slotAssignments: Record<string, string> = {}
  const previousAssignments = schedule[previousSlot.time]

  // 1. Determine who goes on a planned break
  const potentialBreakCandidates = dealers.filter(
    (d) => previousAssignments[d.id] && previousAssignments[d.id] !== "BREAK",
  )
  potentialBreakCandidates.sort(
    (a, b) => calculateBreakPriority(b, state, params) - calculateBreakPriority(a, state, params),
  )
  const dealersGoingToPlannedBreak = potentialBreakCandidates.slice(0, params.dealersOnBreakCount)

  dealersGoingToPlannedBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
  })

  // 2. Identify dealers who will be active (either returning or continuing)
  const returningDealers = dealers.filter((d) => previousAssignments[d.id] === "BREAK")
  const continuingDealers = dealers.filter(
    (d) =>
      previousAssignments[d.id] &&
      previousAssignments[d.id] !== "BREAK" &&
      !dealersGoingToPlannedBreak.find((bDealer) => bDealer.id === d.id),
  )

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
    // Sort by break priority: those with higher priority take the additional break.
    const sortedActiveDealers = [...potentiallyActiveDealers].sort(
      (a, b) => calculateBreakPriority(b, state, params) - calculateBreakPriority(a, state, params),
    )

    const numToWork = tables.length

    for (let i = 0; i < sortedActiveDealers.length; i++) {
      if (dealersWhoWillWorkOnTables.length < numToWork) {
        dealersWhoWillWorkOnTables.push(sortedActiveDealers[i])
      } else {
        dealersGoingToAdditionalBreak.push(sortedActiveDealers[i])
      }
    }
    // Re-sort dealersWhoWillWorkOnTables to a more natural order if needed, e.g., by name or original order
    // For now, the order from sort (lowest break priority first) is fine.
  }

  dealersGoingToAdditionalBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
  })

  // 4. Assign tables to dealersWhoWillWorkOnTables
  // Optional: Sort dealersWhoWillWorkOnTables, e.g., to prioritize returning dealers for table choice,
  // or maintain a consistent order. For now, using the order determined above.
  // Example: prioritize returning dealers
  dealersWhoWillWorkOnTables.sort((a, b) => {
    const aIsReturning = returningDealers.some((rd) => rd.id === a.id)
    const bIsReturning = returningDealers.some((rd) => rd.id === b.id)
    if (aIsReturning && !bIsReturning) return -1
    if (!aIsReturning && bIsReturning) return 1
    // Could add secondary sort, e.g. by name for consistency if priorities are equal
    // return a.name.localeCompare(b.name);
    return 0
  })

  // В функцията generateSlot, преди цикъла за назначаване на маси на dealersWhoWillWorkOnTables:

  // Пример за разбъркване на реда на dealersWhoWillWorkOnTables,
  // но запазване на приоритета на връщащите се от почивка да са в началото, ако има такива.
  const finalWorkersForTableAssignment = [...dealersWhoWillWorkOnTables]
  // Разделяме на връщащи се и продължаващи
  const returningToWork = finalWorkersForTableAssignment.filter((d) => state[d.id]?.isReturningFromBreak)
  const continuingToWork = finalWorkersForTableAssignment.filter((d) => !state[d.id]?.isReturningFromBreak)

  // Разбъркваме продължаващите
  for (let i = continuingToWork.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[continuingToWork[i], continuingToWork[j]] = [continuingToWork[j], continuingToWork[i]]
  }
  // Събираме ги отново, като връщащите се са първи (за да имат по-добър избор, ако това е желано)
  const shuffledWorkers = [...returningToWork, ...continuingToWork]

  // След това използвайте shuffledWorkers в цикъла:
  // shuffledWorkers.forEach((dealer) => { ... });
  // Вместо:
  // dealersWhoWillWorkOnTables.forEach((dealer) => { ... });
  // Не забравяйте да замените dealersWhoWillWorkOnTables със shuffledWorkers в цикъла.

  const assignmentSource = shuffledWorkers

  assignmentSource.forEach((dealer) => {
    // Ensure dealer is not already assigned a break (should be covered by logic above)
    if (slotAssignments[dealer.id] === "BREAK") return

    const targetTable = findBestTableForDealer(dealer, availableTablesForSlot, state, previousAssignments)

    if (targetTable) {
      slotAssignments[dealer.id] = targetTable
      availableTablesForSlot.delete(targetTable)
    } else {
      console.error(
        `CRITICAL: No suitable table found for dealer ${dealer.name} (ID: ${dealer.id}) in slot ${currentSlot.formattedTime}, even with fallbacks. Available tables count: ${availableTablesForSlot.size}. This indicates a potential issue in table availability or selection logic. Assigning ERROR_NO_TABLES.`,
      )
      slotAssignments[dealer.id] = "ERROR_NO_TABLES"
    }
  })

  // 5. Finalize assignments for the slot and update dealer states
  schedule[currentSlot.time] = slotAssignments
  const currentSlotIndex = timeSlots.findIndex((ts) => ts.time === currentSlot.time)

  dealers.forEach((dealer) => {
    const assignment = slotAssignments[dealer.id]
    if (assignment) {
      updateDealerStateForSlot(dealer.id, assignment, currentSlotIndex, state)
    } else {
      // This dealer was not assigned anything: not a planned break, not an additional break, not a table.
      // This implies they are surplus for this slot (e.g., total dealers > tables + planned breaks + additional breaks).
      // Treat them as being on break for state tracking.
      if (previousAssignments[dealer.id] !== undefined) {
        // Only log if they were present in the previous slot
        console.warn(
          `Dealer ${dealer.name} (ID: ${dealer.id}) was not assigned in slot ${currentSlot.formattedTime} and was present previously. Treating as BREAK for state.`,
        )
      }
      updateDealerStateForSlot(dealer.id, "BREAK", currentSlotIndex, state)
      schedule[currentSlot.time][dealer.id] = "BREAK" // Ensure they are marked as BREAK in schedule data
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
  previousAssignments: Record<string, string> | null, // Назначенията от предходния слот
): string | null {
  const dealerState = state[dealer.id]
  const lastWorkedTableByDealer = dealerState.lastTable // Последната маса, на която ТОЗИ дилър е работил (може да е от преди няколко слота, ако е бил в почивка)
  const tableWorkedInPrevSlotByDealer = previousAssignments ? previousAssignments[dealer.id] : null // Масата, на която е бил в ПРЕДНИЯ слот

  const scoredTables: { table: string; score: number }[] = []

  for (const table of availableTables) {
    // Абсолютно правило: НЕ може да е същата маса като в ПРЕДНИЯ слот, ако е работил тогава
    if (
      tableWorkedInPrevSlotByDealer &&
      table === tableWorkedInPrevSlotByDealer &&
      tableWorkedInPrevSlotByDealer !== "BREAK"
    ) {
      continue // Пропускаме тази маса
    }

    let score = 1000 // Базова висока оценка

    // Наказание за скорошно работени маси от историята
    dealerState.tableHistory.forEach((historicalTable, index) => {
      if (table === historicalTable) {
        // Увеличете базовото наказание или променете начина, по който намалява с индекса
        score -= 400 / (index + 1) // Пример: увеличено базово наказание
        // или score -= 500 * Math.pow(0.7, index) // Пример: по-рязко намаляващо наказание
      }
    })

    // Малък бонус, ако масата е от тип, на който дилърът може да работи, но не е в историята му скоро
    if (!dealerState.tableHistory.includes(table) && dealer.available_tables?.includes(table)) {
      // Добавена проверка дали дилърът по принцип може да работи на тази маса
      score += 100 // Пример: увеличен бонус
    }

    // Добавете и бонус, ако масата не е била работена от ТОЗИ дилър изобщо през смяната (ако assignedTables не я съдържа)
    if (!dealerState.assignedTables.has(table) && dealer.available_tables?.includes(table)) {
      score += 150 // Допълнителен силен бонус за напълно нова маса за смяната
    }

    // Бонус, ако масата е различна от последната работена от дилъра (lastTable)
    if (lastWorkedTableByDealer && table !== lastWorkedTableByDealer) {
      score += 20
    }

    if (score > 0) {
      // Добавяме само ако има положителен резултат след наказанията
      scoredTables.push({ table, score })
    }
  }

  if (scoredTables.length === 0) {
    // Fallback: ако всички налични маси са силно наказани (напр. всички са били работени много скоро)
    // Взимаме първата налична, която НЕ Е същата като в предния слот
    const fallbackCandidates = Array.from(availableTables).filter(
      (t) =>
        tableWorkedInPrevSlotByDealer &&
        t !== tableWorkedInPrevSlotByDealer &&
        tableWorkedInPrevSlotByDealer !== "BREAK",
    )
    if (fallbackCandidates.length > 0) return fallbackCandidates[0]
    return Array.from(availableTables)[0] || null // Абсолютен fallback
  }

  scoredTables.sort((a, b) => b.score - a.score) // Сортираме по най-висока оценка
  return scoredTables[0].table
}
