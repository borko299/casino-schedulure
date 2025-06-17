"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Phone, Edit } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { DealerStatsCard } from "@/components/dealer-stats-card"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import type { Dealer, TableType } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"

export default function DealerDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [dealer, setDealer] = useState<Dealer | null>(null)
  const [dealerTableTypes, setDealerTableTypes] = useState<string[]>([])
  const [tableTypes, setTableTypes] = useState<TableType[]>([])
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

        setDealer(dealerData)
        setDealerTableTypes(permissionsData ? permissionsData.map((p) => p.table_type) : [])
        setTableTypes(
          tableTypesData?.map((tt) => ({
            value: tt.value,
            label: tt.label,
          })) || [],
        )
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
      <DealerStatsCard dealer={dealer} />
    </div>
  )
}
