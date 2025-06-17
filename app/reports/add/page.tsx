"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { INCIDENT_TYPES, SEVERITY_LEVELS } from "@/lib/incident-types"
import type { Dealer, CasinoTable } from "@/lib/types"

export default function AddReportPage() {
  const router = useRouter()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [tables, setTables] = useState<CasinoTable[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    dealer_id: "",
    table_name: "",
    incident_type: "",
    description: "",
    severity: "medium" as const,
    reported_by: "",
  })

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch dealers
        const { data: dealersData, error: dealersError } = await supabase.from("dealers").select("*").order("name")

        if (dealersError) throw dealersError

        // Fetch tables
        const { data: tablesData, error: tablesError } = await supabase
          .from("casino_tables")
          .select("*")
          .eq("status", "active")
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

    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.dealer_id || !formData.incident_type || !formData.description || !formData.reported_by) {
      toast.error("Моля, попълнете всички задължителни полета")
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase.from("dealer_reports").insert([
        {
          dealer_id: formData.dealer_id,
          table_name: formData.table_name || null,
          incident_type: formData.incident_type,
          description: formData.description,
          severity: formData.severity,
          reported_by: formData.reported_by,
        },
      ])

      if (error) throw error

      toast.success("Репортът е добавен успешно")
      router.push("/reports")
      router.refresh()
    } catch (error: any) {
      console.error("Error creating report:", error)
      toast.error(`Грешка при създаване на репорта: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Детайли на репорта</CardTitle>
          <CardDescription>Попълнете информацията за инцидента</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dealer Selection */}
            <div className="space-y-2">
              <Label htmlFor="dealer">Дилър *</Label>
              <Select value={formData.dealer_id} onValueChange={(value) => handleInputChange("dealer_id", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Изберете дилър" />
                </SelectTrigger>
                <SelectContent>
                  {dealers.map((dealer) => (
                    <SelectItem key={dealer.id} value={dealer.id}>
                      {dealer.name} {dealer.nickname && `(${dealer.nickname})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table Selection */}
            <div className="space-y-2">
              <Label htmlFor="table">Маса (опционално)</Label>
              <Select value={formData.table_name} onValueChange={(value) => handleInputChange("table_name", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Изберете маса или оставете празно" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без конкретна маса</SelectItem>
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
              <Label htmlFor="incident_type">Тип инцидент *</Label>
              <Select
                value={formData.incident_type}
                onValueChange={(value) => handleInputChange("incident_type", value)}
              >
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
                  <SelectValue />
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
              <Label htmlFor="description">Описание *</Label>
              <Textarea
                id="description"
                placeholder="Опишете подробно какво се е случило..."
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={4}
              />
            </div>

            {/* Reported By */}
            <div className="space-y-2">
              <Label htmlFor="reported_by">Докладвано от *</Label>
              <Input
                id="reported_by"
                placeholder="Име на pit boss или мениджър"
                value={formData.reported_by}
                onChange={(e) => handleInputChange("reported_by", e.target.value)}
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/reports">Отказ</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Запазване..." : "Създай репорт"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
