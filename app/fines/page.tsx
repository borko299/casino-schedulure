"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DollarSign, Search, Filter, Eye, Check, X, Clock, CreditCard, TrendingUp } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { FINE_STATUS, getFineStatusInfo } from "@/lib/fine-status"
import type { DealerReport, FineStatus } from "@/lib/types"

export default function FinesPage() {
  const [fines, setFines] = useState<DealerReport[]>([])
  const [filteredFines, setFilteredFines] = useState<DealerReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [stats, setStats] = useState({
    total: 0,
    totalAmount: 0,
    pending: 0,
    pendingAmount: 0,
    approved: 0,
    approvedAmount: 0,
  })

  useEffect(() => {
    fetchFines()
  }, [])

  useEffect(() => {
    filterFines()
    calculateStats()
  }, [fines, searchTerm, statusFilter])

  const fetchFines = async () => {
    try {
      const { data, error } = await supabase
        .from("dealer_reports")
        .select(`
          *,
          dealer:dealers(name, nickname)
        `)
        .not("fine_amount", "is", null)
        .order("reported_at", { ascending: false })

      if (error) throw error

      setFines(data || [])
    } catch (error: any) {
      console.error("Error fetching fines:", error)
      toast.error(`Грешка при зареждане на глобите: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const filterFines = () => {
    let filtered = fines

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (fine) =>
          fine.dealer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fine.dealer?.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fine.table_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fine.fine_reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          fine.reported_by.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((fine) => (fine.fine_status || "pending") === statusFilter)
    }

    setFilteredFines(filtered)
  }

  const calculateStats = () => {
    const total = fines.length
    const totalAmount = fines.reduce((sum, fine) => sum + (fine.fine_amount || 0), 0)

    const pending = fines.filter((f) => (f.fine_status || "pending") === "pending").length
    const pendingAmount = fines
      .filter((f) => (f.fine_status || "pending") === "pending")
      .reduce((sum, fine) => sum + (fine.fine_amount || 0), 0)

    const approved = fines.filter((f) => f.fine_status === "approved").length
    const approvedAmount = fines
      .filter((f) => f.fine_status === "approved")
      .reduce((sum, fine) => sum + (fine.fine_amount || 0), 0)

    setStats({
      total,
      totalAmount,
      pending,
      pendingAmount,
      approved,
      approvedAmount,
    })
  }

  const handleStatusUpdate = async (fineId: string, newStatus: FineStatus, currentFine: DealerReport) => {
    try {
      const updateData: any = {
        fine_status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === "approved") {
        updateData.fine_applied = true
        updateData.fine_applied_at = new Date().toISOString()
        updateData.fine_applied_by = "System" // Тук може да се добави текущия потребител
      } else if (newStatus === "rejected") {
        updateData.fine_applied = false
        updateData.fine_applied_at = null
        updateData.fine_applied_by = null
      }

      const { error } = await supabase.from("dealer_reports").update(updateData).eq("id", fineId)

      if (error) throw error

      toast.success(`Глобата е ${newStatus === "approved" ? "одобрена" : "отхвърлена"} успешно`)
      fetchFines()
    } catch (error: any) {
      console.error("Error updating fine status:", error)
      toast.error(`Грешка при актуализиране: ${error.message}`)
    }
  }

  const getFineStatusBadge = (status: string) => {
    const statusInfo = getFineStatusInfo(status || "pending")
    return <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Зареждане на глоби...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <DollarSign className="h-8 w-8 mr-3 text-green-600" />
            Управление на глоби
          </h1>
          <p className="text-muted-foreground mt-1">Одобряване и проследяване на глоби за дилъри</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Общо глоби</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Обща сума: {stats.totalAmount.toFixed(2)} лв.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Чакат одобрение</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Сума: {stats.pendingAmount.toFixed(2)} лв.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Одобрени</p>
                <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              </div>
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Сума: {stats.approvedAmount.toFixed(2)} лв.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Средна глоба</p>
                <p className="text-2xl font-bold">
                  {stats.total > 0 ? (stats.totalAmount / stats.total).toFixed(2) : "0.00"}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">лв. на глоба</p>
          </CardContent>
        </Card>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Търсене по дилър, маса, причина..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус на глобата" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всички статуси</SelectItem>
                {FINE_STATUS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground flex items-center">
              Показани: {filteredFines.length} от {fines.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fines List */}
      <div className="grid gap-4">
        {filteredFines.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Няма намерени глоби</h3>
              <p className="text-gray-500 text-center">
                {fines.length === 0 ? "Все още няма наложени глоби." : "Няма глоби, отговарящи на избраните филтри."}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredFines.map((fine) => (
            <Card key={fine.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold">
                        {fine.dealer?.name}
                        {fine.dealer?.nickname && (
                          <span className="text-muted-foreground ml-2">({fine.dealer.nickname})</span>
                        )}
                      </h3>
                      {getFineStatusBadge(fine.fine_status || "pending")}
                      <Badge variant="outline" className="text-green-700 bg-green-50">
                        {fine.fine_amount?.toFixed(2)} лв.
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground mb-3">
                      <div>
                        <span className="font-medium">Маса:</span> {fine.table_name || "Не е посочена"}
                      </div>
                      <div>
                        <span className="font-medium">Дата:</span>{" "}
                        {new Date(fine.reported_at).toLocaleDateString("bg-BG")}
                      </div>
                      <div>
                        <span className="font-medium">Докладвано от:</span> {fine.reported_by}
                      </div>
                    </div>

                    {fine.fine_reason && (
                      <div className="mb-3">
                        <span className="text-sm font-medium text-muted-foreground">Причина за глобата:</span>
                        <p className="text-sm bg-muted p-2 rounded-md mt-1">{fine.fine_reason}</p>
                      </div>
                    )}

                    <p className="text-gray-700 mb-3 line-clamp-2">{fine.description}</p>
                  </div>

                  <div className="ml-4 flex flex-col space-y-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/reports/${fine.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        Детайли
                      </Link>
                    </Button>

                    {(fine.fine_status || "pending") === "pending" && (
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleStatusUpdate(fine.id, "approved", fine)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Одобри
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleStatusUpdate(fine.id, "rejected", fine)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Отхвърли
                        </Button>
                      </div>
                    )}

                    {fine.fine_status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusUpdate(fine.id, "paid", fine)}
                        className="text-blue-600 border-blue-600 hover:bg-blue-50"
                      >
                        <CreditCard className="h-4 w-4 mr-1" />
                        Маркирай като платена
                      </Button>
                    )}
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
