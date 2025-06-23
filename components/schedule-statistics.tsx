"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import type { Dealer, Schedule, TimeSlot } from "@/lib/types"
import { useEffect, useMemo, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase-singleton"
import { toast } from "sonner"
import { startOfDay, endOfDay } from "date-fns"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts"
import { AlertCircle, Award, BarChartHorizontal, Coffee, Loader2, Table2 } from "lucide-react" // Added Table2

interface ScheduleStatisticsProps {
  scheduleData: Schedule["schedule_data"]
  dealersInSchedule: Dealer[]
  timeSlotsArray: TimeSlot[]
  scheduleDate: string
}

interface DealerStat {
  dealerId: string
  dealerName: string
  breakCount: number
  workSlots: number
  uniqueTables: number
  tableAssignments: Record<string, number>
}

interface DailyReport {
  dealer_id: string
  dealers: { name: string; nickname: string | null } | null
  table_id: string | null // Added
  tables: { name: string } | null // Added for table name
}

export function ScheduleStatistics({
  scheduleData,
  dealersInSchedule,
  timeSlotsArray,
  scheduleDate,
}: ScheduleStatisticsProps) {
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(
    dealersInSchedule.length > 0 ? dealersInSchedule[0].id : null,
  )
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)

  useEffect(() => {
    const fetchDailyReports = async () => {
      if (!scheduleDate) return
      setReportsLoading(true)
      try {
        const from = startOfDay(new Date(scheduleDate)).toISOString()
        const to = endOfDay(new Date(scheduleDate)).toISOString()

        const { data, error } = await supabase
          .from("dealer_reports")
          .select("dealer_id, table_id, dealers (name, nickname), tables (name)") // Updated select
          .gte("reported_at", from)
          .lte("reported_at", to)

        if (error) throw error
        setDailyReports(data as DailyReport[])
      } catch (error: any) {
        toast.error("Грешка при зареждане на репортите за деня.", { description: error.message })
      } finally {
        setReportsLoading(false)
      }
    }
    fetchDailyReports()
  }, [scheduleDate])

  const allDealerStats = useMemo<DealerStat[]>(() => {
    if (!scheduleData || !dealersInSchedule.length || !timeSlotsArray.length) return []
    return dealersInSchedule.map((dealer) => {
      let breakCount = 0,
        workSlots = 0
      const tableAssignments: Record<string, number> = {}
      timeSlotsArray.forEach((slot) => {
        const assignment = scheduleData![slot.time]?.[dealer.id]
        if (assignment === "BREAK") breakCount++
        else if (assignment && assignment !== "-") {
          workSlots++
          tableAssignments[assignment] = (tableAssignments[assignment] || 0) + 1
        }
      })
      return {
        dealerId: dealer.id,
        dealerName: dealer.nickname ? `${dealer.name} (${dealer.nickname})` : dealer.name,
        breakCount,
        workSlots,
        uniqueTables: Object.keys(tableAssignments).length,
        tableAssignments,
      }
    })
  }, [scheduleData, dealersInSchedule, timeSlotsArray])

  const generalAnalysis = useMemo(() => {
    if (!allDealerStats.length) return null
    const totalWorkSlots = allDealerStats.reduce((sum, stat) => sum + stat.workSlots, 0)
    const totalBreaks = allDealerStats.reduce((sum, stat) => sum + stat.breakCount, 0)
    const workSlotsRange = allDealerStats.reduce(
      (range, stat) => ({ min: Math.min(range.min, stat.workSlots), max: Math.max(range.max, stat.workSlots) }),
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    )
    const breaksRange = allDealerStats.reduce(
      (range, stat) => ({ min: Math.min(range.min, stat.breakCount), max: Math.max(range.max, stat.breakCount) }),
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    )

    const reportCountsByDealer: Record<string, number> = {}
    const reportCountsByTable: Record<string, { count: number; name: string | null }> = {}

    dailyReports.forEach((report) => {
      if (report.dealer_id) {
        reportCountsByDealer[report.dealer_id] = (reportCountsByDealer[report.dealer_id] || 0) + 1
      }
      if (report.table_id) {
        const currentCount = reportCountsByTable[report.table_id]?.count || 0
        reportCountsByTable[report.table_id] = {
          count: currentCount + 1,
          name: report.tables?.name || `Маса ID: ${report.table_id}`,
        }
      }
    })

    const topReportedDealerEntry = Object.entries(reportCountsByDealer).sort(([, a], [, b]) => b - a)[0]
    let topReportedDealerName = "Няма"
    if (topReportedDealerEntry) {
      const dealerInfo = dailyReports.find((r) => r.dealer_id === topReportedDealerEntry[0])?.dealers
      topReportedDealerName = dealerInfo?.nickname
        ? `${dealerInfo.name} (${dealerInfo.nickname})`
        : dealerInfo?.name || "Неизвестен"
    }

    const topReportedTableEntry = Object.entries(reportCountsByTable).sort(([, a], [, b]) => b.count - a.count)[0]
    let topReportedTableName = "Няма"
    if (topReportedTableEntry) {
      topReportedTableName = topReportedTableEntry[1].name || "Неизвестна маса"
    }

    const averageUniqueTables =
      allDealerStats.length > 0
        ? (allDealerStats.reduce((sum, stat) => sum + stat.uniqueTables, 0) / allDealerStats.length).toFixed(1)
        : "0"

    return {
      totalWorkSlots,
      totalBreaks,
      workSlotsRange: workSlotsRange.min === Number.POSITIVE_INFINITY ? { min: 0, max: 0 } : workSlotsRange,
      breaksRange: breaksRange.min === Number.POSITIVE_INFINITY ? { min: 0, max: 0 } : breaksRange,
      totalDailyReports: dailyReports.length,
      topReportedDealer: topReportedDealerName,
      topReportedTable: topReportedTableName,
      averageUniqueTables, // Добави тази линия
    }
  }, [allDealerStats, dailyReports])

  const filteredDealers = useMemo(() => {
    if (!searchTerm) return dealersInSchedule
    return dealersInSchedule.filter((d) =>
      (d.name.toLowerCase() + (d.nickname || "").toLowerCase()).includes(searchTerm.toLowerCase()),
    )
  }, [dealersInSchedule, searchTerm])

  const selectedDealerStat = useMemo(() => {
    if (!selectedDealerId) return null
    return allDealerStats.find((stat) => stat.dealerId === selectedDealerId) || null
  }, [selectedDealerId, allDealerStats])

  if (selectedDealerId && !filteredDealers.find((d) => d.id === selectedDealerId) && filteredDealers.length > 0) {
    setSelectedDealerId(filteredDealers[0].id)
  } else if (filteredDealers.length === 0 && selectedDealerId) {
    if (selectedDealerId) setSelectedDealerId(null)
  }

  if (!allDealerStats.length) return null

  const pieChartData = [
    { name: "Работа", value: generalAnalysis?.totalWorkSlots || 0 },
    { name: "Почивки", value: generalAnalysis?.totalBreaks || 0 },
  ]
  const PIE_COLORS = ["#3b82f6", "#f97316"]

  return (
    <div className="mt-8 print:hidden">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Анализ на графика</CardTitle>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Зареждане на анализ...</p>
            </div>
          ) : (
            generalAnalysis && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Общ преглед на смяната</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {" "}
                    {/* Adjusted for 5 cards */}
                    <StatCard
                      title="Репорти за деня"
                      value={generalAnalysis.totalDailyReports}
                      icon={<AlertCircle className="h-6 w-6 text-red-500" />}
                    />
                    <StatCard
                      title="Дилър с най-много репорти"
                      value={generalAnalysis.topReportedDealer}
                      icon={<Award className="h-6 w-6 text-yellow-500" />}
                      isText
                    />
                    <StatCard
                      title="Маса с най-много репорти"
                      value={generalAnalysis.topReportedTable}
                      icon={<Table2 className="h-6 w-6 text-purple-500" />}
                      isText
                    />
                    <StatCard
                      title="Средно уникални маси"
                      value={generalAnalysis.averageUniqueTables}
                      icon={<BarChartHorizontal className="h-6 w-6 text-green-500" />}
                    />
                    <StatCard
                      title="Баланс работни слотове"
                      value={`${generalAnalysis.workSlotsRange.min} - ${generalAnalysis.workSlotsRange.max}`}
                      icon={<BarChartHorizontal className="h-6 w-6 text-blue-500" />}
                    />
                    <StatCard
                      title="Баланс почивки"
                      value={`${generalAnalysis.breaksRange.min} - ${generalAnalysis.breaksRange.max}`}
                      icon={<Coffee className="h-6 w-6 text-orange-500" />}
                    />
                  </div>
                  <Card className="lg:col-span-1">
                    {" "}
                    {/* Ensure pie chart takes remaining space or its own column */}
                    <CardHeader>
                      <CardTitle className="text-base">Работа / Почивки</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[160px] sm:h-[200px] md:h-[160px]">
                      {" "}
                      {/* Adjusted height for consistency */}
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60}>
                            {pieChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => [value, "Слотове"]}
                            contentStyle={{
                              background: "hsl(var(--background))",
                              borderColor: "hsl(var(--border))",
                              borderRadius: "var(--radius)",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )
          )}

          <Separator className="my-6" />

          <div>
            <h3 className="text-lg font-semibold mb-3">Индивидуална статистика по дилър</h3>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <Input
                type="text"
                placeholder="Търсене на дилър..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-xs"
              />
              <Select value={selectedDealerId || ""} onValueChange={(value) => setSelectedDealerId(value || null)}>
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Изберете дилър" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDealers.map((dealer) => (
                    <SelectItem key={dealer.id} value={dealer.id}>
                      {dealer.nickname ? `${dealer.name} (${dealer.nickname})` : dealer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDealerStat && (
              <div>
                <h4 className="text-md font-semibold mb-2 text-primary">{selectedDealerStat.dealerName}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 bg-muted/50 rounded-md">
                    <strong>Почивки:</strong> {selectedDealerStat.breakCount}
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <strong>Работени слотове:</strong> {selectedDealerStat.workSlots}
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <strong>Уникални маси:</strong> {selectedDealerStat.uniqueTables}
                  </div>
                </div>
                {Object.keys(selectedDealerStat.tableAssignments).length > 0 && (
                  <div className="mt-4">
                    <strong className="block mb-1 text-sm">Разпределение по маси:</strong>
                    <ul className="list-disc list-inside ml-4 text-sm max-h-48 overflow-y-auto bg-muted/20 p-3 rounded-md">
                      {Object.entries(selectedDealerStat.tableAssignments)
                        .sort(([, countA], [, countB]) => countB - countA)
                        .map(([table, count]) => (
                          <li key={table}>
                            {table}: {count}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
  isText = false,
}: { title: string; value: string | number; icon: React.ReactNode; isText?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${isText ? "truncate text-lg" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  )
}
