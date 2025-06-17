"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Phone, Edit, AlertTriangle, Eye } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { DealerStatsCard } from "@/components/dealer-stats-card"
import { DealerFineStatsCard } from "@/components/dealer-fine-stats-card"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { INCIDENT_TYPES, SEVERITY_LEVELS, REPORT_STATUS } from "@/lib/incident-types"
import type { Dealer, TableType, DealerReport } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function DealerDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [dealerTableTypes, setDealerTableTypes] = useState<string[]>([])
  const [tableTypes, setTableTypes] = useState<TableType[]>([])
  const [reports, setReports] = useState<DealerReport[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch dealer
        const { data: dealerData, error: dealerError } = await supabase
          .from("dealers")
          .select("*")
          .eq("id", params.id)
          .single()

        if (dealerError) throw dealerError

        // Fetch dealer's table type permissions
        const { data: permissionsData, error: permissionsError } = await supabase
          .from("dealer_table_types")
          .select("table_type")
          .eq("dealer_id", params.id)

        if (permissionsError) throw permissionsError

        // Fetch table types
        const { data: tableTypesData, error: tableTypesError } = await supabase
          .from("table_types")
          .select("*")
          .order("label")

        if (tableTypesError) throw tableTypesError

        // Fetch dealer reports
        const { data: reportsData, error: reportsError } = await supabase
          .from("dealer_reports")
          .select("*")
          .eq("dealer_id", params.id)
          .order("reported_at", { ascending: false })
          .limit(10)

        if (reportsError) throw reportsError

        setDealer(dealerData)
        setDealerTableTypes(permissionsData ? permissionsData.map((p) => p.table_type) : [])
        setTableTypes(
          tableTypesData?.map((tt) => ({
            value: tt.value,
            label: tt.label,
          })) || [],
        )
        setReports(reportsData || [])
      } catch (error: any) {
        console.error("Error fetching dealer:", error)
        toast.error(`Грешка при зареждане на дилъра: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleDelete = async () => {
    if (!dealer) return

    try {
      // Delete dealer's permissions first
      const { error: permissionsError } = await supabase.from("dealer_table_types").delete().eq("dealer_id", params.id)

      if (permissionsError) throw permissionsError

      // Then delete the dealer
      const { error: dealerError } = await supabase.from("dealers").delete().eq("id", params.id)

      if (dealerError) throw dealerError

      toast.success("Дилърът е изтрит успешно")
      router.push("/dealers")
      router.refresh()
    } catch (error: any) {
      toast.error(`Грешка при изтриване на дилъра: ${error.message}`)
    }
  }

  const handleCall = () => {
    if (dealer?.phone) {
      window.open(`tel:${dealer.phone}`, "_self")
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

  if (!dealer) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Дилърът не е намерен</p>
      </div>
    )
  }

  const allowedTableTypes = tableTypes.filter((type) => dealerTableTypes.includes(type.value))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dealers">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {dealer.name}
              {dealer.nickname && <span className="text-muted-foreground ml-2">({dealer.nickname})</span>}
            </h1>
            <p className="text-muted-foreground">Детайли за дилъра</p>
          </div>
        </div>
        <div className="flex space-x-2">
          {dealer.phone && (
            <Button variant="outline" onClick={handleCall}>
              <Phone className="h-4 w-4 mr-2" />
              Обади се
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href={`/dealers/${dealer.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Редактирай
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/reports/create?dealer=${dealer.id}`}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Нов репорт
            </Link>
          </Button>
          <DeleteConfirmationDialog itemName={dealer.name} onConfirm={handleDelete} />
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Основна информация</CardTitle>
          <CardDescription>Лични данни на дилъра</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Име</label>
              <p className="text-lg">{dealer.name}</p>
            </div>
            {dealer.nickname && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Прякор</label>
                <p className="text-lg">{dealer.nickname}</p>
              </div>
            )}
            {dealer.phone && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Телефон</label>
                <div className="flex items-center space-x-2">
                  <p className="text-lg">{dealer.phone}</p>
                  <Button size="sm" variant="outline" onClick={handleCall}>
                    <Phone className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Създаден на</label>
              <p className="text-lg">{new Date(dealer.created_at).toLocaleDateString("bg-BG")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table Permissions */}
      <Card>
        <CardHeader>
          <CardTitle>Разрешения за маси</CardTitle>
          <CardDescription>Типове маси, които дилърът може да кара</CardDescription>
        </CardHeader>
        <CardContent>
          {allowedTableTypes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allowedTableTypes.map((type) => (
                <Badge key={type.value} variant="default">
                  {type.label}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Няма разрешения за маси</p>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DealerStatsCard dealer={dealer} />
        <DealerFineStatsCard dealer={dealer} />
      </div>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-orange-500" />
                Последни репорти
              </CardTitle>
              <CardDescription>Последните 10 репорта за този дилър</CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link href={`/reports?dealer=${dealer.id}`}>Виж всички</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Няма репорти за този дилър</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Тежест</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Глоба</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{new Date(report.reported_at).toLocaleDateString("bg-BG")}</TableCell>
                      <TableCell>{getIncidentTypeLabel(report.incident_type)}</TableCell>
                      <TableCell>{getSeverityBadge(report.severity)}</TableCell>
                      <TableCell>{getStatusBadge(report.status)}</TableCell>
                      <TableCell>
                        {report.fine_amount && report.fine_amount > 0 ? (
                          <div className="flex items-center space-x-1">
                            <span className="font-medium">{report.fine_amount.toFixed(2)} лв.</span>
                            {report.fine_applied ? (
                              <Badge variant="default" className="bg-green-500 text-xs">
                                Приложена
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                Чака
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/reports/${report.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
