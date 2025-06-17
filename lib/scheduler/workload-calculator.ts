import type { DealerWithTables, ScheduleParameters, DealerAssignment } from "../scheduler-types"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Извлича достъпните маси за дилър от базата данни
 */
export async function getDealerAvailableTables(
  dealer: DealerWithTables,
  supabaseClient: SupabaseClient,
): Promise<string[]> {
  if (!dealer.id) {
    console.error("Dealer ID is undefined, cannot fetch available tables.")
    return []
  }

  const { data: permissions, error } = await supabaseClient
    .from("dealer_table_permissions")
    .select("table_types(name)")
    .eq("dealer_id", dealer.id)
    .eq("can_work", true)

  if (error) {
    console.error(`Error fetching table permissions for dealer ${dealer.name}:`, error)
    return []
  }

  // Извличаме имената на типовете маси
  const permittedTableTypes = permissions?.map((p: any) => p.table_types?.name).filter(Boolean) || []

  // Извличаме всички маси, които съответстват на разрешените типове
  if (permittedTableTypes.length === 0) {
    return []
  }

  const { data: tables, error: tablesError } = await supabaseClient
    .from("tables")
    .select("name")
    .in(
      "table_type_id",
      (await supabaseClient.from("table_types").select("id").in("name", permittedTableTypes)).data?.map((t) => t.id) ||
        [],
    )

  if (tablesError) {
    console.error(`Error fetching tables for permitted types for dealer ${dealer.name}:`, tablesError)
    return []
  }

  return tables?.map((t) => t.name) || []
}

/**
 * Изчислява параметрите на графика
 */
export function calculateScheduleParameters(
  uniqueTables: string[],
  eligibleDealers: DealerWithTables[],
): ScheduleParameters {
  const R = 24 // Общо 24 времеви слота (ротации)
  const T = uniqueTables.length
  const D = eligibleDealers.length

  if (D === 0 || T === 0) {
    return { R, T, D, totalWorkSlots: 0, workSlotsPerDealer: 0, extraWorkSlots: 0, breakSlotsPerDealer: 0 }
  }

  // Общ брой работни слотове, които трябва да бъдат покрити
  const totalWorkSlots = R * T

  // Базов брой работни слотове на дилър
  const workSlotsPerDealer = Math.floor(totalWorkSlots / D)

  // Допълнителни работни слотове за разпределение
  const extraWorkSlots = totalWorkSlots % D

  // Базов брой почивки на дилър
  // Всеки дилър има R слота общо. Ако работи workSlotsPerDealer, останалите са за почивка.
  const breakSlotsPerDealer = R - workSlotsPerDealer

  return {
    R,
    T,
    D,
    totalWorkSlots,
    workSlotsPerDealer,
    extraWorkSlots,
    breakSlotsPerDealer,
  }
}

/**
 * Инициализира структурите за проследяване на назначенията на дилърите
 */
export function initializeDealerAssignments(
  eligibleDealers: DealerWithTables[],
  params: ScheduleParameters,
): Record<string, DealerAssignment> {
  const dealerAssignments: Record<string, DealerAssignment> = {}

  eligibleDealers.forEach((dealer, index) => {
    const targetRotations = params.workSlotsPerDealer + (index < params.extraWorkSlots ? 1 : 0)
    // Целевият брой почивки е общият брой слотове минус целевите ротации
    const targetBreaks = params.R - targetRotations

    dealerAssignments[dealer.id] = {
      rotations: 0,
      breaks: 0,
      lastTable: "",
      lastTableIndex: -1,
      assignedTables: new Set<string>(),
      breakPositions: [],
      needsExtraRotation: index < params.extraWorkSlots,
      targetRotations: targetRotations,
      targetBreaks: targetBreaks,
      tablesInCurrentWorkSegment: new Set<string>(),
      isFirstWorkSegmentOfShift: true,
    }
  })
  return dealerAssignments
}
