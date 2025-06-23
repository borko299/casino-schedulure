import type { DealerWithTables, DealerAssignment, ScheduleParameters, SchedulePreferences } from "./types"

const TABLE_HISTORY_LENGTH = 5 // Колко последни маси да помним

/**
 * Инициализира структурите за проследяване на назначенията на дилърите за новия алгоритъм.
 */
export function initializeDealerState(
  eligibleDealers: DealerWithTables[],
  params: ScheduleParameters,
  preferences?: SchedulePreferences,
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
      isUnderPunishment: false,
      punishmentTablesWorked: 0,
      punishmentTargetTables: 0,
      hasCompletedPunishment: false,
    }

    // Check for punishment from preferences
    if (preferences?.firstBreakPreferences) {
      const pref = preferences.firstBreakPreferences.find((p) => p.dealerId === dealer.id)
      if (pref?.reason === "late_for_table" && pref.punishment?.isActive) {
        dealerState[dealer.id].isUnderPunishment = true
        dealerState[dealer.id].punishmentTargetTables = pref.punishment.tablesToWork
        dealerState[dealer.id].punishmentTablesWorked = 0
        dealerState[dealer.id].hasCompletedPunishment = false // Ensure it's reset
        console.log(
          `[initializeDealerState] Dealer ${dealer.name} (ID: ${dealer.id}) is under punishment: ${pref.punishment.tablesToWork} tables.`,
        )
      }
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
    dealer.lastTable = null
  } else {
    // Working on a table
    dealer.rotations++
    dealer.slotsSinceLastBreak++
    dealer.lastTable = assignment
    dealer.assignedTables.add(assignment)

    dealer.tableHistory.unshift(assignment)
    if (dealer.tableHistory.length > TABLE_HISTORY_LENGTH) {
      dealer.tableHistory.pop()
    }

    // Handle punishment
    if (dealer.isUnderPunishment && !dealer.hasCompletedPunishment) {
      dealer.punishmentTablesWorked = (dealer.punishmentTablesWorked || 0) + 1
      console.log(
        `[updateDealerStateForSlot] Dealer ${dealerId} (under punishment) worked table ${assignment}. Progress: ${dealer.punishmentTablesWorked}/${dealer.punishmentTargetTables}`,
      )
      if (
        dealer.punishmentTablesWorked &&
        dealer.punishmentTargetTables &&
        dealer.punishmentTablesWorked >= dealer.punishmentTargetTables
      ) {
        dealer.isUnderPunishment = false
        dealer.hasCompletedPunishment = true
        // Crucial: Make them a high priority for a break soon.
        // Setting slotsSinceLastBreak to a high value simulates them having worked a long time.
        dealer.slotsSinceLastBreak = dealer.targetRotations // Or a configured high value
        console.log(
          `[updateDealerStateForSlot] Dealer ${dealerId} completed punishment. slotsSinceLastBreak set to ${dealer.slotsSinceLastBreak} to prioritize next break.`,
        )
      }
    }
  }
}
