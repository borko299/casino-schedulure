"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Settings } from "lucide-react"
import { supabase } from "@/lib/supabase-singleton"
import { toast } from "sonner"
import type { DisplaySettings } from "@/lib/types"

export function ScheduleDisplaySettings() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<DisplaySettings | null>(null)

  useEffect(() => {
    if (open) {
      fetchSettings()
    }
  }, [open])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from("display_settings").select("*").single()
      if (error && error.code !== "PGRST116") throw error

      if (data) {
        setSettings(data)
      } else {
        setSettings({
          id: "",
          advance_minutes: 15,
          slots_to_show: 3,
          created_at: "",
          updated_at: "",
        })
      }
    } catch (error: any) {
      toast.error("Неуспешно зареждане на настройките")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings) return

    setLoading(true)
    try {
      const payload = {
        advance_minutes: settings.advance_minutes,
        slots_to_show: settings.slots_to_show,
        updated_at: new Date().toISOString(),
      }

      let error
      if (settings.id) {
        const { error: updateError } = await supabase.from("display_settings").update(payload).eq("id", settings.id)
        error = updateError
      } else {
        const { error: insertError } = await supabase.from("display_settings").insert([payload])
        error = insertError
      }

      if (error) throw error

      toast.success("Настройките са запазени")
      setOpen(false)
    } catch (error: any) {
      toast.error("Неуспешно запазване")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Настройки на дисплея">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Настройки на Екрана</DialogTitle>
          <DialogDescription>Конфигурирайте как изглежда графика на екрана за дилъри.</DialogDescription>
        </DialogHeader>
        {settings ? (
          <form onSubmit={handleSave} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="advance" className="text-right">
                Аванс (мин)
              </Label>
              <Input
                id="advance"
                type="number"
                value={settings.advance_minutes}
                onChange={(e) => setSettings({ ...settings, advance_minutes: Number.parseInt(e.target.value) || 0 })}
                className="col-span-3"
                min="0"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slots" className="text-right">
                Брой слотове
              </Label>
              <Input
                id="slots"
                type="number"
                value={settings.slots_to_show}
                onChange={(e) => setSettings({ ...settings, slots_to_show: Number.parseInt(e.target.value) || 1 })}
                className="col-span-3"
                min="1"
                max="10"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? "Запазване..." : "Запази"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-8 text-center">Зареждане...</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
