import type {
  DealerWithTables,
  TimeSlot,
  ScheduleData,
  DealerAssignment,
  ScheduleParameters,
  SchedulePreferences,
} from "./types"
import { initializeDealerState, updateDealerStateForSlot } from "./dealer-state"

// Променени тежести за приоритет за почивка
const BREAK_PRIORITY_WEIGHTS = {
  SLOTS_SINCE_LAST_BREAK: 25, // Увеличена тежест
  BREAK_DEFICIT: 10, // Намалена тежест
  RANDOM_FACTOR_RANGE: 3, // Намален диапазон за случайност
  OPTIMAL_SLOTS_BONUS: 5, // Бонус ако е работил оптимален брой слотове
}

// Приблизителен оптимален брой слотове работа преди почивка
// Може да се изчисли по-динамично на база params, ако е нужно
const OPTIMAL_WORK_SLOTS_MIN = 2
const OPTIMAL_WORK_SLOTS_MAX = 3

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
  // console.log("Final Dealer States:", JSON.parse(JSON.stringify(dealerState)));
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
  // const tablesToCover = [...tables] // Не се използва директно по този начин вече

  // 1. Определяме кои дилъри ще почиват първи
  const dealersGoingOnBreakCount = params.dealersOnBreakCount
  const dealersOnBreak: DealerWithTables[] = []
  const preferredFirstBreak = preferences?.firstBreakDealers || []

  preferredFirstBreak.forEach((dealerId) => {
    const dealer = dealers.find((d) => d.id === dealerId)
    if (dealer && dealersOnBreak.length < dealersGoingOnBreakCount) {
      dealersOnBreak.push(dealer)
    }
  })

  const remainingCandidatesForBreak = dealers.filter((d) => !dealersOnBreak.find((db) => db.id === d.id))
  remainingCandidatesForBreak.sort(
    (a, b) => calculateBreakPriority(b, state, params, 0) - calculateBreakPriority(a, state, params, 0),
  )

  let i = 0
  while (dealersOnBreak.length < dealersGoingOnBreakCount && i < remainingCandidatesForBreak.length) {
    dealersOnBreak.push(remainingCandidatesForBreak[i])
    i++
  }

  // Ако няма достатъчно дилъри за всички маси + почивки, намаляваме броя на почиващите
  const workingDealerCount = dealers.length - dealersOnBreak.length
  if (workingDealerCount < tables.length && dealersOnBreak.length > 0) {
    const neededReduction = tables.length - workingDealerCount
    const actualReduction = Math.min(neededReduction, dealersOnBreak.length)
    // Премахваме дилъри от почивка, започвайки от тези с най-нисък приоритет за почивка (последните добавени)
    for (let k = 0; k < actualReduction; k++) {
      dealersOnBreak.pop()
    }
  }

  dealersOnBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
    // updateDealerStateForSlot(dealer.id, "BREAK", 0, state) // Ще се актуализира накрая за всички
  })

  // 3. Назначаваме останалите на маси
  const workingDealers = dealers.filter((d) => !slotAssignments[d.id])
  const availableTablesForFirstSlot = new Set(tables)

  // Разбъркваме работещите дилъри за по-голямо разнообразие при първоначалното разпределение
  for (let k = workingDealers.length - 1; k > 0; k--) {
    const l = Math.floor(Math.random() * (k + 1))
    ;[workingDealers[k], workingDealers[l]] = [workingDealers[l], workingDealers[k]]
  }

  workingDealers.forEach((dealer) => {
    if (availableTablesForFirstSlot.size === 0) {
      // console.warn(`No tables left for dealer ${dealer.name} in first slot. Assigning BREAK.`);
      slotAssignments[dealer.id] = "BREAK" // Ако няма свободни маси, почива
      return
    }
    const targetTable = findBestTableForDealer(dealer, availableTablesForFirstSlot, state, null, tables)
    if (targetTable) {
      slotAssignments[dealer.id] = targetTable
      availableTablesForFirstSlot.delete(targetTable)
    } else {
      // Fallback: ако findBestTableForDealer не върне нищо (не би трябвало при налични маси)
      // Това може да се случи, ако всички налични маси са недопустими за дилъра
      // console.warn(`Could not find optimal table for ${dealer.name} in first slot. Assigning first available or BREAK.`);
      const firstAvailable = Array.from(availableTablesForFirstSlot)[0]
      if (firstAvailable && dealer.available_tables?.includes(firstAvailable)) {
        slotAssignments[dealer.id] = firstAvailable
        availableTablesForFirstSlot.delete(firstAvailable)
      } else {
        slotAssignments[dealer.id] = "BREAK" // Ако няма подходящи маси, почива
      }
    }
  })

  // Уверяваме се, че всички дилъри имат назначение
  dealers.forEach((dealer) => {
    if (!slotAssignments[dealer.id]) {
      // console.log(`Dealer ${dealer.name} has no assignment in first slot. Assigning BREAK.`);
      slotAssignments[dealer.id] = "BREAK"
    }
    updateDealerStateForSlot(dealer.id, slotAssignments[dealer.id], 0, state)
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
  currentSlotIndex: number, // Добавен за по-точни изчисления
): number {
  const dealerData = state[dealer.id]
  if (!dealerData) return Number.NEGATIVE_INFINITY // Връщаме много ниска стойност, ако няма данни

  const slotsSince = dealerData.slotsSinceLastBreak
  const breakDeficit = dealerData.targetBreaks - dealerData.breaks
  const randomFactor = Math.floor(Math.random() * BREAK_PRIORITY_WEIGHTS.RANDOM_FACTOR_RANGE)

  let score = 0
  score += slotsSince * BREAK_PRIORITY_WEIGHTS.SLOTS_SINCE_LAST_BREAK

  // Дефицитът има значение, но не толкова голямо, колкото времето от последна почивка
  if (breakDeficit > 0) {
    score += breakDeficit * BREAK_PRIORITY_WEIGHTS.BREAK_DEFICIT
  } else if (breakDeficit < 0) {
    // Наказание за твърде много почивки
    score += breakDeficit * BREAK_PRIORITY_WEIGHTS.BREAK_DEFICIT * 1.5 // Леко увеличено наказание
  }

  // Бонус, ако е работил оптимален брой слотове
  if (slotsSince >= OPTIMAL_WORK_SLOTS_MIN && slotsSince <= OPTIMAL_WORK_SLOTS_MAX) {
    score += BREAK_PRIORITY_WEIGHTS.OPTIMAL_SLOTS_BONUS
  }
  // Допълнително силно увеличение на приоритета, ако е работил повече от максимално оптималните + 1
  if (slotsSince > OPTIMAL_WORK_SLOTS_MAX + 1) {
    score += BREAK_PRIORITY_WEIGHTS.SLOTS_SINCE_LAST_BREAK * 2 // Двоен бонус от основната тежест
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
  const currentSlotIndex = timeSlots.findIndex((ts) => ts.time === currentSlot.time)

  // 1. Determine who goes on a planned break
  const dealersWorkingInPrevSlot = dealers.filter(
    (d) =>
      previousAssignments[d.id] &&
      previousAssignments[d.id] !== "BREAK" &&
      previousAssignments[d.id] !== "ERROR_NO_TABLES",
  )

  dealersWorkingInPrevSlot.sort(
    (a, b) =>
      calculateBreakPriority(b, state, params, currentSlotIndex) -
      calculateBreakPriority(a, state, params, currentSlotIndex),
  )

  let numPlannedBreaks = params.dealersOnBreakCount
  // Ако има по-малко работещи дилъри от броя на планираните почивки, намаляваме броя на почивките
  if (dealersWorkingInPrevSlot.length < numPlannedBreaks) {
    numPlannedBreaks = dealersWorkingInPrevSlot.length
  }

  const dealersGoingToPlannedBreak = dealersWorkingInPrevSlot.slice(0, numPlannedBreaks)

  dealersGoingToPlannedBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
  })

  // 2. Identify dealers who will be active (either returning or continuing)
  const returningDealers = dealers.filter(
    (d) => previousAssignments[d.id] === "BREAK" || previousAssignments[d.id] === "ERROR_NO_TABLES",
  )
  const continuingDealers = dealers.filter(
    (d) =>
      previousAssignments[d.id] &&
      previousAssignments[d.id] !== "BREAK" &&
      previousAssignments[d.id] !== "ERROR_NO_TABLES" &&
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
  let dealersWhoWillWorkOnTables: DealerWithTables[] = []
  const dealersGoingToAdditionalBreak: DealerWithTables[] = []

  if (potentiallyActiveDealers.length <= tables.length) {
    dealersWhoWillWorkOnTables.push(...potentiallyActiveDealers)
  } else {
    const sortedActiveDealers = [...potentiallyActiveDealers].sort(
      (a, b) =>
        calculateBreakPriority(b, state, params, currentSlotIndex) -
        calculateBreakPriority(a, state, params, currentSlotIndex), // Сортираме така, че тези с по-висок приоритет за почивка да са първи
    )
    // Тези с най-висок приоритет за почивка отиват на допълнителна почивка
    const numAdditionalBreaks = potentiallyActiveDealers.length - tables.length
    for (let k = 0; k < numAdditionalBreaks; k++) {
      if (sortedActiveDealers[k]) {
        // Проверка дали съществува
        dealersGoingToAdditionalBreak.push(sortedActiveDealers[k])
      }
    }
    // Останалите работят
    dealersWhoWillWorkOnTables = sortedActiveDealers.slice(numAdditionalBreaks)
  }

  dealersGoingToAdditionalBreak.forEach((dealer) => {
    slotAssignments[dealer.id] = "BREAK"
  })

  // 4. Assign tables to dealersWhoWillWorkOnTables
  // Разбъркваме continuing дилърите, за да разнообразим реда на избор на маса
  const returningToWorkThisSlot = dealersWhoWillWorkOnTables.filter((d) => state[d.id]?.isReturningFromBreak)
  const continuingToWorkThisSlot = dealersWhoWillWorkOnTables.filter((d) => !state[d.id]?.isReturningFromBreak)

  for (let k = continuingToWorkThisSlot.length - 1; k > 0; k--) {
    const l = Math.floor(Math.random() * (k + 1))
    ;[continuingToWorkThisSlot[k], continuingToWorkThisSlot[l]] = [
      continuingToWorkThisSlot[l],
      continuingToWorkThisSlot[k],
    ]
  }
  // Връщащите се от почивка обикновено имат приоритет или поне са отделна група при избора
  const finalWorkersForTableAssignment = [...returningToWorkThisSlot, ...continuingToWorkThisSlot]

  finalWorkersForTableAssignment.forEach((dealer) => {
    if (slotAssignments[dealer.id] === "BREAK") return // Вече е назначен за почивка

    if (availableTablesForSlot.size === 0) {
      // console.warn(`No tables left for dealer ${dealer.name} in slot ${currentSlot.formattedTime} during assignment. Assigning BREAK.`);
      slotAssignments[dealer.id] = "BREAK" // Ако няма свободни маси, почива
      return
    }

    const targetTable = findBestTableForDealer(dealer, availableTablesForSlot, state, previousAssignments, tables)
    if (targetTable) {
      slotAssignments[dealer.id] = targetTable
      availableTablesForSlot.delete(targetTable)
    } else {
      //   console.error(
      //     `CRITICAL: No suitable table found for dealer ${dealer.name} (ID: ${dealer.id}) in slot ${currentSlot.formattedTime}. Available: ${availableTablesForSlot.size}. Assigning ERROR_NO_TABLES.`,
      //   )
      slotAssignments[dealer.id] = "ERROR_NO_TABLES" // По-ясно име за грешка
    }
  })

  // 5. Finalize assignments for the slot and update dealer states
  dealers.forEach((dealer) => {
    const assignment = slotAssignments[dealer.id]
    if (assignment) {
      // updateDealerStateForSlot(dealer.id, assignment, currentSlotIndex, state) // Ще се актуализира по-долу
    } else {
      // Този дилър не е получил назначение (не е планирана почивка, не е допълнителна, не е маса)
      // Това означава, че е "излишен" за този слот. Третираме го като почивка.
      //   if (previousAssignments[dealer.id] !== undefined) { // Само ако е бил в предния слот
      //     console.warn(
      //       `Dealer ${dealer.name} (ID: ${dealer.id}) was not assigned in slot ${currentSlot.formattedTime}. Treating as BREAK.`,
      //     )
      //   }
      slotAssignments[dealer.id] = "BREAK" // Гарантираме, че има назначение
    }
    updateDealerStateForSlot(dealer.id, slotAssignments[dealer.id], currentSlotIndex, state)
  })
  schedule[currentSlot.time] = slotAssignments
}

/**
 * Намира най-добрата маса за дилър.
 */
function findBestTableForDealer(
  dealer: DealerWithTables,
  availableTables: Set<string>,
  state: Record<string, DealerAssignment>,
  previousAssignments: Record<string, string> | null,
  allCasinoTables: string[], // Добавяме всички маси в казиното за проверка на типове
): string | null {
  const dealerState = state[dealer.id]
  if (!dealerState) return null // Предпазна проверка

  const tableWorkedInPrevSlotByDealer = previousAssignments ? previousAssignments[dealer.id] : null

  const scoredTables: { table: string; score: number }[] = []

  // Филтрираме наличните маси само до тези, на които дилърът може да работи
  const permissibleTables = Array.from(availableTables).filter((t) => dealer.available_tables?.includes(t))
  if (permissibleTables.length === 0) {
    // console.log(`Dealer ${dealer.name} has no permissible tables among available: ${Array.from(availableTables).join(', ')}`);
    return null // Няма налични маси, на които дилърът може да работи
  }

  for (const table of permissibleTables) {
    if (
      tableWorkedInPrevSlotByDealer &&
      table === tableWorkedInPrevSlotByDealer &&
      tableWorkedInPrevSlotByDealer !== "BREAK" &&
      tableWorkedInPrevSlotByDealer !== "ERROR_NO_TABLES"
    ) {
      continue
    }

    let score = 1000

    // Наказание за скорошно работени маси от историята
    dealerState.tableHistory.forEach((historicalTable, index) => {
      if (table === historicalTable) {
        score -= 450 / (index + 1) // Увеличено наказание
      }
    })

    // Бонус, ако масата не е в КРАТКАТА история (tableHistory)
    if (!dealerState.tableHistory.includes(table)) {
      score += 150 // Увеличен бонус
    }

    // Още по-голям бонус, ако масата не е работена ИЗОБЩО от този дилър през смяната (assignedTables)
    if (!dealerState.assignedTables.has(table)) {
      score += 250 // Силен бонус за напълно нова маса за смяната
    }

    // Бонус за смяна на тип маса (ако последната работена е била различен тип)
    const lastTableType = dealerState.lastTable ? getTableTypePrefix(dealerState.lastTable, allCasinoTables) : null
    const currentTableType = getTableTypePrefix(table, allCasinoTables)
    if (lastTableType && currentTableType && lastTableType !== currentTableType) {
      score += 75 // Бонус за разнообразие на типовете
    }

    // Бонус, ако масата е различна от последната работена от дилъра (lastTable) - това е частично покрито от горното
    if (dealerState.lastTable && table !== dealerState.lastTable) {
      score += 30 // Малък допълнителен бонус
    }

    // Малък случаен фактор за разбиване на равенства
    score += Math.floor(Math.random() * 10)

    if (score > -500) {
      // Позволяваме и леко отрицателни резултати, ако няма много избор
      scoredTables.push({ table, score })
    }
  }

  if (scoredTables.length === 0) {
    // Fallback: ако няма оценени маси (напр. всички са силно наказани или недопустими)
    // Взимаме първата налична ДОПУСТИМА маса, която НЕ Е същата като в предния слот
    const fallbackCandidates = permissibleTables.filter(
      (t) =>
        !(
          tableWorkedInPrevSlotByDealer &&
          t === tableWorkedInPrevSlotByDealer &&
          tableWorkedInPrevSlotByDealer !== "BREAK" &&
          tableWorkedInPrevSlotByDealer !== "ERROR_NO_TABLES"
        ),
    )
    if (fallbackCandidates.length > 0) {
      // console.log(`Dealer ${dealer.name} using fallback (non-previous): ${fallbackCandidates[0]}`);
      return fallbackCandidates[0]
    }
    // Ако и това не успее, взимаме първата допустима, дори да е същата (много малко вероятно)
    if (permissibleTables.length > 0) {
      // console.log(`Dealer ${dealer.name} using fallback (first permissible): ${permissibleTables[0]}`);
      return permissibleTables[0]
    }
    // console.log(`Dealer ${dealer.name} has NO permissible tables left for fallback.`);
    return null // Абсолютен fallback - няма подходящи маси
  }

  scoredTables.sort((a, b) => b.score - a.score)
  //   if (dealer.name.includes("Aisyn")) { // Примерно логване за конкретен дилър
  //       console.log(`Scores for ${dealer.name}:`, scoredTables.slice(0,5), `Chosen: ${scoredTables[0].table}`);
  //   }
  return scoredTables[0].table
}

// Помощна функция за определяне на типа на масата (BJ, ROU, OTHER)
function getTableTypePrefix(tableName: string, allCasinoTables: string[]): string | null {
  if (!tableName) return null
  // Тук може да се добави по-сложна логика, ако имате дефинирани типове на масите
  // Засега, проста проверка по префикс
  if (tableName.toUpperCase().startsWith("BJ")) return "BJ"
  if (tableName.toUpperCase().startsWith("ROU")) return "ROU"
  // Може да се разшири с други типове, ако е необходимо
  return "OTHER"
}
