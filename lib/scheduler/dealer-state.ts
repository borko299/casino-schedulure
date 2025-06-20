import type { DealerWithTables, DealerAssignment, ScheduleParameters } from "./types"

// Променете TABLE_HISTORY_LENGTH
const TABLE_HISTORY_LENGTH = 8 // Пример: увеличена дължина на историята

/**
 * Инициализира структурите за проследяване на назначенията на дилърите за новия алгоритъм.
 */
export function initializeDealerState(
  eligibleDealers: DealerWithTables[],
  params: ScheduleParameters,
): Record<string, DealerAssignment> {
  const dealerState: Record<string, DealerAssignment> = {}
  console.log(`[initializeDealerState] Initializing state for ${eligibleDealers.length} dealers.`)

  eligibleDealers.forEach((dealer, index) => {
    const targetRotations = params.workSlotsPerDealer + (index < params.extraWorkSlots ? 1 : 0)
    const targetBreaks = params.R - targetRotations

    dealerState[dealer.id] = {
      rotations: 0,
      breaks: 0,
      lastTable: null,
      assignedTables: new Set<string>(),
      breakPositions: [],
      targetRotations: targetRotations,
      targetBreaks: targetBreaks,
      slotsSinceLastBreak: 0,
      tableHistory: [],
      isReturningFromBreak: false,
      // Добавяме поле за приоритет за почивка, ако решим да го изчисляваме и съхраняваме
      // breakPriorityScore: 0, // Може да се изчислява on-the-fly
    }
  })
  return dealerState
}

/**
 * Актуализира състоянието на дилър след като му е направено назначение за даден слот.
 */
export function updateDealerStateForSlot(
  dealerId: string,
  assignment: string, // "BREAK" или име на маса
  slotIndex: number,
  state: Record<string, DealerAssignment>,
): void {
  const dealer = state[dealerId]
  if (!dealer) return

  dealer.isReturningFromBreak = false // Reset for next slot

  if (assignment === "BREAK") {
    dealer.breaks++
    dealer.slotsSinceLastBreak = 0
    dealer.breakPositions.push(slotIndex)
    dealer.lastTable = null // Няма последна маса, когато е в почивка
    // Не добавяме "BREAK" към tableHistory
  } else {
    dealer.rotations++
    dealer.slotsSinceLastBreak++
    dealer.lastTable = assignment
    dealer.assignedTables.add(assignment)

    // Актуализираме историята на масите
    dealer.tableHistory.unshift(assignment)
    if (dealer.tableHistory.length > TABLE_HISTORY_LENGTH) {
      dealer.tableHistory.pop()
    }
  }
}
