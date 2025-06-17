import type { DealerWithTables, ScheduleData, TimeSlot, DealerAssignment } from "../scheduler-types" // Добавен DealerAssignment

/**
 * Гарантира, че всички дилъри имат точно R назначени слота.
 * Преизчислява статистиките rotations и breaks от графика.
 */
export function ensureCompleteAssignments(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>, // Променен тип
): void {
  const R = timeSlots.length
  console.log("Ensuring all slots are assigned and resynchronizing stats...")

  for (const dealer of eligibleDealers) {
    const assignments = dealerAssignments[dealer.id]
    let currentRotations = 0
    let currentBreaks = 0
    const currentBreakPositions: number[] = []
    const currentAssignedTables = new Set<string>()
    // tablesInCurrentWorkSegment и isFirstWorkSegmentOfShift НЕ се преизчисляват тук,
    // те се управляват от логиката за валидиране на почивки.

    for (let i = 0; i < R; i++) {
      const slot = timeSlots[i].time
      if (!schedule[slot][dealer.id] || schedule[slot][dealer.id] === "-") {
        schedule[slot][dealer.id] = "BREAK" // Запълваме празни слотове с почивка
      }

      const assignmentInSlot = schedule[slot][dealer.id]
      if (assignmentInSlot === "BREAK") {
        currentBreaks++
        currentBreakPositions.push(i)
      } else {
        currentRotations++
        currentAssignedTables.add(assignmentInSlot)
      }
    }
    assignments.rotations = currentRotations
    assignments.breaks = currentBreaks
    assignments.breakPositions = currentBreakPositions.sort((a, b) => a - b)
    assignments.assignedTables = currentAssignedTables // Общо за смяната
  }
}

export function fixConsecutiveTableAssignments(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>, // Променен тип
): void {
  const R = timeSlots.length
  for (const dealer of eligibleDealers) {
    const assignments = dealerAssignments[dealer.id]
    for (let i = 1; i < R; i++) {
      const prevSlot = timeSlots[i - 1].time
      const currentSlot = timeSlots[i].time
      const prevAssignment = schedule[prevSlot][dealer.id]
      const currentAssignment = schedule[currentSlot][dealer.id]

      if (
        prevAssignment &&
        currentAssignment &&
        prevAssignment !== "BREAK" &&
        currentAssignment !== "BREAK" &&
        prevAssignment === currentAssignment
      ) {
        console.log(
          `Fixing consecutive table assignment for ${dealer.name} at ${timeSlots[i].formattedTime} (table: ${currentAssignment})`,
        )
        const availableTables = dealer.available_tables.filter(
          (t) => t !== currentAssignment && !Object.values(schedule[currentSlot]).includes(t),
        )
        if (availableTables.length > 0) {
          const newTable = availableTables[0]
          schedule[currentSlot][dealer.id] = newTable
          assignments.assignedTables.add(newTable) // Добавяме новата маса към общо отработените
          // assignments.tablesInCurrentWorkSegment.delete(currentAssignment); // Ако е било там
          // assignments.tablesInCurrentWorkSegment.add(newTable); // Ще се обнови от основния цикъл
          console.log(`  Changed to ${newTable}`)
        } else {
          // Опит за размяна с друг дилър или преместване на почивка, ако е възможно
          // Засега оставяме така, ако няма лесна смяна на масата.
          console.warn(`  Could not find alternative table for ${dealer.name} at ${timeSlots[i].formattedTime}`)
        }
      }
    }
  }
}

/**
 * Тази функция вече не е основна за правилото "мин. маси преди почивка",
 * тъй като то се обработва от validateAndFixMinTablesBeforeBreakRule в break-validator.ts.
 * Може да се премахне или да се адаптира за други специфични случаи на "единична ротация",
 * ако има такива извън контекста на правилото за брой маси.
 */
export function fixSingleRotationBeforeBreak(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>, // Променен тип
): void {
  console.warn(
    "[slot-filler] fixSingleRotationBeforeBreak called, but primary logic for min tables before break is in break-validator. This function might be redundant or need repurposing.",
  )
  // Логиката тук трябва да е много внимателна, за да не се конфликтира с break-validator.
  // Например, ако break-validator вече е осигурил спазването на правилото за мин. маси,
  // тази функция може да проверява за други нежелани "единични ротации" (напр. твърде къси по време).
  // Засега я оставям без активна корекция, за да не предизвика конфликти.
}
