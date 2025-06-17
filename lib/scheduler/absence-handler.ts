import type { DealerWithTables, ScheduleData, ShiftType } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTimeSlots } from "./utils"

/**
 * Обработва напускане на дилър по време на смяна
 */
export async function handleDealerLeaving(
  schedule: ScheduleData,
  leavingDealerId: string,
  leaveAtTime: string,
  dealers: DealerWithTables[], // Expects dealers to have available_tables as string[]
  shiftType: ShiftType,
  supabaseClient: SupabaseClient,
): Promise<ScheduleData> {
  try {
    console.log(
      `[handleDealerLeaving] Start. Leaving Dealer: ${leavingDealerId}, Leave Time: ${leaveAtTime}, Total Dealers Provided: ${dealers.length}`,
    )

    const timeSlots = generateTimeSlots(shiftType)
    const leaveTimeIndex = timeSlots.findIndex((slot) => slot.time === leaveAtTime)

    if (leaveTimeIndex === -1) {
      console.error(`[handleDealerLeaving] Leave time ${leaveAtTime} not found in time slots.`)
      return schedule
    }

    const updatedSchedule = JSON.parse(JSON.stringify(schedule))
    // console.log("[handleDealerLeaving] Original schedule (deep copy):", JSON.stringify(updatedSchedule));

    const tablesNeedingReassignment = new Map<string, string>()

    for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i].time
      if (
        updatedSchedule[currentSlot]?.[leavingDealerId] &&
        updatedSchedule[currentSlot][leavingDealerId] !== "BREAK"
      ) {
        const table = updatedSchedule[currentSlot][leavingDealerId]
        tablesNeedingReassignment.set(currentSlot, table)
        console.log(
          `[handleDealerLeaving] Table ${table} needs reassignment at ${currentSlot} (was assigned to ${leavingDealerId})`,
        )
      }
      if (updatedSchedule[currentSlot]) {
        updatedSchedule[currentSlot][leavingDealerId] = "BREAK" // Mark leaving dealer as on break
      }
    }

    if (tablesNeedingReassignment.size === 0) {
      console.log("[handleDealerLeaving] No tables need reassignment.")
      return updatedSchedule
    }
    console.log(`[handleDealerLeaving] ${tablesNeedingReassignment.size} tables need reassignment.`)

    const activeDealers = dealers.filter((dealer) => dealer.id !== leavingDealerId)
    console.log(`[handleDealerLeaving] Number of active dealers (excluding leaving one): ${activeDealers.length}`)

    for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
      const currentSlotTime = timeSlots[i].time
      const tableToReassign = tablesNeedingReassignment.get(currentSlotTime)

      if (!tableToReassign) continue

      console.log(`[handleDealerLeaving] Attempting to reassign table ${tableToReassign} at slot ${currentSlotTime}`)

      const availableDealersForSlot = activeDealers.filter((dealer) => {
        const isOnBreak = updatedSchedule[currentSlotTime]?.[dealer.id] === "BREAK"
        const canWorkTable = Array.isArray(dealer.available_tables) && dealer.available_tables.includes(tableToReassign)
        // Log individual dealer checks if needed for deep debugging:
        // console.log(`[handleDealerLeaving] Checking dealer ${dealer.id} (${dealer.name}) for table ${tableToReassign} at ${currentSlotTime}: isOnBreak=${isOnBreak}, canWorkTable=${canWorkTable}`);
        return isOnBreak && canWorkTable
      })

      console.log(
        `[handleDealerLeaving] Found ${availableDealersForSlot.length} available dealers for table ${tableToReassign} at ${currentSlotTime}`,
      )

      if (availableDealersForSlot.length > 0) {
        const dealerWorkloads = availableDealersForSlot.map((dealer) => {
          let workCount = 0
          for (const slotTimeKey in updatedSchedule) {
            if (updatedSchedule[slotTimeKey]?.[dealer.id] && updatedSchedule[slotTimeKey][dealer.id] !== "BREAK") {
              workCount++
            }
          }
          return { dealer, workCount }
        })

        dealerWorkloads.sort((a, b) => a.workCount - b.workCount)
        const selectedDealer = dealerWorkloads[0].dealer
        updatedSchedule[currentSlotTime][selectedDealer.id] = tableToReassign
        console.log(
          `[handleDealerLeaving] Assigned table ${tableToReassign} to dealer ${selectedDealer.name} (ID: ${selectedDealer.id}) at ${currentSlotTime}`,
        )
      } else {
        console.warn(
          `[handleDealerLeaving] Could not find a suitable dealer (on break and qualified) for table ${tableToReassign} at time ${currentSlotTime}. Table remains unassigned by this process.`,
        )
        // Log details for why no dealer was found
        activeDealers.forEach((dealer) => {
          const isOnBreak = updatedSchedule[currentSlotTime]?.[dealer.id] === "BREAK"
          const canWorkTable =
            Array.isArray(dealer.available_tables) && dealer.available_tables.includes(tableToReassign)
          if (!isOnBreak) {
            console.log(
              `[handleDealerLeaving] Dealer ${dealer.name} (ID: ${dealer.id}) is NOT on break at ${currentSlotTime}. Assignment: ${updatedSchedule[currentSlotTime]?.[dealer.id]}`,
            )
          }
          if (!canWorkTable) {
            console.log(
              `[handleDealerLeaving] Dealer ${dealer.name} (ID: ${dealer.id}) CANNOT work table ${tableToReassign}. Available: ${JSON.stringify(dealer.available_tables)}`,
            )
          }
        })
      }
    }
    console.log("[handleDealerLeaving] Finished processing reassignments.")
    return updatedSchedule
  } catch (error) {
    console.error("[handleDealerLeaving] CRITICAL ERROR:", error)
    return schedule // Return original schedule on critical error
  }
}
