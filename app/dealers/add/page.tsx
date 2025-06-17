"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import type { TableType } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function AddDealerPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [nickname, setNickname] = useState("")
  const [phone, setPhone] = useState("")
  const [selectedTableTypes, setSelectedTableTypes] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Предефинирани типове маси
  const tableTypes: TableType[] = [
    { value: "turkish_roulette_turkish", label: "Turkish Roulette (Turkish)" },
    { value: "turkish_roulette_english", label: "Turkish Roulette (English)" },
    { value: "blackjack_american", label: "Blackjack (American)" },
    { value: "blackjack_turkish", label: "Blackjack (Turkish)" },
    { value: "blackjack_turkish_tables", label: "Blackjack with Turkish Tables" },
  ]

  const handleTableTypeChange = (tableType: string, checked: boolean) => {
    if (checked) {
      setSelectedTableTypes([...selectedTableTypes, tableType])
    } else {
      setSelectedTableTypes(selectedTableTypes.filter((type) => type !== tableType))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name) {
      toast.error("Моля въведете име на дилъра")
      return
    }

    setIsSubmitting(true)

    try {
      // Създаваме дилъра
      const { data: dealer, error: dealerError } = await supabase
        .from("dealers")
        .insert({
          name,
          nickname: nickname || null,
          phone: phone || null,
          available_tables: [],
        })
        .select()
        .single()

      if (dealerError) throw dealerError

      // Добавяме разрешенията за типове маси
      if (selectedTableTypes.length > 0) {
        const tableTypePermissions = selectedTableTypes.map((tableType) => ({
          dealer_id: dealer.id,
          table_type: tableType,
        }))

        const { error: permissionsError } = await supabase.from("dealer_table_types").insert(tableTypePermissions)

        if (permissionsError) throw permissionsError
      }

      toast.success("Дилърът е добавен успешно")
      router.push("/dealers")
      router.refresh()
    } catch (error: any) {
      toast.error(`Грешка при добавяне на дилъра: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Добави нов дилър</CardTitle>
          <CardDescription>Въведете информацията за новия дилър</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Име на дилъра</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Въведете име на дилъра"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">Прякор</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Въведете прякор (незадължително)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Телефонен номер</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Въведете телефонен номер (незадължително)"
              />
            </div>

            <div className="space-y-3">
              <Label>Типове маси</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tableTypes.map((tableType) => (
                  <div key={tableType.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={tableType.value}
                      checked={selectedTableTypes.includes(tableType.value)}
                      onCheckedChange={(checked) => handleTableTypeChange(tableType.value, checked === true)}
                    />
                    <Label htmlFor={tableType.value} className="cursor-pointer">
                      {tableType.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Отказ
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Добавяне..." : "Добави дилър"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
