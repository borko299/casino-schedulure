import type { DealerWithTables, ScheduleData, TimeSlot, DealerAssignment } from "../scheduler-types"

/**
 * Решава "верижните ротации" за даден времеви слот.
 * Основната логика е да се запълнят работните слотове, като се симулира
 * как мениджър би организирал смените - дилъри, връщащи се от почивка,
 * задействат верига от ротации.
 */
export function resolveRotationsForSlot(
  slotIndex: number,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  eligibleDealers: DealerWithTables[],
  dealerAssignments: Record<string, DealerAssignment>,
  uniqueTables: string[],
) {
  const currentSlotTime = timeSlots[slotIndex].time
  const prevSlotTime = slotIndex > 0 ? timeSlots[slotIndex - 1].time : null

  // 1. Определяне на наличните ресурси за този слот
  const dealersAvailableToWork = eligibleDealers.filter((d) => schedule[currentSlotTime][d.id] !== "BREAK")
  let tablesAvailable = [...uniqueTables]

  // 2. Приоритетно назначаване (верижни ротации)
  if (prevSlotTime) {
    // Дилъри, които започват почивка, освобождават маси
    const dealersStartingBreak = eligibleDealers.filter(
      (d) => schedule[currentSlotTime][d.id] === "BREAK" && schedule[prevSlotTime][d.id] !== "BREAK",
    )
    const tablesFreedByBreaks = dealersStartingBreak
      .map((d) => schedule[prevSlotTime][d.id])
      .filter((t): t is string => !!t && t !== "BREAK")

    // Дилъри, които се връщат от почивка, са идеални кандидати да заемат тези маси
    const dealersReturningFromBreak = dealersAvailableToWork.filter((d) => schedule[prevSlotTime][d.id] === "BREAK")

    // Опитваме се да свържем връщащ се дилър с освободена маса
    for (const table of tablesFreedByBreaks) {
      if (dealersReturningFromBreak.length > 0) {
        // Намираме дилър, който може да работи на тази маса
        const dealerIndex = dealersReturningFromBreak.findIndex((d) => d.available_tables.includes(table))

        if (dealerIndex !== -1) {
          const dealer = dealersReturningFromBreak.splice(dealerIndex, 1)[0] // Вземаме и премахваме дилъра
          schedule[currentSlotTime][dealer.id] = table
          tablesAvailable = tablesAvailable.filter((t) => t !== table)
        }
      }
    }
  }

  // 3. Назначаване на всички останали налични дилъри
  const dealersStillNeedingAssignment = dealersAvailableToWork.filter((d) => !schedule[currentSlotTime][d.id])

  for (const dealer of dealersStillNeedingAssignment) {
    const assignments = dealerAssignments[dealer.id]
    const prevAssignment = prevSlotTime ? schedule[prevSlotTime][dealer.id] : null

    // Намираме най-добрата налична маса за този дилър
    const potentialTables = tablesAvailable
      .filter((t) => dealer.available_tables.includes(t))
      .filter((t) => t !== prevAssignment) // Избягваме поредни назначения на една и съща маса

    if (potentialTables.length > 0) {
      // Проста логика за избор: предпочитаме маса, на която дилърът не е работил
      const newTables = potentialTables.filter((t) => !assignments.assignedTables.has(t))
      const tableToAssign = newTables.length > 0 ? newTables[0] : potentialTables[0]

      schedule[currentSlotTime][dealer.id] = tableToAssign
      tablesAvailable = tablesAvailable.filter((t) => t !== tableToAssign)
    }
  }
}
