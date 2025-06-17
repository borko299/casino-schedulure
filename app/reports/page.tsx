"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, Plus, Search, Filter, Eye } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { INCIDENT_TYPES, SEVERITY_LEVELS, REPORT_STATUS } from "@/lib/incident-types"
import type { DealerReport } from "@/lib/types"

export default function ReportsPage() {
  const [reports, setReports] = useState<DealerReport[]>([])
  const [filteredReports, setFilteredReports] = useState<DealerReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")

  useEffect(() => {
    fetchReports()
  }, [])

  useEffect(() => {
    filterReports()
  }, [reports, searchTerm, statusFilter, severityFilter])

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from("dealer_reports")
        .select(`
          *,
          dealer:dealers(name, nickname)
        `)
        .order("reported_at", { ascending: false })

      if (error) throw error

      setReports(data || [])
    } catch (error: any) {
      console.error("Error fetching reports:", error)
      toast.error(`Грешка при зареждане на репортите: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const filterReports = () => {
    let filtered = reports

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (report) =>
          report.dealer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.dealer?.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.table_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.reported_by.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((report) => report.status === statusFilter)
    }

    // Severity filter
    if (severityFilter !== "all") {
      filtered = filtered.filter((report) => report.severity === severityFilter)
    }

    setFilteredReports(filtered)
  }

  const getSeverityBadge = (severity: string) => {
    const level = SEVERITY_LEVELS.find((s) => s.value === severity)
    return level ? <Badge className={level.color}>{level.label}</Badge> : <Badge>{severity}</Badge>
  }

  const getStatusBadge = (status: string) => {
    const statusInfo = REPORT_STATUS.find((s) => s.value === status)
    return statusInfo ? <Badge className={statusInfo.color}>{statusInfo.label}</Badge> : <Badge>{status}</Badge>
  }

  const getIncidentTypeLabel = (type: string) => {
    const incidentType = INCIDENT_TYPES.find((t) => t.value === type)
    return incidentType ? incidentType.label : type
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Зареждане на репорти...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <AlertTriangle className="h-8 w-8 mr-3 text-orange-500" />
            Репорти за дилъри
          </h1>
          <p className="text-muted-foreground mt-1">Управление на инциденти и грешки</p>
        </div>
        <Button asChild>
          <Link href="/reports/create">
            <Plus className="h-4 w-4 mr-2" />
            Нов репорт
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Филтри
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Търсене..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всички статуси</SelectItem>
                {REPORT_STATUS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Тежест" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всички нива</SelectItem>
                {SEVERITY_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground flex items-center">
              Общо: {filteredReports.length} от {reports.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <div className="grid gap-4">
        {filteredReports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Няма намерени репорти</h3>
              <p className="text-gray-500 text-center mb-4">
                {reports.length === 0
                  ? "Все още няма създадени репорти."
                  : "Няма репорти, отговарящи на избраните филтри."}
              </p>
              <Button asChild>
                <Link href="/reports/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Създай първия репорт
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredReports.map((report) => (
            <Card key={report.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold">
                        {report.dealer?.name}
                        {report.dealer?.nickname && (
                          <span className="text-muted-foreground ml-2">({report.dealer.nickname})</span>
                        )}
                      </h3>
                      {getSeverityBadge(report.severity)}
                      {getStatusBadge(report.status)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground mb-3">
                      <div>
                        <span className="font-medium">Маса:</span> {report.table_name || "Не е посочена"}
                      </div>
                      <div>
                        <span className="font-medium">Тип:</span> {getIncidentTypeLabel(report.incident_type)}
                      </div>
                      <div>
                        <span className="font-medium">Дата:</span>{" "}
                        {new Date(report.reported_at).toLocaleDateString("bg-BG")}
                      </div>
                    </div>
                    <p className="text-gray-700 mb-3 line-clamp-2">{report.description}</p>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Докладвано от:</span> {report.reported_by}
                    </div>
                  </div>
                  <div className="ml-4">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/reports/${report.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        Детайли
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
