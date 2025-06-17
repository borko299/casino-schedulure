"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, AlertTriangle, Save, DollarSign, Database } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { INCIDENT_TYPES, SEVERITY_LEVELS } from "@/lib/incident-types"
import type { Dealer } from "@/lib/types"

interface Table {
  id: string
  name: string
  type: string
}

export default function CreateReportPage() {
  const router = useRouter()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fineColumnsExist, setFineColumnsExist] = useState(false)

  const [formData, setFormData] = useState({
    dealerId: "",
    tableName: "",
    incidentType: "",
    severity: "",
    description: "",
    reportedBy: "",
    hasFine: false,
    fineAmount: "",
    fineReason: "",
  })

  useEffect(() => {
    fetchData()
    checkFineColumns()
  }, [])

  const checkFineColumns = async () => {
    try {
      // Проверяваме дали колоните за глоби съществуват
      const { data, error } = await supabase.from("dealer_reports").select("fine_amount").limit(1)

      if (error && error.message.includes("does not exist")) {
        setFineColumnsExist(false)
      } else {
        setFineColumnsExist(true)
      }
    } catch (error) {
      console.error("Error checking fine columns:", error)
      setFineColumnsExist(false)
    }
  }

  const fetchData = async () => {
    try {
      // Fetch dealers
      const { data: dealersData, error: dealersError } = await supabase
        .from("dealers")
        .select("id, name, nickname")
        .order("name")

      if (dealersError) throw dealersError

      // Fetch tables
      const { data: tablesData, error: tablesError } = await supabase
        .from("casino_tables")
        .select("id, name, type")
        .order("name")

      if (tablesError) throw tablesError

      setDealers(dealersData || [])
      setTables(tablesData || [])
    } catch (error: any) {
      console.error("Error fetching data:", error)
      toast.error(`Грешка при зареждане на данните: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !formData.dealerId ||
      !formData.incidentType ||
      !formData.severity ||
      !formData.description ||
      !formData.reportedBy
    ) {
      toast.error("Моля, попълнете всички задължителни полета")
      return
    }

    if (formData.hasFine && fineColumnsExist && (!formData.fineAmount || !formData.fineReason)) {
      toast.error("Моля, попълнете сумата и причината за глобата")
      return
    }

    if (
      formData.hasFine &&
      fineColumnsExist &&
      (isNaN(Number(formData.fineAmount)) || Number(formData.fineAmount) <= 0)
    ) {
      toast.error("Моля, въведете валидна сума за глобата")
      return
    }

    setIsSubmitting(true)

    try {
      const reportData: any = {
        dealer_id: formData.dealerId,
        table_name: formData.tableName || null,
        incident_type: formData.incidentType,
        severity: formData.severity,
        description: formData.description,
        reported_by: formData.reportedBy,
        status: "active",
        reported_at: new Date().toISOString(),
      }

      // Добавяме полетата за глоби само ако колоните съществуват
      if (formData.hasFine && fineColumnsExist) {
        reportData.fine_amount = Number(formData.fineAmount)
        reportData.fine_reason = formData.fineReason
        reportData.fine_applied = false
      }

      const { error } = await supabase.from("dealer_reports").insert(reportData)

      if (error) throw error

      toast.success("Репортът е създаден успешно")
      router.push("/reports")
      router.refresh()
    } catch (error: any) {
      console.error("Error creating report:", error)
      toast.error(`Грешка при създаване на репорта: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Зареждане...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
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
            Нов репорт за дилър
          </h1>
          <p className="text-muted-foreground">Документирайте инцидент или грешка</p>
        </div>
      </div>

      {/* Fine Columns Warning */}
      {!fineColumnsExist && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Database className="h-5 w-5 text-orange-500 mr-2" />
              <div>
                <p className="text-sm font-medium text-orange-800">Функционалността за глоби не е активирана</p>
                <p className="text-sm text-orange-700">
                  Изпълнете SQL скрипта <code>scripts/add-fine-columns-to-dealer-reports.sql</code> за да активирате
                  глобите
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Информация за инцидента</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dealer Selection */}
            <div className="space-y-2">
              <Label htmlFor="dealer">Дилър *</Label>
              <Select value={formData.dealerId} onValueChange={(value) => handleInputChange("dealerId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Изберете дилър" />
                </SelectTrigger>
                <SelectContent>
                  {dealers.map((dealer) => (
                    <SelectItem key={dealer.id} value={dealer.id}>
                      {dealer.name}
                      {dealer.nickname && <span className="text-muted-foreground ml-2">({dealer.nickname})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table Selection */}
            <div className="space-y-2">
              <Label htmlFor="table">Маса (опционално)</Label>
              <Select value={formData.tableName} onValueChange={(value) => handleInputChange("tableName", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Изберете маса или оставете празно" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_table">Без маса</SelectItem>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.name}>
                      {table.name} ({table.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Incident Type */}
            <div className="space-y-2">
              <Label htmlFor="incidentType">Тип инцидент *</Label>
              <Select value={formData.incidentType} onValueChange={(value) => handleInputChange("incidentType", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Изберете тип инцидент" />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-2">
              <Label htmlFor="severity">Тежест *</Label>
              <Select value={formData.severity} onValueChange={(value) => handleInputChange("severity", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Изберете ниво на тежест" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Описание на инцидента *</Label>
              <Textarea
                id="description"
                placeholder="Опишете подробно какво се е случило..."
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={4}
                required
              />
            </div>

            {/* Fine Section - показваме само ако колоните съществуват */}
            {fineColumnsExist && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasFine"
                    checked={formData.hasFine}
                    onCheckedChange={(checked) => handleInputChange("hasFine", checked as boolean)}
                  />
                  <Label htmlFor="hasFine" className="flex items-center">
                    <DollarSign className="h-4 w-4 mr-1" />
                    Наложи глоба
                  </Label>
                </div>

                {formData.hasFine && (
                  <div className="space-y-4 ml-6 p-4 bg-orange-50 border border-orange-200 rounded-md">
                    <div className="space-y-2">
                      <Label htmlFor="fineAmount">Сума на глобата (лв.) *</Label>
                      <Input
                        id="fineAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.fineAmount}
                        onChange={(e) => handleInputChange("fineAmount", e.target.value)}
                        required={formData.hasFine}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fineReason">Причина за глобата *</Label>
                      <Textarea
                        id="fineReason"
                        placeholder="Опишете причината за налагане на глобата..."
                        value={formData.fineReason}
                        onChange={(e) => handleInputChange("fineReason", e.target.value)}
                        rows={2}
                        required={formData.hasFine}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reported By */}
            <div className="space-y-2">
              <Label htmlFor="reportedBy">Докладвано от *</Label>
              <Input
                id="reportedBy"
                placeholder="Име на pit boss или мениджър"
                value={formData.reportedBy}
                onChange={(e) => handleInputChange("reportedBy", e.target.value)}
                required
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" asChild>
                <Link href="/reports">Отказ</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? "Създаване..." : "Създай репорт"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
