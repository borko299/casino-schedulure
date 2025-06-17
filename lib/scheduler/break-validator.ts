import type { DealerWithTables, ScheduleData, TimeSlot, DealerAssignment } from "../scheduler-types"
import { SCHEDULER_CONFIG } from "./config"

/**
 * Валидира и коригира почивките в графика
 */
export function validateAndFixBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): void {
  console.log("Starting break validation and fixing...")

  // Първо коригираме последователните почивки
  fixConsecutiveBreaks(eligibleDealers, timeSlots, schedule, dealerAssignments)

  // След това коригираме почивките след единична ротация
  // fixBreaksAfterSingleRotation(eligibleDealers, timeSlots, schedule, dealerAssignments)

  // След това прилагаме новото правило за минимален брой маси преди почивка
  validateAndFixMinTablesBeforeBreakRule(eligibleDealers, timeSlots, schedule, dealerAssignments)

  // Накрая проверяваме дали всички проблеми са коригирани
  const remainingIssues = findRemainingBreakIssues(eligibleDealers, timeSlots, schedule, dealerAssignments)

  if (remainingIssues.length > 0) {
    console.warn(`Found ${remainingIssues.length} remaining break issues that could not be fixed automatically.`)

    // Опитваме се да коригираме оставащите проблеми с по-агресивен подход
    // fixRemainingBreakIssuesAggressively(eligibleDealers, timeSlots, schedule, dealerAssignments, remainingIssues)
  } else {
    console.log("All break issues have been fixed successfully!")
  }
}

/**
 * Равномерно разпределя почивките за всички дилъри с действително преразпределение
 */
export function redistributeBreaksEvenly(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): void {
  console.log("Starting break redistribution...")
  const R = timeSlots.length

  for (const dealer of eligibleDealers) {
    const stats = dealerAssignments[dealer.id]
    const targetBreaks = stats.targetBreaks

    if (
      targetBreaks <= 0 ||
      !stats.breakPositions ||
      stats.breakPositions.length === 0 ||
      stats.breakPositions.length !== targetBreaks
    ) {
      continue
    }

    const currentBreakPositions = [...stats.breakPositions].sort((a, b) => a - b)

    const idealInterval = Math.floor(R / (targetBreaks + 1))
    const idealPositions: number[] = []
    for (let i = 1; i <= targetBreaks; i++) {
      idealPositions.push(Math.min(R - 1, i * idealInterval))
    }

    let totalDeviation = 0
    for (let i = 0; i < targetBreaks; i++) {
      totalDeviation += Math.abs(currentBreakPositions[i] - idealPositions[i])
    }
    const averageDeviation = targetBreaks > 0 ? totalDeviation / targetBreaks : 0

    if (averageDeviation <= SCHEDULER_CONFIG.ACCEPTABLE_BREAK_DEVIATION) {
      continue
    }

    console.log(
      `Attempting to redistribute breaks for dealer ${dealer.name} (avg deviation: ${averageDeviation.toFixed(2)})`,
    )

    for (let i = 0; i < targetBreaks; i++) {
      const currentBreakIdx = currentBreakPositions[i]
      const idealBreakIdx = idealPositions[i]

      if (currentBreakIdx === idealBreakIdx) continue

      let bestNewSlotForBreak = -1
      let minDiffToIdeal = Math.abs(currentBreakIdx - idealBreakIdx)

      const searchRadius = Math.max(SCHEDULER_CONFIG.BREAK_SEARCH_RADIUS, Math.floor(idealInterval / 2))
      for (let offset = 0; offset <= searchRadius; offset++) {
        const potentialSlotsToTry = [idealBreakIdx - offset, idealBreakIdx + offset].filter((s) => s >= 0 && s < R)

        for (const potentialSlot of potentialSlotsToTry) {
          if (
            potentialSlot === currentBreakIdx ||
            (stats.breakPositions.includes(potentialSlot) && !currentBreakPositions.includes(potentialSlot)) // Already a planned break for this dealer, but not the one we are moving
          ) {
            continue
          }

          // Проверка дали преместването е валидно (включително новото правило)
          if (isMoveValid(dealer, schedule, timeSlots, currentBreakIdx, potentialSlot, stats, dealerAssignments)) {
            const diff = Math.abs(potentialSlot - idealBreakIdx)
            if (diff < minDiffToIdeal) {
              minDiffToIdeal = diff
              bestNewSlotForBreak = potentialSlot
            }
          }
        }
      }

      if (bestNewSlotForBreak !== -1 && bestNewSlotForBreak !== currentBreakIdx) {
        const oldBreakTime = timeSlots[currentBreakIdx].time
        const newBreakTime = timeSlots[bestNewSlotForBreak].time

        const tableToAssignToOldSlot = findSuitableTableForSlot(dealer, oldBreakTime, schedule, timeSlots, stats)

        if (tableToAssignToOldSlot) {
          console.log(
            `  Redistributing break for ${dealer.name}: moving from ${timeSlots[currentBreakIdx].formattedTime} to ${timeSlots[bestNewSlotForBreak].formattedTime}, assigning ${tableToAssignToOldSlot} to old slot`,
          )

          const assignmentInNewSlotOriginal = schedule[newBreakTime][dealer.id]

          schedule[oldBreakTime][dealer.id] = tableToAssignToOldSlot
          stats.rotations++
          stats.breaks--
          stats.assignedTables.add(tableToAssignToOldSlot)

          const bpIndex = stats.breakPositions.indexOf(currentBreakIdx)
          if (bpIndex > -1) stats.breakPositions.splice(bpIndex, 1)

          if (assignmentInNewSlotOriginal && assignmentInNewSlotOriginal !== "BREAK") {
            stats.rotations--
            // Не премахваме от assignedTables, тъй като може да е работил на нея другаде
          }
          schedule[newBreakTime][dealer.id] = "BREAK"
          stats.breaks++
          stats.breakPositions.push(bestNewSlotForBreak)
          stats.breakPositions.sort((a, b) => a - b)

          currentBreakPositions.splice(i, 1, bestNewSlotForBreak)
          currentBreakPositions.sort((a, b) => a - b)
        }
      }
    }
  }
  console.log("Break redistribution finished.")
}

/**
 * Проверява дали преместването на почивка е валидно
 */
function isMoveValid(
  dealer: DealerWithTables,
  schedule: ScheduleData,
  timeSlots: TimeSlot[],
  oldBreakSlotIndex: number,
  newBreakSlotIndex: number,
  dealerStats: DealerAssignment, // Използваме пълния DealerAssignment
  allDealerAssignments: Record<string, DealerAssignment>, // За достъп до isFirstWorkSegmentOfShift
): boolean {
  const R = timeSlots.length
  const assignments = allDealerAssignments[dealer.id] // Получаваме актуалните assignments

  // 1. Проверка за поредни почивки на новата позиция
  if (
    newBreakSlotIndex > 0 &&
    schedule[timeSlots[newBreakSlotIndex - 1].time]?.[dealer.id] === "BREAK" &&
    newBreakSlotIndex - 1 !== oldBreakSlotIndex
  ) {
    return false
  }
  if (
    newBreakSlotIndex < R - 1 &&
    schedule[timeSlots[newBreakSlotIndex + 1].time]?.[dealer.id] === "BREAK" &&
    newBreakSlotIndex + 1 !== oldBreakSlotIndex
  ) {
    return false
  }

  // 2. Проверка на новото правило за минимален брой маси преди новата почивка
  // Симулираме работния сегмент до newBreakSlotIndex - 1
  const tempTablesInSegment = new Set<string>()
  let workFoundInSimulatedSegment = false
  for (let k = 0; k < newBreakSlotIndex; k++) {
    if (k === oldBreakSlotIndex) {
      // Старият слот за почивка ще стане работа
      const tableForOldSlot = findSuitableTableForSlot(
        dealer,
        timeSlots[oldBreakSlotIndex].time,
        schedule,
        timeSlots,
        dealerStats,
      )
      if (tableForOldSlot) {
        tempTablesInSegment.add(tableForOldSlot)
        workFoundInSimulatedSegment = true
      } else {
        return false // Не можем да намерим маса за стария слот, преместването е невалидно
      }
      continue
    }
    const assignment = schedule[timeSlots[k].time]?.[dealer.id]
    if (assignment === "BREAK") {
      tempTablesInSegment.clear() // Започва нов сегмент
      workFoundInSimulatedSegment = false
    } else if (assignment && assignment !== "-") {
      tempTablesInSegment.add(assignment)
      workFoundInSimulatedSegment = true
    }
  }

  if (workFoundInSimulatedSegment) {
    // Правилото се прилага само ако има работа преди почивката
    if (assignments.isFirstWorkSegmentOfShift) {
      // Трябва да се определи спрямо симулацията
      // За целите на isMoveValid, приемаме, че ако isFirstWorkSegmentOfShift е true за дилъра,
      // то и този симулиран сегмент е "първи", освен ако вече не е имало почивка в симулацията.
      // Това е опростяване; пълната симулация на isFirstWorkSegmentOfShift е сложна тук.
      // Засега използваме глобалния флаг на дилъра.
      if (tempTablesInSegment.size < SCHEDULER_CONFIG.MIN_TABLES_FIRST_SEGMENT) return false
    } else {
      if (tempTablesInSegment.size < SCHEDULER_CONFIG.MIN_TABLES_REGULAR_SEGMENT) return false
    }
  }

  // 3. Проверка дали слотът, който освобождаваме (oldBreakSlotIndex), може да бъде запълнен с работа
  if (!findSuitableTableForSlot(dealer, timeSlots[oldBreakSlotIndex].time, schedule, timeSlots, dealerStats)) {
    return false
  }

  return true
}

/**
 * Намира подходяща маса за даден слот
 */
function findSuitableTableForSlot(
  dealer: DealerWithTables,
  timeSlotString: string, // Променено на string, за да съответства на schedule ключовете
  schedule: ScheduleData,
  timeSlots: TimeSlot[],
  dealerStats: DealerAssignment,
): string | null {
  const slotIndex = timeSlots.findIndex((s) => s.time === timeSlotString)
  if (slotIndex === -1) return null

  const availableTables = dealer.available_tables.filter((table) => {
    let isTableOccupiedByOther = false
    for (const dId in schedule[timeSlotString]) {
      if (dId !== dealer.id && schedule[timeSlotString][dId] === table) {
        isTableOccupiedByOther = true
        break
      }
    }
    if (isTableOccupiedByOther) return false

    if (slotIndex > 0 && schedule[timeSlots[slotIndex - 1].time]?.[dealer.id] === table) {
      return false
    }
    if (slotIndex < timeSlots.length - 1 && schedule[timeSlots[slotIndex + 1].time]?.[dealer.id] === table) {
      return false
    }
    return true
  })

  // Приоритет на маси, които не са в текущия работен сегмент, ако е възможно
  const preferredTables = availableTables.filter((t) => !dealerStats.tablesInCurrentWorkSegment.has(t))
  if (preferredTables.length > 0) return preferredTables[0]

  return availableTables.length > 0 ? availableTables[0] : null
}

/**
 * Намира оставащите проблеми с почивките
 */
function findRemainingBreakIssues(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  // dealerAssignments е нужно за достъп до isFirstWorkSegmentOfShift и tablesInCurrentWorkSegment
  dealerAssignments?: Record<string, DealerAssignment>, // Опционално за обратна съвместимост, но трябва да се подаде
): Array<{ dealerId: string; type: string; index: number; message: string }> {
  const issues: Array<{ dealerId: string; type: string; index: number; message: string }> = []

  for (const dealer of eligibleDealers) {
    const assignments = dealerAssignments ? dealerAssignments[dealer.id] : null
    const tempTablesInSegment = new Set<string>()
    let tempIsFirstSegment = assignments ? assignments.isFirstWorkSegmentOfShift : true // Приблизително

    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time
      const assignment = schedule[currentSlot][dealer.id]

      if (assignment === "BREAK") {
        if (i > 0 && schedule[timeSlots[i - 1].time][dealer.id] === "BREAK") {
          issues.push({ dealerId: dealer.id, type: "consecutive_break", index: i, message: "Consecutive break." })
        }

        // Проверка на новото правило
        if (i > 0 && schedule[timeSlots[i - 1].time][dealer.id] !== "BREAK") {
          // Ако не е първа почивка или поредна
          const numTables = tempTablesInSegment.size
          if (tempIsFirstSegment) {
            if (numTables < SCHEDULER_CONFIG.MIN_TABLES_FIRST_SEGMENT) {
              issues.push({
                dealerId: dealer.id,
                type: "min_tables_first_segment",
                index: i,
                message: `Only ${numTables} tables in first segment.`,
              })
            }
          } else {
            if (numTables < SCHEDULER_CONFIG.MIN_TABLES_REGULAR_SEGMENT) {
              issues.push({
                dealerId: dealer.id,
                type: "min_tables_regular_segment",
                index: i,
                message: `Only ${numTables} tables in regular segment.`,
              })
            }
          }
        }

        // Нулиране за следващия сегмент (приблизително, тъй_като не знаем дали isFirstSegment се е променил)
        if (tempTablesInSegment.size > 0 && tempIsFirstSegment) tempIsFirstSegment = false
        tempTablesInSegment.clear()
      } else if (assignment && assignment !== "-") {
        tempTablesInSegment.add(assignment)
      }
    }
  }
  return issues
}

/**
 * Функции за коригиране на конкретни проблеми
 */
function fixConsecutiveBreaks(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): void {
  for (const dealer of eligibleDealers) {
    const assignments = dealerAssignments[dealer.id]
    for (let i = 1; i < timeSlots.length; i++) {
      const prevSlotTime = timeSlots[i - 1].time
      const currentSlotTime = timeSlots[i].time

      if (schedule[prevSlotTime][dealer.id] === "BREAK" && schedule[currentSlotTime][dealer.id] === "BREAK") {
        console.log(
          `Consecutive break found for ${dealer.name} at ${timeSlots[i - 1].formattedTime} and ${timeSlots[i].formattedTime}. Attempting to fix.`,
        )
        let fixed = false

        // Attempt 1: Replace the SECOND break with work
        const tableForCurrentSlot = findSuitableTableForSlot(dealer, currentSlotTime, schedule, timeSlots, assignments)
        if (tableForCurrentSlot) {
          schedule[currentSlotTime][dealer.id] = tableForCurrentSlot
          assignments.rotations++
          assignments.breaks-- // Dealer has one less break overall
          assignments.assignedTables.add(tableForCurrentSlot)
          const bpIndex = assignments.breakPositions.indexOf(i) // Remove the second break's position
          if (bpIndex > -1) assignments.breakPositions.splice(bpIndex, 1)
          console.log(`  Replaced second break at ${timeSlots[i].formattedTime} with ${tableForCurrentSlot}`)
          fixed = true
        }

        // Attempt 2: If first attempt failed, replace the FIRST break with work
        if (!fixed) {
          const tableForPrevSlot = findSuitableTableForSlot(dealer, prevSlotTime, schedule, timeSlots, assignments)
          if (tableForPrevSlot) {
            schedule[prevSlotTime][dealer.id] = tableForPrevSlot
            assignments.rotations++
            assignments.breaks-- // Dealer has one less break overall
            assignments.assignedTables.add(tableForPrevSlot)
            const bpIndex = assignments.breakPositions.indexOf(i - 1) // Remove the first break's position
            if (bpIndex > -1) assignments.breakPositions.splice(bpIndex, 1)
            // The second break (at `i`) remains a break, but it's no longer consecutive with the (now work) slot at i-1.
            console.log(`  Replaced first break at ${timeSlots[i - 1].formattedTime} with ${tableForPrevSlot}`)
            fixed = true
          }
        }

        if (!fixed) {
          console.warn(
            `  Could not find suitable table to fix consecutive break for ${dealer.name} at ${timeSlots[i - 1].formattedTime}/${timeSlots[i].formattedTime}. One break may need to be moved by redistribution.`,
          )
        }
      }
    }
  }
}

/**
 * Валидира и коригира почивките в графика спрямо новото правило за мин. маси.
 */
function validateAndFixMinTablesBeforeBreakRule(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): void {
  console.log("Validating and fixing 'minimum tables before break' rule...")

  for (const dealer of eligibleDealers) {
    const assignments = dealerAssignments[dealer.id]
    // Състоянието tablesInCurrentWorkSegment и isFirstWorkSegmentOfShift се поддържа
    // и обновява по време на обхождането на слотовете за този дилър.

    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlotTime = timeSlots[i].time
      const currentAssignment = schedule[currentSlotTime][dealer.id]

      if (currentAssignment === "BREAK") {
        let ruleViolated = false
        let isCurrentBreakValid = true // Предполагаме, че е валидна, докато не се докаже противното

        if (i === 0) {
          // Изключение 1: Почивка в началото на смяната
          // Валидна е, не правим нищо тук, освен да подготвим състоянието за следващия сегмент
        } else if (schedule[timeSlots[i - 1].time][dealer.id] === "BREAK") {
          // Поредна почивка. Валидността й зависи от предходната.
          // Основната логика за поредни почивки е в fixConsecutiveBreaks.
          // Тук просто подготвяме състоянието.
        } else {
          // Почивката следва работен период. Проверяваме правилото.
          const numUniqueTablesInSegment = assignments.tablesInCurrentWorkSegment.size

          // НОВАТА ЛОГИКА ЗА ПРОВЕРКА, базирана на времевия прозорец
          if (i < SCHEDULER_CONFIG.EARLY_BREAK_WINDOW_SLOTS) {
            if (numUniqueTablesInSegment < SCHEDULER_CONFIG.MIN_TABLES_FIRST_SEGMENT) {
              ruleViolated = true
              isCurrentBreakValid = false
              console.log(
                `Rule Violation (Early Window): Dealer ${dealer.name} at ${
                  timeSlots[i].formattedTime
                }. Tables: ${numUniqueTablesInSegment}/${
                  SCHEDULER_CONFIG.MIN_TABLES_FIRST_SEGMENT
                }. Segment: ${Array.from(assignments.tablesInCurrentWorkSegment).join(", ")}`,
              )
            }
          } else {
            // След ранния прозорец
            if (numUniqueTablesInSegment < SCHEDULER_CONFIG.MIN_TABLES_REGULAR_SEGMENT) {
              ruleViolated = true
              isCurrentBreakValid = false
              console.log(
                `Rule Violation (Regular Segment): Dealer ${dealer.name} at ${
                  timeSlots[i].formattedTime
                }. Tables: ${numUniqueTablesInSegment}/${
                  SCHEDULER_CONFIG.MIN_TABLES_REGULAR_SEGMENT
                }. Segment: ${Array.from(assignments.tablesInCurrentWorkSegment).join(", ")}`,
              )
            }
          }
        }

        if (ruleViolated) {
          const fixed = attemptToFixMinTablesViolation(
            dealer,
            i, // index of the break
            timeSlots,
            schedule,
            assignments,
            eligibleDealers,
          )
          if (fixed) {
            // Ако корекцията е успешна, графика и assignments са обновени.
            // Ако почивката е превърната в работа, currentAssignment ще се промени.
            // Ако почивката е преместена, този слот вече е работа.
            // Важно: attemptToFixMinTablesViolation трябва да обнови isCurrentBreakValid
            // или да върне статус, за да се знае дали почивката в ТОЗИ слот е станала валидна.
            // Засега приемаме, че ако fixed е true, проблемът е решен (почивката е преместена/конвертирана).
            // Трябва да проверим отново какво има в текущия слот.
            if (schedule[currentSlotTime][dealer.id] !== "BREAK") {
              // Почивката е конвертирана в работа. Добавяме към текущия сегмент.
              assignments.tablesInCurrentWorkSegment.add(schedule[currentSlotTime][dealer.id])
              continue // Преминаваме към следващия слот, тъй като този вече не е почивка.
            } else {
              // Почивката е останала (може би е преместена другаде, а тук е сложена нова валидна, или е валидирана по друг начин)
              isCurrentBreakValid = true // Приемаме, че корекцията я е направила валидна.
            }
          } else {
            console.warn(
              `Could not fix rule violation for ${dealer.name} at ${timeSlots[i].formattedTime}. Break remains.`,
            )
            // Почивката остава невалидна според това правило.
          }
        }

        // Ако почивката в currentSlotTime е (или е станала) валидна:
        if (isCurrentBreakValid && schedule[currentSlotTime][dealer.id] === "BREAK") {
          // Проверяваме дали е имало работа преди тази валидна почивка, за да сменим isFirstWorkSegmentOfShift
          let workDoneBeforeThisValidBreak = false
          if (i > 0) {
            // Проверяваме дали assignments.tablesInCurrentWorkSegment е бил непразен ПРЕДИ да го изчистим.
            // Тъй като го изчистваме СЛЕД проверката, можем директно да го използваме.
            if (assignments.tablesInCurrentWorkSegment.size > 0) {
              workDoneBeforeThisValidBreak = true
            }
          } else {
            // Почивка в слот 0
            workDoneBeforeThisValidBreak = false
          }

          if (assignments.isFirstWorkSegmentOfShift && workDoneBeforeThisValidBreak) {
            assignments.isFirstWorkSegmentOfShift = false
          }
          assignments.tablesInCurrentWorkSegment.clear()
        }
      } else if (currentAssignment && currentAssignment !== "-") {
        // Дилърът работи
        assignments.tablesInCurrentWorkSegment.add(currentAssignment)
      }
    }
  }
}

function attemptToFixMinTablesViolation(
  dealer: DealerWithTables,
  breakSlotIndex: number,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  assignments: DealerAssignment,
  allDealers: DealerWithTables[], // Може да е нужно за размяна
): boolean {
  const breakTime = timeSlots[breakSlotIndex].time

  // Стратегия 1: Конвертиране на текущата почивка в работа
  // Търсим маса, на която дилърът може да работи и която НЕ Е в tablesInCurrentWorkSegment,
  // за да увеличим броя на различните маси в сегмента.
  const potentialTablesToWork = dealer.available_tables.filter(
    (table) =>
      !assignments.tablesInCurrentWorkSegment.has(table) && // Трябва да е нова за сегмента
      !Object.values(schedule[breakTime]).some(
        (id) =>
          id === table && dealer.id !== Object.keys(schedule[breakTime]).find((k) => schedule[breakTime][k] === table),
      ), // Масата да не е заета от друг
  )

  if (potentialTablesToWork.length > 0) {
    const tableToAssign = potentialTablesToWork[0] // Избираме първата подходяща
    console.log(
      `  Fixing ${dealer.name} at ${
        timeSlots[breakSlotIndex].formattedTime
      }: Converting BREAK to WORK on ${tableToAssign}`,
    )
    schedule[breakTime][dealer.id] = tableToAssign
    assignments.rotations++
    assignments.breaks--
    assignments.assignedTables.add(tableToAssign) // Добавяме към общия списък с отработени маси за смяната

    // НЕ добавяме към tablesInCurrentWorkSegment тук, защото основният цикъл ще го направи,
    // ако слотът вече не е почивка. Вместо това, връщаме true, и основният цикъл ще види,
    // че слотът е работа и ще го добави.

    const bpIndex = assignments.breakPositions.indexOf(breakSlotIndex)
    if (bpIndex > -1) assignments.breakPositions.splice(bpIndex, 1)

    // isFirstWorkSegmentOfShift не се променя тук, тъй като почивката е премахната.
    return true
  }

  // Стратегия 2: Преместване на почивката по-късно
  // Търсим бъдещ слот, където поставянето на почивка би било валидно.
  // Това означава, че разширеният работен сегмент (включващ работа в текущия breakSlotIndex)
  // трябва да отговаря на правилото за брой маси.
  for (let newBreakTryIndex = breakSlotIndex + 1; newBreakTryIndex < timeSlots.length; newBreakTryIndex++) {
    const futureSlotTime = timeSlots[newBreakTryIndex].time

    // Може ли дилърът да вземе почивка в newBreakTryIndex? (Слотът е свободен или вече е негова почивка)
    if (schedule[futureSlotTime][dealer.id] && schedule[futureSlotTime][dealer.id] !== "BREAK") {
      continue // Слотът е зает с работа от същия дилър, не можем да сложим почивка отгоре.
    }
    // Проверка за поредни почивки на новата позиция
    let wouldBeConsecutive = false
    if (
      newBreakTryIndex > 0 &&
      schedule[timeSlots[newBreakTryIndex - 1].time][dealer.id] === "BREAK" &&
      newBreakTryIndex - 1 !== breakSlotIndex
    ) {
      wouldBeConsecutive = true
    }
    if (
      newBreakTryIndex < timeSlots.length - 1 &&
      schedule[timeSlots[newBreakTryIndex + 1].time][dealer.id] === "BREAK"
    ) {
      wouldBeConsecutive = true
    }
    if (wouldBeConsecutive) continue

    // Каква маса би работил дилърът в оригиналния breakSlotIndex, ако почивката се премести?
    const tableForOriginalBreakSlotArray = dealer.available_tables.filter(
      (table) =>
        !Object.values(schedule[breakTime]).some(
          (id) =>
            id === table &&
            dealer.id !== Object.keys(schedule[breakTime]).find((k) => schedule[breakTime][k] === table),
        ),
    )

    if (tableForOriginalBreakSlotArray.length === 0) continue // Няма свободна маса за оригиналния слот

    for (const tableForOriginalBreakSlot of tableForOriginalBreakSlotArray) {
      // Симулираме работния сегмент до newBreakTryIndex - 1
      const simulatedTablesInSegment = new Set(assignments.tablesInCurrentWorkSegment)
      simulatedTablesInSegment.add(tableForOriginalBreakSlot) // Добавяме масата от оригиналния слот за почивка

      // Проверяваме дали този симулиран сегмент е валиден за почивка
      let segmentValidForNewBreak = false
      if (assignments.isFirstWorkSegmentOfShift) {
        if (simulatedTablesInSegment.size >= SCHEDULER_CONFIG.MIN_TABLES_FIRST_SEGMENT) {
          segmentValidForNewBreak = true
        }
      } else {
        if (simulatedTablesInSegment.size >= SCHEDULER_CONFIG.MIN_TABLES_REGULAR_SEGMENT) {
          segmentValidForNewBreak = true
        }
      }

      if (segmentValidForNewBreak) {
        console.log(
          `  Fixing ${dealer.name}: Moving BREAK from ${
            timeSlots[breakSlotIndex].formattedTime
          } to ${timeSlots[newBreakTryIndex].formattedTime}. Original slot gets ${tableForOriginalBreakSlot}.`,
        )

        // 1. Оригиналният слот за почивка става работа
        schedule[breakTime][dealer.id] = tableForOriginalBreakSlot
        // assignments.rotations++; // Ще се коригира от основния цикъл или при преизчисляване
        // assignments.breaks--;
        assignments.assignedTables.add(tableForOriginalBreakSlot)
        const bpIdx = assignments.breakPositions.indexOf(breakSlotIndex)
        if (bpIdx > -1) assignments.breakPositions.splice(bpIdx, 1)

        // 2. Новият слот става почивка
        const assignmentBeingReplacedByNewBreak = schedule[futureSlotTime][dealer.id]
        schedule[futureSlotTime][dealer.id] = "BREAK"
        // assignments.breaks++;
        assignments.breakPositions.push(newBreakTryIndex)
        assignments.breakPositions.sort((a, b) => a - b)

        // Коригираме броячите, ако новата почивка заменя работа
        if (assignmentBeingReplacedByNewBreak && assignmentBeingReplacedByNewBreak !== "BREAK") {
          // assignments.rotations--;
          // Трябва да се направи пълно преизчисляване на rotations/breaks след такива промени
          // или много внимателно да се управляват тук.
          // Засега разчитаме, че ensureCompleteAssignments и последващи балансирания ще ги оправят.
        }
        // Важно: Тъй като преместваме почивка, assignments.tablesInCurrentWorkSegment НЕ се изчиства тук.
        // Основният цикъл ще обработи новата работа в breakSlotIndex и след това новата почивка в newBreakTryIndex.
        return true
      }
    }
  }

  // TODO: Стратегия 3: Размяна с друг дилър (по-сложна)

  return false
}
