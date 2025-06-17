import { supabase } from "@/lib/supabase-singleton"
import { INCIDENT_TYPES, REPORT_STATUS } from "@/lib/incident-types"
import { FINE_STATUS } from "@/lib/fine-status"
import type { ScheduleData } from "@/lib/types"

export type TopDealerReportStat = {
  dealer_id: string
  dealer_name: string
  dealer_nickname?: string | null
  report_count: number
}

export type ReportsByTableStat = {
  table_name: string
  report_count: number
}

export type DealerShiftsReportsStat = {
  dealer_id: string
  dealer_name: string
  dealer_nickname?: string | null
  shift_count: number
  report_count: number
  reports_per_shift: number
}

export type IncidentTypesByDealerStat = {
  dealer_id: string
  dealer_name: string
  dealer_nickname?: string | null
  incident_type: string
  incident_type_label: string
  count: number
}

export type PieChartDataItem = {
  name: string
  value: number
  label?: string
}

const formatDateForQuery = (date: Date): string => {
  return date.toISOString().split("T")[0]
}

// 1. Топ 5 дилъри с най-много/най-малко репорти
export async function fetchTopDealersByReports(
  startDate: Date,
  endDate: Date,
  order: "asc" | "desc",
  limit = 5,
): Promise<TopDealerReportStat[]> {
  const { data: dealers, error: dealersError } = await supabase.from("dealers").select("id, name, nickname")

  if (dealersError) throw dealersError
  if (!dealers) return []

  const { data: reports, error: reportsError } = await supabase
    .from("dealer_reports")
    .select("dealer_id, id")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())

  if (reportsError) throw reportsError

  const reportCounts: Record<string, number> = {}
  reports?.forEach((report) => {
    if (report.dealer_id) {
      reportCounts[report.dealer_id] = (reportCounts[report.dealer_id] || 0) + 1
    }
  })

  const stats: TopDealerReportStat[] = dealers.map((dealer) => ({
    dealer_id: dealer.id,
    dealer_name: dealer.name,
    dealer_nickname: dealer.nickname,
    report_count: reportCounts[dealer.id] || 0,
  }))

  stats.sort((a, b) => {
    if (order === "asc") {
      return a.report_count - b.report_count || a.dealer_name.localeCompare(b.dealer_name)
    } else {
      return b.report_count - a.report_count || a.dealer_name.localeCompare(b.dealer_name)
    }
  })

  return stats.slice(0, limit)
}

// 2. Маси с най-много регистрирани инциденти
export async function fetchReportsByTable(startDate: Date, endDate: Date, limit = 10): Promise<ReportsByTableStat[]> {
  const { data, error } = await supabase
    .from("dealer_reports")
    .select("table_name, id")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())
    .not("table_name", "is", null)

  if (error) throw error
  if (!data) return []

  const counts: Record<string, number> = {}
  data.forEach((report) => {
    if (report.table_name) {
      counts[report.table_name] = (counts[report.table_name] || 0) + 1
    }
  })

  return Object.entries(counts)
    .map(([table_name, report_count]) => ({ table_name, report_count }))
    .sort((a, b) => b.report_count - a.report_count)
    .slice(0, limit)
}

// 3. Статистика за репорти по дилъри, като смяна колко смени са карали и колко репорта имат
export async function fetchDealerShiftsAndReports(startDate: Date, endDate: Date): Promise<DealerShiftsReportsStat[]> {
  const { data: dealers, error: dealersError } = await supabase.from("dealers").select("id, name, nickname")
  if (dealersError) throw dealersError
  if (!dealers) return []

  const { data: schedules, error: schedulesError } = await supabase
    .from("schedules")
    .select("schedule_data")
    .gte("date", formatDateForQuery(startDate))
    .lte("date", formatDateForQuery(endDate))

  if (schedulesError) throw schedulesError

  const shiftCounts: Record<string, number> = {}
  if (schedules) {
    for (const schedule of schedules) {
      const scheduleData = schedule.schedule_data as ScheduleData
      const dealersInThisShift = new Set<string>()
      if (scheduleData) {
        // Check if scheduleData is not null or undefined
        for (const timeSlot in scheduleData) {
          if (timeSlot === "_preferences" || timeSlot === "_absences") continue
          if (scheduleData[timeSlot]) {
            // Check if scheduleData[timeSlot] is not null or undefined
            for (const dealerId in scheduleData[timeSlot]) {
              if (scheduleData[timeSlot][dealerId] !== "BREAK" && scheduleData[timeSlot][dealerId] !== "ПОЧИВКА") {
                dealersInThisShift.add(dealerId)
              }
            }
          }
        }
      }
      dealersInThisShift.forEach((dealerId) => {
        shiftCounts[dealerId] = (shiftCounts[dealerId] || 0) + 1
      })
    }
  }

  const { data: reports, error: reportsError } = await supabase
    .from("dealer_reports")
    .select("dealer_id, id")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())

  if (reportsError) throw reportsError

  const reportCounts: Record<string, number> = {}
  reports?.forEach((report) => {
    if (report.dealer_id) {
      reportCounts[report.dealer_id] = (reportCounts[report.dealer_id] || 0) + 1
    }
  })

  return dealers
    .map((dealer) => {
      const shifts = shiftCounts[dealer.id] || 0
      const reps = reportCounts[dealer.id] || 0
      return {
        dealer_id: dealer.id,
        dealer_name: dealer.name,
        dealer_nickname: dealer.nickname,
        shift_count: shifts,
        report_count: reps,
        reports_per_shift: shifts > 0 ? reps / shifts : 0,
      }
    })
    .sort((a, b) => b.reports_per_shift - a.reports_per_shift)
}

// 4. Разпределение на типовете инциденти по дилър
export async function fetchIncidentTypesByDealer(startDate: Date, endDate: Date): Promise<IncidentTypesByDealerStat[]> {
  const { data, error } = await supabase
    .from("dealer_reports")
    .select("dealer_id, incident_type, dealers (name, nickname)")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())

  if (error) throw error
  if (!data) return []

  const stats: Record<string, Record<string, number>> = {}

  data.forEach((report) => {
    if (!report.dealer_id || !report.dealers) return

    if (!stats[report.dealer_id]) {
      stats[report.dealer_id] = {}
    }
    stats[report.dealer_id][report.incident_type] = (stats[report.dealer_id][report.incident_type] || 0) + 1
  })

  const result: IncidentTypesByDealerStat[] = []
  for (const dealerId in stats) {
    const dealerInfo = data.find((r) => r.dealer_id === dealerId)?.dealers
    if (!dealerInfo) continue

    for (const incidentType in stats[dealerId]) {
      const typeLabel = INCIDENT_TYPES.find((it) => it.value === incidentType)?.label || incidentType
      result.push({
        dealer_id: dealerId,
        dealer_name: dealerInfo.name,
        dealer_nickname: dealerInfo.nickname,
        incident_type: incidentType,
        incident_type_label: typeLabel,
        count: stats[dealerId][incidentType],
      })
    }
  }

  return result.sort((a, b) => {
    if (a.dealer_name !== b.dealer_name) {
      return a.dealer_name.localeCompare(b.dealer_name)
    }
    return b.count - a.count
  })
}

// 5. Общо разпределение на типовете инциденти
export async function fetchOverallIncidentTypeDistribution(
  startDate: Date,
  endDate: Date,
): Promise<PieChartDataItem[]> {
  const { data, error } = await supabase
    .from("dealer_reports")
    .select("incident_type, id")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())

  if (error) throw error
  if (!data) return []

  const counts: Record<string, number> = {}
  data.forEach((report) => {
    counts[report.incident_type] = (counts[report.incident_type] || 0) + 1
  })

  return Object.entries(counts)
    .map(([type, value]) => ({
      name: INCIDENT_TYPES.find((it) => it.value === type)?.label || type,
      value,
    }))
    .sort((a, b) => b.value - a.value)
}

// 6. Общо разпределение на статусите на репорти
export async function fetchOverallReportStatusDistribution(
  startDate: Date,
  endDate: Date,
): Promise<PieChartDataItem[]> {
  const { data, error } = await supabase
    .from("dealer_reports")
    .select("status, id")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())

  if (error) throw error
  if (!data) return []

  const counts: Record<string, number> = {}
  data.forEach((report) => {
    if (report.status) {
      counts[report.status] = (counts[report.status] || 0) + 1
    }
  })

  return Object.entries(counts)
    .map(([status, value]) => ({
      name: REPORT_STATUS.find((rs) => rs.value === status)?.label || status,
      value,
    }))
    .sort((a, b) => b.value - a.value)
}

// 7. Общо разпределение на статусите на глоби
export async function fetchOverallFineStatusDistribution(startDate: Date, endDate: Date): Promise<PieChartDataItem[]> {
  const { data, error } = await supabase
    .from("dealer_reports")
    .select("fine_status, id")
    .gte("reported_at", startDate.toISOString())
    .lte("reported_at", endDate.toISOString())
    .not("fine_amount", "is", null)

  if (error) throw error
  if (!data) return []

  const counts: Record<string, number> = {}
  data.forEach((report) => {
    if (report.fine_status) {
      counts[report.fine_status] = (counts[report.fine_status] || 0) + 1
    }
  })

  return Object.entries(counts)
    .map(([status, value]) => ({
      name: FINE_STATUS.find((fs) => fs.value === status)?.label || status,
      value,
    }))
    .sort((a, b) => b.value - a.value)
}
