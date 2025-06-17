"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, AlertTriangle, Edit, Check, X, MessageSquare } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { INCIDENT_TYPES, SEVERITY_LEVELS, REPORT_STATUS } from "@/lib/incident-types"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import type { DealerReport } from "@/lib/types"

export default function ReportDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [report, setReport] = useState<DealerReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState("")

  useEffect(() => {
    // Only fetch if the id looks like a UUID
    if (isValidUUID(params.id)) {
      fetchReport()
    } else {
      // Redirect to reports list if invalid UUID
      router.push("/reports")
    }
  }, [params.id, router])

  const isValidUUID = (str: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }

  const fetchReport = async () => {
    try {
      const { data, error } = await supabase
        .from("dealer_reports")
        .select(`
          *,
          dealer:dealers(name, nickname)
        `)
        .eq("id", params.id)
        .single()

      if (error) throw error

      setReport(data)
      setResolutionNotes(data.resolution_notes || "")
    } catch (error: any) {
      console.error("Error fetching report:", error)
      toast.error(`Грешка при зареждане на репорта: ${error.message}`)
      router.push("/reports")
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusUpdate = async (newStatus: string) => {
    if (!report) return

    setIsUpdating(true)
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === "resolved") {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolution_notes = resolutionNotes
      } else if (newStatus === "active") {
        updateData.resolved_at = null
        updateData.resolution_notes = null
      }

      const { error } = await supabase.from("dealer_reports").update(updateData).eq("id", params.id)

      if (error) throw error

      toast.success("Статусът е актуализиран успешно")
      fetchReport()
      setIsEditing(false)
    } catch (error: any) {
      console.error("Error updating report:", error)
      toast.error(`Грешка при актуализиране: ${error.message}`)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!report) return

    try {
      const { error } = await supabase.from("dealer_reports").delete().eq("id", params.id)

      if (error) throw error

      toast.success("Репортът е изтрит успешно")
      router.push("/reports")
      router.refresh()
    } catch (error: any) {
      toast.error(`Грешка при изтриване на репорта: ${error.message}`)
    }
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
        <p>Зареждане...</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Репортът не е намерен</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <AlertTriangle className="h-8 w-8 mr-3 text-orange-500" />
              Репорт #{report.id.slice(0, 8)}
            </h1>
            <p className="text-muted-foreground">
              Създаден на {new Date(report.reported_at).toLocaleDateString("bg-BG")} от {report.reported_by}
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)} disabled={report.status === "resolved"}>
            <Edit className="h-4 w-4 mr-2" />
            {isEditing ? "Отказ" : "Редактирай"}
          </Button>
          <DeleteConfirmationDialog itemName={`репорт за ${report.dealer?.name}`} onConfirm={handleDelete} />
        </div>
      </div>

      {/* Report Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Основна информация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Дилър</label>
              <p className="text-lg">
                {report.dealer?.name}
                {report.dealer?.nickname && (
                  <span className="text-muted-foreground ml-2">({report.dealer.nickname})</span>
                )}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Маса</label>
              <p className="text-lg">{report.table_name || "Не е посочена"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Тип инцидент</label>
              <p className="text-lg">{getIncidentTypeLabel(report.incident_type)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Тежест</label>
              <div className="mt-1">{getSeverityBadge(report.severity)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Статус</label>
              <div className="mt-1">{getStatusBadge(report.status)}</div>
            </div>
          </CardContent>
        </Card>

        {/* Status Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MessageSquare className="h-5 w-5 mr-2" />
              Управление на статуса
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Нов статус</label>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant={report.status === "active" ? "default" : "outline"}
                      onClick={() => handleStatusUpdate("active")}
                      disabled={isUpdating}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Активен
                    </Button>
                    <Button
                      size="sm"
                      variant={report.status === "resolved" ? "default" : "outline"}
                      onClick={() => handleStatusUpdate("resolved")}
                      disabled={isUpdating}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Решен
                    </Button>
                    <Button
                      size="sm"
                      variant={report.status === "dismissed" ? "default" : "outline"}
                      onClick={() => handleStatusUpdate("dismissed")}
                      disabled={isUpdating}
                    >
                      Отхвърлен
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Бележки за решението</label>
                  <Textarea
                    placeholder="Добавете бележки за това как е решен проблемът..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                {report.resolved_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Решен на</label>
                    <p>{new Date(report.resolved_at).toLocaleDateString("bg-BG")}</p>
                  </div>
                )}
                {report.resolution_notes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Бележки за решението</label>
                    <p className="text-sm bg-muted p-3 rounded-md mt-1">{report.resolution_notes}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Описание на инцидента</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-md">
            <p className="whitespace-pre-wrap">{report.description}</p>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Хронология</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>
                <p className="font-medium">Репорт създаден</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(report.reported_at).toLocaleString("bg-BG")} от {report.reported_by}
                </p>
              </div>
            </div>
            {report.resolved_at && (
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <p className="font-medium">Репорт решен</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(report.resolved_at).toLocaleString("bg-BG")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
