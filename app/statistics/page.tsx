"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { toast } from "sonner"
import {
  fetchTopDealersByReports,
  fetchReportsByTable,
  fetchDealerShiftsAndReports,
  fetchIncidentTypesByDealer,
  fetchOverallIncidentTypeDistribution,
  fetchOverallReportStatusDistribution,
  fetchOverallFineStatusDistribution,
  type TopDealerReportStat,
  type ReportsByTableStat,
  type DealerShiftsReportsStat,
  type IncidentTypesByDealerStat,
  type PieChartDataItem,
} from "@/lib/statistics-data"
import type { DateRange } from "react-day-picker"
import { subDays, format } from "date-fns"
import {
  Users,
  AlertTriangle,
  ListChecks,
  TrendingDown,
  TrendingUp,
  PieChartIcon as PieIconLucide,
  Ratio,
  Palette,
  FileText,
} from "lucide-react"
import { ResponsiveContainer, PieChart, Pie, Cell, Sector, Tooltip, Legend, type TooltipProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"
import { ModernStatList } from "@/components/modern-stat-list" // Импортираме новия компонент

// Разширена цветова палитра
const EXTENDED_COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#AF19FF",
  "#FF4F81",
  "#4BC0C0",
  "#FF9F40",
  "#9966FF",
  "#FF6384",
  "#36A2EB",
  "#FFCD56",
  "#4CAF50",
  "#F44336",
  "#2196F3",
  "#9C27B0",
  "#FFEB3B",
  "#795548",
]

// Компонент за персонализиран активен сегмент на Pie Chart
const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props
  const sin = Math.sin(-RADIAN * midAngle)
  const cos = Math.cos(-RADIAN * midAngle)
  const sx = cx + (outerRadius + 10) * cos
  const sy = cy + (outerRadius + 10) * sin
  const mx = cx + (outerRadius + 30) * cos
  const my = cy + (outerRadius + 30) * sin
  const ex = mx + (cos >= 0 ? 1 : -1) * 22
  const ey = my
  const textAnchor = cos >= 0 ? "start" : "end"

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} fontWeight="bold">
        {payload.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 5} // Леко уголемяване на активния сегмент
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
      />
      <Sector // Външен контур за акцент
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 7}
        outerRadius={outerRadius + 10}
        fill={fill}
        opacity={0.5}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333">{`${value}`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
        {`(${(percent * 100).toFixed(2)}%)`}
      </text>
    </g>
  )
}

// Персонализиран Tooltip
const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/90 backdrop-blur-sm border border-border p-3 rounded-lg shadow-xl text-sm">
        <p className="label font-semibold text-foreground mb-1">{`${label}`}</p>
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="flex items-center">
            <span className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: entry.color || entry.payload.fill }} />
            <span className="text-muted-foreground mr-1">{`${entry.name}:`}</span>
            <span className="font-medium text-foreground">{`${entry.value?.toLocaleString()}`}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

// Компонент за показване при липса на данни
const NoDataMessage = ({ message = "Няма данни за избрания период." }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
    <FileText className="w-12 h-12 mb-2 opacity-50" />
    <p>{message}</p>
  </div>
)

export default function StatisticsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  })

  const [topDealersMostReports, setTopDealersMostReports] = useState<TopDealerReportStat[]>([])
  const [topDealersLeastReports, setTopDealersLeastReports] = useState<TopDealerReportStat[]>([])
  const [reportsByTable, setReportsByTable] = useState<ReportsByTableStat[]>([])
  const [dealerShiftsReports, setDealerShiftsReports] = useState<DealerShiftsReportsStat[]>([])
  const [incidentTypesByDealer, setIncidentTypesByDealer] = useState<IncidentTypesByDealerStat[]>([])

  const [overallIncidentTypes, setOverallIncidentTypes] = useState<PieChartDataItem[]>([])
  const [overallReportStatuses, setOverallReportStatuses] = useState<PieChartDataItem[]>([])
  const [overallFineStatuses, setOverallFineStatuses] = useState<PieChartDataItem[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [activePieIndex, setActivePieIndex] = useState<Record<string, number>>({})

  const onPieEnter = (pieId: string, _: any, index: number) => {
    setActivePieIndex((prev) => ({ ...prev, [pieId]: index }))
  }

  useEffect(() => {
    loadStatistics()
  }, [dateRange])

  const loadStatistics = async () => {
    if (!dateRange || !dateRange.from || !dateRange.to) {
      toast.error("Моля, изберете валиден период.")
      return
    }
    setIsLoading(true)
    try {
      const [
        mostReportsData,
        leastReportsData,
        reportsByTableData,
        shiftsReportsData,
        incidentsByDealerData,
        overallIncidentsData,
        overallReportStatusData,
        overallFineStatusData,
      ] = await Promise.all([
        fetchTopDealersByReports(dateRange.from, dateRange.to, "desc"),
        fetchTopDealersByReports(dateRange.from, dateRange.to, "asc"),
        fetchReportsByTable(dateRange.from, dateRange.to),
        fetchDealerShiftsAndReports(dateRange.from, dateRange.to),
        fetchIncidentTypesByDealer(dateRange.from, dateRange.to),
        fetchOverallIncidentTypeDistribution(dateRange.from, dateRange.to),
        fetchOverallReportStatusDistribution(dateRange.from, dateRange.to),
        fetchOverallFineStatusDistribution(dateRange.from, dateRange.to),
      ])
      setTopDealersMostReports(mostReportsData)
      setTopDealersLeastReports(leastReportsData)
      setReportsByTable(reportsByTableData)
      setDealerShiftsReports(shiftsReportsData)
      setIncidentTypesByDealer(incidentsByDealerData)
      setOverallIncidentTypes(overallIncidentsData as PieChartDataItem[])
      setOverallReportStatuses(overallReportStatusData as PieChartDataItem[])
      setOverallFineStatuses(overallFineStatusData as PieChartDataItem[])
    } catch (error: any) {
      console.error("Error loading statistics:", error)
      toast.error(`Грешка при зареждане на статистиките: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (date: Date | undefined) => (date ? format(date, "dd.MM.yyyy") : "")

  const dealersReportsPerShiftChartData = dealerShiftsReports
    .filter((d) => d.shift_count > 0)
    .sort((a, b) => b.reports_per_shift - a.reports_per_shift)
    .slice(0, 10)
    .map((d) => ({ name: d.dealer_name, "Репорти/смяна": Number.parseFloat(d.reports_per_shift.toFixed(2)) }))

  // Дефиниции за градиенти
  const renderGradientDefs = (chartId: string, colors: string[]) => (
    <defs>
      {colors.map((color, index) => (
        <linearGradient
          key={`gradient-${chartId}-${index}`}
          id={`gradient-${chartId}-${index}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="5%" stopColor={color} stopOpacity={0.8} />
          <stop offset="95%" stopColor={color} stopOpacity={0.3} />
        </linearGradient>
      ))}
    </defs>
  )

  const commonPieChartProps = (pieId: string, data: PieChartDataItem[]) => ({
    activeIndex: activePieIndex[pieId] ?? 0,
    activeShape: renderActiveShape,
    onMouseEnter: (_: any, index: number) => onPieEnter(pieId, _, index),
    data: data,
    cx: "50%",
    cy: "50%",
    labelLine: false,
    outerRadius: 80,
    innerRadius: 50, // За "Donut" ефект
    fill: "#8884d8",
    dataKey: "value",
    nameKey: "name",
    paddingAngle: 1, // Малко разстояние между сегментите
  })

  return (
    <div className="space-y-6 p-4 md:p-6 bg-muted/20 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <Palette className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Статистики</h1>
            <p className="text-muted-foreground">Визуален анализ на представянето и инцидентите</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            initialDateFrom={dateRange?.from}
            initialDateTo={dateRange?.to}
            onUpdate={(values) => {
              if (values.range.from && values.range.to) {
                setDateRange({ from: values.range.from, to: values.range.to })
              } else if (values.range.from && !values.range.to) {
                setDateRange({ from: values.range.from, to: values.range.from })
              }
            }}
            align="end"
            locale="bg-BG"
            showCompare={false}
          />
          <Button onClick={loadStatistics} disabled={isLoading} variant="gooeyLeft">
            {isLoading ? "Зареждане..." : "Обнови"}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Статистики за периода: {formatDate(dateRange?.from)} - {formatDate(dateRange?.to)}
      </p>

      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="ml-3 text-muted-foreground">Зареждане на данните...</p>
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* НОВИ КОМПОНЕНТИ */}
          <ModernStatList
            title="Топ 5 дилъри (най-много репорти)"
            icon={<TrendingUp className="h-5 w-5 text-red-500" />}
            data={topDealersMostReports.map((d) => ({
              label: d.dealer_name,
              subLabel: d.dealer_nickname,
              value: d.report_count,
            }))}
          />

          <ModernStatList
            title="Топ 10 маси по репорти"
            icon={<AlertTriangle className="h-5 w-5 text-orange-500" />}
            data={reportsByTable.map((t) => ({
              label: t.table_name,
              value: t.report_count,
            }))}
          />

          <ModernStatList
            title="Топ 10 дилъри (репорти/смяна)"
            icon={<Ratio className="h-5 w-5 text-teal-500" />}
            data={dealerShiftsReports
              .filter((d) => d.shift_count > 0)
              .sort((a, b) => b.reports_per_shift - a.reports_per_shift)
              .slice(0, 10)
              .map((d) => ({
                label: d.dealer_name,
                subLabel: d.dealer_nickname,
                value: d.reports_per_shift,
              }))}
            valueFormatter={(value) => value.toFixed(2)}
          />

          {/* КРЪГОВИТЕ ДИАГРАМИ ОСТАВАТ СЪЩИТЕ */}
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <PieIconLucide className="h-5 w-5 text-purple-500" />
                <CardTitle>Типове инциденти</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="h-[300px]">
              {overallIncidentTypes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie {...commonPieChartProps("incidentTypesPie", overallIncidentTypes)}>
                      {overallIncidentTypes.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={EXTENDED_COLORS[index % EXTENDED_COLORS.length]}
                          stroke={EXTENDED_COLORS[index % EXTENDED_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Няма данни</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <PieIconLucide className="h-5 w-5 text-blue-500" />
                <CardTitle>Статуси на репорти</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="h-[300px]">
              {overallReportStatuses.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie {...commonPieChartProps("reportStatusPie", overallReportStatuses)}>
                      {overallReportStatuses.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={EXTENDED_COLORS[(index + 2) % EXTENDED_COLORS.length]}
                          stroke={EXTENDED_COLORS[(index + 2) % EXTENDED_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Няма данни</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <PieIconLucide className="h-5 w-5 text-green-500" />
                <CardTitle>Статуси на глоби</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="h-[300px]">
              {overallFineStatuses.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie {...commonPieChartProps("fineStatusPie", overallFineStatuses)}>
                      {overallFineStatuses.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={EXTENDED_COLORS[(index + 4) % EXTENDED_COLORS.length]}
                          stroke={EXTENDED_COLORS[(index + 4) % EXTENDED_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">Няма данни</div>
              )}
            </CardContent>
          </Card>

          {/* ТАБЛИЦИТЕ ОСТАВАТ СЪЩИТЕ */}
          <Card className="xl:col-span-1 shadow-lg">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <TrendingDown className="h-5 w-5 text-green-500" />
                <CardTitle>Топ 5 дилъри (най-малко репорти)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {topDealersLeastReports.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дилър</TableHead>
                      <TableHead className="text-right">Бр. репорти</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDealersLeastReports.map((d) => (
                      <TableRow key={d.dealer_id}>
                        <TableCell>
                          {d.dealer_name} {d.dealer_nickname && `(${d.dealer_nickname})`}
                        </TableCell>
                        <TableCell className="text-right">{d.report_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <NoDataMessage />
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2 shadow-lg">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-indigo-500" />
                <CardTitle>Смени и репорти (Пълна таблица)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              {dealerShiftsReports.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дилър</TableHead>
                      <TableHead className="text-right">Смени</TableHead>
                      <TableHead className="text-right">Репорти</TableHead>
                      <TableHead className="text-right">Репорти/смяна</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dealerShiftsReports
                      .sort((a, b) => b.report_count - a.report_count)
                      .map((d) => (
                        <TableRow key={d.dealer_id}>
                          <TableCell>
                            {d.dealer_name} {d.dealer_nickname && `(${d.dealer_nickname})`}
                          </TableCell>
                          <TableCell className="text-right">{d.shift_count}</TableCell>
                          <TableCell className="text-right">{d.report_count}</TableCell>
                          <TableCell className="text-right">{d.reports_per_shift.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <NoDataMessage />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 xl:col-span-3 shadow-lg">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <ListChecks className="h-5 w-5 text-purple-500" />
                <CardTitle>Типове инциденти по дилъри (Пълна таблица)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              {incidentTypesByDealer.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дилър</TableHead>
                      <TableHead>Тип инцидент</TableHead>
                      <TableHead className="text-right">Брой</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidentTypesByDealer.map((item, index) => (
                      <TableRow key={`${item.dealer_id}-${item.incident_type}-${index}`}>
                        <TableCell>
                          {item.dealer_name} {item.dealer_nickname && `(${item.dealer_nickname})`}
                        </TableCell>
                        <TableCell>{item.incident_type_label}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <NoDataMessage />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
