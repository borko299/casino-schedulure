"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import type { TableTypeEntity } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"
import { Palette } from "lucide-react"

export default function EditTableTypePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [tableType, setTableType] = useState<TableTypeEntity | null>(null)
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [color, setColor] = useState("#E5E7EB")
  const [textColor, setTextColor] = useState("#1F2937")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchTableType = async () => {
      try {
        const { data, error } = await supabase.from("table_types").select("*").eq("id", params.id).single()

        if (error) throw error

        setTableType(data)
        setLabel(data.label)
        setValue(data.value)
        setColor(data.color || "#E5E7EB")
        setTextColor(data.text_color || "#1F2937")
      } catch (error: any) {
        toast.error(`Грешка при извличане на тип маса: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTableType()
  }, [params.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!label || !value) {
      toast.error("Моля, попълнете всички задължителни полета.")
      return
    }

    setIsSubmitting(true)

    try {
      const { data: existingType, error: checkError } = await supabase
        .from("table_types")
        .select("id")
        .eq("value", value)
        .neq("id", params.id)
        .single()

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError
      }

      if (existingType) {
        toast.error("Тип маса с такава системна стойност вече съществува.")
        setIsSubmitting(false)
        return
      }

      const { error } = await supabase
        .from("table_types")
        .update({ label, value, color, text_color: textColor })
        .eq("id", params.id)

      if (error) throw error

      toast.success("Типът маса е актуализиран успешно.")
      router.push("/table-types")
      router.refresh()
    } catch (error: any) {
      toast.error(`Грешка при актуализиране на тип маса: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Зареждане...</p>
      </div>
    )
  }

  if (!tableType) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Типът маса не е намерен.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Palette className="mr-2 h-6 w-6" /> Редактиране на тип маса
          </CardTitle>
          <CardDescription>Актуализирайте информацията и цветовете за типа маса.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="label">Име за показване</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Въведете име (напр. Poker Texas Hold'em)"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">Системна стойност</Label>
              <Input
                id="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Системен идентификатор (напр. poker_texas_holdem)"
                required
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Внимание: Промяната на системната стойност може да засегне съществуващи маси и права на дилъри.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">Цвят на фона</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-16 h-10 p-1"
                  />
                  <Input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#E5E7EB"
                    className="font-mono flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="textColor">Цвят на текста</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="textColor"
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-16 h-10 p-1"
                  />
                  <Input
                    type="text"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    placeholder="#1F2937"
                    className="font-mono flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="p-3 rounded-md text-center" style={{ backgroundColor: color, color: textColor }}>
              Примерен изглед
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Отказ
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Запазване..." : "Запази промените"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
