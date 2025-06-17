import { supabase } from "@/lib/supabase-singleton"
import type { DealerFineStats } from "@/lib/types"

export async function getDealerFineStats(dealerId: string): Promise<DealerFineStats> {
  try {
    // Първо проверяваме дали колоните за глоби съществуват
    const { data: testData, error: testError } = await supabase.from("dealer_reports").select("fine_amount").limit(1)

    // Ако колоните не съществуват, връщаме празна статистика
    if (testError && testError.message.includes("does not exist")) {
      return {
        totalFines: 0,
        totalFineAmount: 0,
        appliedFines: 0,
        appliedFineAmount: 0,
        pendingFines: 0,
        pendingFineAmount: 0,
      }
    }

    const { data, error } = await supabase
      .from("dealer_reports")
      .select("fine_amount, fine_applied")
      .eq("dealer_id", dealerId)
      .not("fine_amount", "is", null)
      .gt("fine_amount", 0)

    if (error) throw error

    const reports = data || []

    const totalFines = reports.length
    const totalFineAmount = reports.reduce((sum, report) => sum + (report.fine_amount || 0), 0)

    const appliedReports = reports.filter((report) => report.fine_applied)
    const appliedFines = appliedReports.length
    const appliedFineAmount = appliedReports.reduce((sum, report) => sum + (report.fine_amount || 0), 0)

    const pendingFines = totalFines - appliedFines
    const pendingFineAmount = totalFineAmount - appliedFineAmount

    return {
      totalFines,
      totalFineAmount,
      appliedFines,
      appliedFineAmount,
      pendingFines,
      pendingFineAmount,
    }
  } catch (error) {
    console.error("Error fetching dealer fine stats:", error)
    return {
      totalFines: 0,
      totalFineAmount: 0,
      appliedFines: 0,
      appliedFineAmount: 0,
      pendingFines: 0,
      pendingFineAmount: 0,
    }
  }
}
