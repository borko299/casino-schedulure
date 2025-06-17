import type { DealerWithTables, ScheduleData, TimeSlot, DealerAssignment } from "../scheduler-types" // Добавен DealerAssignment

/**
 * Запълва работните слотове с подобрен алгоритъм за ротация
 * Осигурява равномерно разпределение на ротациите
 */
export function fillWorkSlots(
  eligibleDealers: DealerWithTables[],
  uniqueTables: string[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>, // Променен тип
): void {
  const R = timeSlots.length
  const T = uniqueTables.length
  const D = eligibleDealers.length
  const dealerToTableRatio = D / T

  const tableLastAssignedDealer: Record<string, { dealerId: string; timeIndex: number }> = {}
  uniqueTables.forEach((table) => {
    tableLastAssignedDealer[table] = { dealerId: "", timeIndex: -1 }
  })

  const dealerLastAssignedTable: Record<string, { table: string; timeIndex: number }> = {}
  eligibleDealers.forEach((dealer) => {
    dealerLastAssignedTable[dealer.id] = { table: "", timeIndex: -1 }
  })

  let optimalRotationInterval = 3 // Default, може да се адаптира
  if (dealerToTableRatio <= 1.2) optimalRotationInterval = 2
  else if (dealerToTableRatio > 1.4) optimalRotationInterval = 4

  for (let rotationIndex = 0; rotationIndex < R; rotationIndex++) {
    const currentSlot = timeSlots[rotationIndex].time
    for (const table of uniqueTables) {
      if (Object.values(schedule[currentSlot]).includes(table)) continue

      const eligibleDealersForTable = eligibleDealers.filter((dealer) => {
        const assignments = dealerAssignments[dealer.id]
        if (!dealer.available_tables.includes(table)) return false
        if (schedule[currentSlot][dealer.id]) return false
        if (assignments.rotations >= assignments.targetRotations) return false

        if (rotationIndex > 0 && schedule[timeSlots[rotationIndex - 1].time][dealer.id] === table) return false
        if (rotationIndex < R - 1 && schedule[timeSlots[rotationIndex + 1].time]?.[dealer.id] === table) return false

        if (dealerLastAssignedTable[dealer.id].table === table) {
          const timeSinceLastAssignment = rotationIndex - dealerLastAssignedTable[dealer.id].timeIndex
          if (timeSinceLastAssignment < optimalRotationInterval) return false
        }
        return true
      })

      if (eligibleDealersForTable.length > 0) {
        eligibleDealersForTable.sort((a, b) => {
          const rotationDiff = dealerAssignments[a.id].rotations - dealerAssignments[b.id].rotations
          if (rotationDiff !== 0) return rotationDiff
          return dealerAssignments[a.id].assignedTables.size - dealerAssignments[b.id].assignedTables.size
        })

        const selectedDealer = eligibleDealersForTable[0]
        const assignments = dealerAssignments[selectedDealer.id]

        schedule[currentSlot][selectedDealer.id] = table
        assignments.rotations++
        assignments.lastTable = table
        assignments.lastTableIndex = rotationIndex
        assignments.assignedTables.add(table) // Общо за смяната
        // assignments.tablesInCurrentWorkSegment.add(table); // Ще се управлява от основния цикъл на scheduler.ts или break-validator

        tableLastAssignedDealer[table] = { dealerId: selectedDealer.id, timeIndex: rotationIndex }
        dealerLastAssignedTable[selectedDealer.id] = { table, timeIndex: rotationIndex }
      }
    }
  }
}

/**
 * Запълва останалите неназначени слотове с подобрен алгоритъм
 */
export function fillRemainingSlots(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>, // Променен тип
): void {
  const R = timeSlots.length
  const dealerLastAssignedTable: Record<string, { table: string; timeIndex: number }> = {}
  eligibleDealers.forEach((dealer) => {
    dealerLastAssignedTable[dealer.id] = { table: "", timeIndex: -1 }
    // Инициализираме с текущи назначения, ако има
    for (let i = 0; i < R; i++) {
      const currentAssignment = schedule[timeSlots[i].time][dealer.id]
      if (currentAssignment && currentAssignment !== "BREAK") {
        dealerLastAssignedTable[dealer.id] = { table: currentAssignment, timeIndex: i }
      }
    }
  })

  const sortedDealers = [...eligibleDealers].sort(
    (a, b) => dealerAssignments[a.id].rotations - dealerAssignments[b.id].rotations,
  )

  for (const dealer of sortedDealers) {
    const assignments = dealerAssignments[dealer.id]
    if (assignments.rotations >= assignments.targetRotations) continue

    const unassignedSlots: number[] = []
    for (let i = 0; i < R; i++) {
      if (!schedule[timeSlots[i].time][dealer.id]) {
        unassignedSlots.push(i)
      }
    }

    unassignedSlots.sort((a, b) => {
      const aAdjBreak =
        (a > 0 && schedule[timeSlots[a - 1].time][dealer.id] === "BREAK") ||
        (a < R - 1 && schedule[timeSlots[a + 1].time][dealer.id] === "BREAK")
      const bAdjBreak =
        (b > 0 && schedule[timeSlots[b - 1].time][dealer.id] === "BREAK") ||
        (b < R - 1 && schedule[timeSlots[b + 1].time][dealer.id] === "BREAK")
      if (aAdjBreak && !bAdjBreak) return 1
      if (!aAdjBreak && bAdjBreak) return -1
      return Math.abs(a - R / 2) - Math.abs(b - R / 2)
    })

    for (const slotIndex of unassignedSlots) {
      if (assignments.rotations >= assignments.targetRotations) break
      const currentSlot = timeSlots[slotIndex].time

      let availableTables = dealer.available_tables.filter(
        (table) => !Object.values(schedule[currentSlot]).includes(table),
      )
      if (
        slotIndex > 0 &&
        schedule[timeSlots[slotIndex - 1].time][dealer.id] &&
        schedule[timeSlots[slotIndex - 1].time][dealer.id] !== "BREAK"
      ) {
        availableTables = availableTables.filter((t) => t !== schedule[timeSlots[slotIndex - 1].time][dealer.id])
      }
      if (
        slotIndex < R - 1 &&
        schedule[timeSlots[slotIndex + 1].time]?.[dealer.id] &&
        schedule[timeSlots[slotIndex + 1].time]?.[dealer.id] !== "BREAK"
      ) {
        availableTables = availableTables.filter((t) => t !== schedule[timeSlots[slotIndex + 1].time]?.[dealer.id])
      }

      if (availableTables.length > 0) {
        const lastAssignment = dealerLastAssignedTable[dealer.id]
        const preferredTables = availableTables.filter((t) => {
          if (t === lastAssignment.table) return slotIndex - lastAssignment.timeIndex >= 3 // По-малък интервал за гъвкавост
          return true
        })
        const unworkedTables = preferredTables.filter((t) => !assignments.assignedTables.has(t))

        let selectedTable
        if (unworkedTables.length > 0) selectedTable = unworkedTables[0]
        else if (preferredTables.length > 0) selectedTable = preferredTables[0]
        else selectedTable = availableTables[0]

        schedule[currentSlot][dealer.id] = selectedTable
        assignments.rotations++
        assignments.lastTable = selectedTable
        assignments.lastTableIndex = slotIndex
        assignments.assignedTables.add(selectedTable)
        // assignments.tablesInCurrentWorkSegment.add(selectedTable); // Управлява се от основния цикъл
        dealerLastAssignedTable[dealer.id] = { table: selectedTable, timeIndex: slotIndex }
      } else {
        // Ако няма налична маса, а дилърът не е достигнал целевите ротации,
        // това е проблем, който ensureCompleteAssignments ще адресира, като сложи почивка.
        // Засега оставяме празно, за да може ensureCompleteAssignments да работи.
      }
    }
  }
}

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
