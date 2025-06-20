import type { Dealer, SchedulePreferences, DealerWithTables, ScheduleData } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateTimeSlots } from "./utils"
import { getDealerAvailableTables, calculateScheduleParameters } from "./workload-calculator"
import { generateChainRotationSchedule } from "./chain-scheduler"

/**
 * Генерира график за дилъри с подобрен алгоритъм за ротация
 */
export async function generateSchedule(
  dealersInput: Dealer[], // Преименувано за яснота
  shiftType: "day" | "night",
  supabaseClient: SupabaseClient,
  preferences?: SchedulePreferences,
): Promise<ScheduleData> {
  console.log(
    `[generateSchedule] Starting schedule generation for ${dealersInput.length} dealers, shift: ${shiftType}.`,
  )
  try {
    const timeSlots = generateTimeSlots(shiftType)
    const schedule: ScheduleData = {}
    timeSlots.forEach((slot) => {
      schedule[slot.time] = {}
    })

    if (dealersInput.length === 0) {
      console.warn("[generateSchedule] Input dealers array is empty. Returning empty schedule.")
      return schedule
    }

    console.log("[generateSchedule] Fetching available tables for each dealer...")
    const dealersWithTables = await Promise.all(
      dealersInput.map(async (dealerObj) => {
        // Уверете се, че dealerObj има поне id и name за getDealerAvailableTables
        const dealer = dealerObj as DealerWithTables // Кастване за нуждите на getDealerAvailableTables
        const fetchedAvailableTables = await getDealerAvailableTables(dealer, supabaseClient)
        return {
          ...dealerObj, // Запазваме оригиналния обект
          available_tables: fetchedAvailableTables, // Добавяме/обновяваме само това поле
        } as DealerWithTables
      }),
    )
    console.log(
      `[generateSchedule] Fetched available tables. Data: ${JSON.stringify(
        dealersWithTables.map((d) => ({ id: d.id, name: d.name, available_tables: d.available_tables })),
      )}`,
    )

    const eligibleDealers = dealersWithTables.filter(
      (dealer) => dealer.available_tables && dealer.available_tables.length > 0,
    )
    console.log(`[generateSchedule] Found ${eligibleDealers.length} eligible dealers with available tables.`)

    if (eligibleDealers.length === 0) {
      console.warn(
        "[generateSchedule] No eligible dealers found after fetching and filtering available tables. Returning empty schedule.",
      )
      // Връщаме празен график, но с информация за предпочитанията, ако има такива,
      // за да може UI да покаже поне тях, ако е нужно.
      if (preferences) {
        ;(schedule as any)._preferences = preferences
      }
      return schedule
    }

    const allTables = new Set<string>()
    eligibleDealers.forEach((dealer) => dealer.available_tables.forEach((table) => allTables.add(table)))
    const uniqueTables = Array.from(allTables)
    console.log(`[generateSchedule] Unique tables for this schedule: ${uniqueTables.join(", ")}`)

    if (uniqueTables.length === 0) {
      console.warn(
        "[generateSchedule] No unique tables found among eligible dealers. This usually means no dealers can work any tables. Returning empty schedule.",
      )
      if (preferences) {
        ;(schedule as any)._preferences = preferences
      }
      return schedule
    }

    const params = calculateScheduleParameters(uniqueTables, eligibleDealers)
    const dealerAssignments = {} // Инициализираме празен обект за присвоенията на дилъри

    if (params.D <= params.T) {
      console.error(`[generateSchedule] Not enough dealers (${params.D}) to cover all tables (${params.T}). Aborting.`)
      // Може да върнем грешка или празен график
      return schedule
    }

    // Извикваме новия алгоритъм
    const generatedSchedule = generateChainRotationSchedule(
      eligibleDealers,
      uniqueTables,
      timeSlots,
      params,
      preferences,
    )

    // Добавяме предпочитанията към крайния обект, ако съществуват
    if (preferences) {
      ;(generatedSchedule as any)._preferences = preferences
    }

    console.log("[generateSchedule] Schedule generation finished.")
    return generatedSchedule
  } catch (error: any) {
    console.error("[generateSchedule] Critical error during schedule generation:", error.message, error.stack)
    // Връщаме празен график в случай на критична грешка, за да не се счупи UI
    const emptySchedule: ScheduleData = {}
    if (preferences) {
      ;(emptySchedule as any)._preferences = preferences
    }
    return emptySchedule
  }
}
