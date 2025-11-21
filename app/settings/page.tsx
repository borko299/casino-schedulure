"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { getSystemSettings, updateSystemSettings } from "@/lib/data-service"
import type { SystemSettings } from "@/lib/types"
import { Loader2, Save } from "lucide-react"

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getSystemSettings()
        setSettings(data)
      } catch (error) {
        console.error("Error fetching settings:", error)
        toast.error("Грешка при зареждане на настройките")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return

    setIsSaving(true)
    try {
      await updateSystemSettings({
        dealer_view_offset_minutes: settings.dealer_view_offset_minutes,
        dealer_view_lookahead_slots: settings.dealer_view_lookahead_slots,
      })
      toast.success("Настройките са запазени успешно")
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Грешка при запазване на настройките")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Настройки на системата</h1>

      <Card>
        <CardHeader>
          <CardTitle>Дилърски изглед</CardTitle>
          <CardDescription>Конфигурация на автоматичния изглед за дилъри</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="offset">Изпреварване на времето (минути)</Label>
              <Input
                id="offset"
                type="number"
                min="0"
                value={settings?.dealer_view_offset_minutes || 0}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, dealer_view_offset_minutes: Number.parseInt(e.target.value) || 0 } : null,
                  )
                }
              />
              <p className="text-sm text-muted-foreground">
                Колко минути преди реалното време да се показва следващия слот. Например, ако е 15 мин, в 7:15 ще се
                покаже графика за 7:30.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lookahead">Брой бъдещи слотове</Label>
              <Input
                id="lookahead"
                type="number"
                min="1"
                max="10"
                value={settings?.dealer_view_lookahead_slots || 1}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, dealer_view_lookahead_slots: Number.parseInt(e.target.value) || 1 } : null,
                  )
                }
              />
              <p className="text-sm text-muted-foreground">Колко слота напред да се показват в таблицата за дилъри.</p>
            </div>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Запазване...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Запази настройките
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
