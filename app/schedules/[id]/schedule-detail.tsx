"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { generateTimeSlots } from "@/lib/utils"
import { toast } from "sonner"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import type { Dealer, Schedule } from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"
import { ScheduleDisplaySettings } from "@/components/schedule-display-settings"
import { Eye, EyeOff, ExternalLink } from "lucide-react"
import Link from "next/link"

interface ScheduleDetailProps {
  schedule: Schedule
  dealers: Dealer[]
  formattedDate: string
}

export function ScheduleDetail({ schedule, dealers, formattedDate }: ScheduleDetailProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isPublished, setIsPublished] = useState(schedule.published || false)

  const timeSlots = generateTimeSlots(schedule.shift_type as "day" | "night")

  const dealerMap = dealers.reduce(
    (acc, dealer) => {
      acc[dealer.id] = dealer
      return acc
    },
    {} as Record<string, Dealer>,
  )

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("schedules").delete().eq("id", schedule.id)

      if (error) throw error

      toast.success("Графикът е изтрит успешно")
      router.push("/schedules")
      router.refresh()
    } catch (error: any) {
      toast.error(`Грешка при изтриване: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePublish = async () => {
    setIsPublishing(true)
    try {
      const newStatus = !isPublished
      const { error } = await supabase.from("schedules").update({ published: newStatus }).eq("id", schedule.id)

      if (error) throw error

      setIsPublished(newStatus)
      toast.success(newStatus ? "Графикът е публикуван" : "Графикът е скрит")
      router.refresh()
    } catch (error: any) {
      toast.error(`Грешка при обновяване: ${error.message}`)
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Детайли за Графика</h1>
          <p className="text-muted-foreground">
            {formattedDate} -{" "}
            {schedule.shift_type === "day" ? "Дневна Смяна (08:00-20:00)" : "Нощна Смяна (20:00-08:00)"}
          </p>
        </div>
        <div className="flex space-x-2 items-center">
          <Button variant="outline" size="icon" asChild title="Отвори Live View">
            <Link href="/live-schedule" target="_blank">
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>

          <ScheduleDisplaySettings />

          <Button
            variant={isPublished ? "default" : "secondary"}
            onClick={handlePublish}
            disabled={isPublishing}
            className="min-w-[120px]"
          >
            {isPublished ? (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Публикуван
              </>
            ) : (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Скрит
              </>
            )}
          </Button>

          <DeleteConfirmationDialog itemName={`график за ${formattedDate}`} onConfirm={handleDelete} />
          <Button variant="outline" onClick={() => router.back()}>
            Назад
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>График</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left">Час</th>
                  {dealers.map((dealer) => (
                    <th key={dealer.id} className="border p-2 text-left">
                      {dealer.nickname || dealer.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot) => (
                  <tr key={slot.time} className="hover:bg-muted/50">
                    <td className="border p-2 font-medium">{slot.formattedTime}</td>
                    {dealers.map((dealer) => {
                      const assignment = schedule.schedule_data[slot.time]?.[dealer.id] || "-"
                      const isBreak = assignment === "BREAK"
                      return (
                        <td
                          key={`${slot.time}-${dealer.id}`}
                          className={`border p-2 ${isBreak ? "bg-yellow-100 text-yellow-800" : ""}`}
                        >
                          {assignment}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
