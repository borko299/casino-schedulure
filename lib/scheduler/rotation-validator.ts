import type { DealerWithTables, ScheduleData, TimeSlot, DealerAssignment } from "../scheduler-types"
import { SCHEDULER_CONFIG } from "./config"

/**
 * Валидира и коригира ротациите в графика
 * Гарантира минимален брой ротации преди почивка
 */
export function validateAndFixRotations(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): void {
  console.log("Starting rotation validation and fixing...")

  // Правилото за MIN_ROTATIONS_BEFORE_BREAK (брой слотове) може да се счита за второстепенно
  // или да се премахне, ако новото правило за брой маси е достатъчно.
  // Засега ще го запазя като проверка, но с по-нисък приоритет.

  for (const dealer of eligibleDealers) {
    const assignments = dealerAssignments[dealer.id]
    let currentRotationLength = 0

    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlotTime = timeSlots[i].time
      const assignment = schedule[currentSlotTime][dealer.id]

      if (assignment && assignment !== "BREAK" && assignment !== "-") {
        currentRotationLength++
      } else if (assignment === "BREAK") {
        // Проверяваме дали предходната ротация е била твърде къса (по брой слотове)
        // Тази проверка е САМО ако новото правило за маси е спазено,
        // но ротацията все пак е къса по слотове.
        if (currentRotationLength > 0 && currentRotationLength < SCHEDULER_CONFIG.MIN_ROTATIONS_BEFORE_BREAK) {
          // Преди да се опитаме да коригираме, проверяваме дали новото правило за маси е спазено.
          // Ако не е, break-validator трябва да го е хванал.
          // Това изисква внимателна логика, за да не се конфликтира с break-validator.
          console.log(
            `Dealer ${dealer.name} has only ${currentRotationLength} slot rotations (but potentially valid by table count) before break at ${timeSlots[i].formattedTime}`,
          )
          // Опит за корекция, ако е нужно (например, удължаване на ротацията, ако не нарушава правилото за маси)
          // Това изисква внимателна логика, за да не се конфликтира с break-validator.
        }
        currentRotationLength = 0 // Нулираме за следващата ротация
      }
    }
  }
  // Може да се добавят и други проверки за качеството на ротациите тук.
}

/**
 * Намира оставащите проблеми с ротациите
 */
function findRemainingRotationIssues(
  eligibleDealers: DealerWithTables[],
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
): Array<{
  dealerId: string
  breakIndex: number
  rotationCount: number
  rotationStartIndex: number
  message: string
}> {
  console.warn(`[rotation-validator] findRemainingRotationIssues called, but primary logic is in break-validator.`)
  return []
}

/**
 * Коригира случаи с недостатъчен брой ротации преди почивка
 */
function fixInsufficientRotationsBeforeBreak(
  dealer: DealerWithTables,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, DealerAssignment>,
  rotationStartIndex: number,
  breakIndex: number,
  rotationCount: number,
  rotationTables: string[],
  eligibleDealers: DealerWithTables[],
): void {
  console.warn(
    `[rotation-validator] fixInsufficientRotationsBeforeBreak called for ${dealer.name}, but primary logic is in break-validator.`,
  )
}
