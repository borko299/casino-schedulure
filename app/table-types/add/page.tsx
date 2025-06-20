"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase-singleton"
import { TableTypeConfirmation } from "@/components/table-type-confirmation"
import { Palette } from "lucide-react"

export default function AddTableTypePage() {
  const router = useRouter()
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [color, setColor] = useState("#E5E7EB") // Default background color
  const [textColor, setTextColor] = useState("#1F2937") // Default text color
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [newTableType, setNewTableType] = useState<{
    label: string
    value: string
    color: string
    textColor: string
  } | null>(null)

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel)
    const generatedValue = newLabel
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
    setValue(generatedValue)
  }

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
        .single()

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError
      }

      if (existingType) {
        toast.error("Тип маса с такава системна стойност вече съществува.")
        setIsSubmitting(false)
        return
      }

      const { error } = await supabase.from("table_types").insert([{ label, value, color, text_color: textColor }])

      if (error) throw error

      setNewTableType({ label, value, color, textColor })
      setShowConfirmation(true)

      setLabel("")
      setValue("")
      setColor("#E5E7EB")
      setTextColor("#1F2937")

      toast.success("Типът маса е добавен успешно.")
      router.refresh() // Refresh to show new type in lists if any
    } catch (error: any) {
      toast.error(`Грешка при добавяне на тип маса: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCloseConfirmation = () => {
    setShowConfirmation(false)
    setNewTableType(null)
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
        <Card className="transform transition-all duration-300 hover:shadow-lg">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
            <CardTitle className="text-purple-800 flex items-center">
              <Palette className="mr-2 h-6 w-6" /> Добавяне на нов тип маса
            </CardTitle>
            <CardDescription className="text-purple-600">
              Създайте нов тип маса за казиното с персонализирани цветове.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="label" className="text-sm font-medium">
                  Име за показване
                </Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Въведете име (напр. Poker Texas Hold'em)"
                  required
                  className="transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="value" className="text-sm font-medium">
                  Системна стойност
                </Label>
                <Input
                  id="value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Системен идентификатор (напр. poker_texas_holdem)"
                  required
                  className="font-mono transition-all duration-200 focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-muted-foreground">
                  Това е вътрешният идентификатор. Трябва да е уникален и да съдържа само малки букви, цифри и долни
                  черти.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="color" className="text-sm font-medium">
                    Цвят на фона
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-16 h-10 p-1 transition-all duration-200 focus:ring-2 focus:ring-purple-500"
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
                  <Label htmlFor="textColor" className="text-sm font-medium">
                    Цвят на текста
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="textColor"
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-16 h-10 p-1 transition-all duration-200 focus:ring-2 focus:ring-purple-500"
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

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                  className="transition-all duration-200 hover:scale-105"
                >
                  Отказ
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="transition-all duration-200 hover:scale-105 bg-purple-600 hover:bg-purple-700"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Добавяне...
                    </>
                  ) : (
                    "Добави тип маса"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {showConfirmation && newTableType && (
        <TableTypeConfirmation newTableType={newTableType} onClose={handleCloseConfirmation} />
      )}
    </>
  )
}
