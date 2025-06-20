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
    console.error(
      `[getDealerAvailableTables] Dealer ID is undefined for dealer object: ${JSON.stringify(dealer)}. Cannot fetch available tables.`,
    )
    return []
  }
  console.log(`[getDealerAvailableTables] Fetching available tables for dealer: ${dealer.name} (ID: ${dealer.id})`)

  try {
    // 1. Получаваме разрешенията за типове маси на дилъра
    const { data: permissions, error: permissionsError } = await supabaseClient
      .from("dealer_table_types")
      .select("table_type")
      .eq("dealer_id", dealer.id)

    if (permissionsError) {
      console.error(
        `[getDealerAvailableTables] Error fetching permissions for dealer ${dealer.name} (ID: ${dealer.id}):`,
        permissionsError,
      )
      return []
    }

    if (!permissions || permissions.length === 0) {
      console.log(
        `[getDealerAvailableTables] No table type permissions found for dealer ${dealer.name} (ID: ${dealer.id}).`,
      )
      return []
    }

    // 2. Извличаме имената на разрешените типове маси
    const permittedTypes = permissions.map((p: any) => p.table_type).filter(Boolean)

    if (permittedTypes.length === 0) {
      console.log(
        `[getDealerAvailableTables] No valid table types extracted from permissions for dealer ${dealer.name} (ID: ${dealer.id}). Permissions data: ${JSON.stringify(permissions)}`,
      )
      return []
    }

    console.log(
      `[getDealerAvailableTables] Dealer ${dealer.name} (ID: ${dealer.id}) has permissions for table types: ${permittedTypes.join(", ")}`,
    )

    // 3. Получаваме всички активни маси, които съответстват на разрешените типове
    const { data: tables, error: tablesError } = await supabaseClient
      .from("casino_tables")
      .select("name")
      .in("type", permittedTypes)
      .eq("status", "active")

    if (tablesError) {
      console.error(
        `[getDealerAvailableTables] Error fetching tables for permitted types for dealer ${dealer.name} (ID: ${dealer.id}):`,
        tablesError,
      )
      return []
    }

    if (!tables || tables.length === 0) {
      console.log(
        `[getDealerAvailableTables] No active tables found for the permitted types for dealer ${dealer.name} (ID: ${dealer.id}). Permitted types: ${permittedTypes.join(", ")}`,
      )
      return []
    }

    const availableTableNames = tables.map((t: any) => t.name).filter(Boolean)
    console.log(
      `[getDealerAvailableTables] Dealer ${dealer.name} (ID: ${dealer.id}) can work on ${availableTableNames.length} tables: ${availableTableNames.join(", ")}`,
    )

    return availableTableNames
  } catch (error) {
    console.error(`[getDealerAvailableTables] Unexpected error for dealer ${dealer.name} (ID: ${dealer.id}):`, error)
    return []
  }
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
    console.warn(
      `[calculateScheduleParameters] Cannot calculate parameters with D=${D} dealers or T=${T} tables. Returning zeroed parameters.`,
    )
    return {
      R,
      T,
      D,
      totalWorkSlots: 0,
      workSlotsPerDealer: 0,
      extraWorkSlots: 0,
      breakSlotsPerDealer: R,
      dealersOnBreakCount: 0,
    }
  }

  // Брой дилъри в почивка във всеки един момент
  const dealersOnBreakCount = D - T
  if (dealersOnBreakCount <= 0) {
    console.warn(
      `[calculateScheduleParameters] Number of dealers (${D}) is not greater than the number of tables (${T}). No breaks can be scheduled.`,
    )
  }

  // Общ брой работни слотове, които трябва да бъдат покрити
  const totalWorkSlots = R * T

  // Базов брой работни слотове на дилър
  const workSlotsPerDealer = Math.floor(totalWorkSlots / D)

  // Допълнителни работни слотове за разпределение
  const extraWorkSlots = totalWorkSlots % D

  // Базов брой почивки на дилър
  const breakSlotsPerDealer = R - workSlotsPerDealer

  console.log(
    `[calculateScheduleParameters] R=${R}, T=${T}, D=${D}, DealersOnBreak=${dealersOnBreakCount}, totalWorkSlots=${totalWorkSlots}, workSlotsPerDealer=${workSlotsPerDealer}, extraWorkSlots=${extraWorkSlots}, breakSlotsPerDealer=${breakSlotsPerDealer}`,
  )

  return {
    R,
    T,
    D,
    totalWorkSlots,
    workSlotsPerDealer,
    extraWorkSlots,
    breakSlotsPerDealer,
    dealersOnBreakCount: Math.max(0, dealersOnBreakCount), // Гарантираме, че не е отрицателно
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
  console.log(`[initializeDealerAssignments] Initializing assignments for ${eligibleDealers.length} dealers.`)

  eligibleDealers.forEach((dealer, index) => {
    const targetRotations = params.workSlotsPerDealer + (index < params.extraWorkSlots ? 1 : 0)
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
    console.log(
      `[initializeDealerAssignments] Dealer ${dealer.name} (ID: ${dealer.id}): targetRotations=${targetRotations}, targetBreaks=${targetBreaks}`,
    )
  })
  return dealerAssignments
}
