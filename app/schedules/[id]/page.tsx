"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Edit, Printer, RefreshCw, Copy } from 'lucide-react'
import type { Dealer, Schedule, TimeSlot } from "@/lib/types" // Added TimeSlot
import { supabase } from "@/lib/supabase-singleton"
import { ScheduleTable } from "../schedule-table" // This resolves to app/schedules/schedule-table.tsx
import { generateSchedule, generateTimeSlots } from "@/lib/utils" // Ensured generateTimeSlots is imported

export default function ScheduleDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [formattedDate, setFormattedDate] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [isCopyingSchedule, setIsCopyingSchedule] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true) // Ensure loading state is true at the start
      try {
        if (!supabase) {
          throw new Error("Supabase client not initialized")
        }

        const { data: scheduleData, error: scheduleError } = await supabase
          .from("schedules")
          .select("*")
          .eq("id", params.id)
          .single()

        if (scheduleError) throw scheduleError
        if (!scheduleData) throw new Error("Schedule not found")


        const { data: dealersData, error: dealersError } = await supabase.from("dealers").select("*").order("name")

        if (dealersError) throw dealersError

        const formattedDateStr = format(new Date(scheduleData.date), "PPPP")

        setSchedule(scheduleData as Schedule)
        setDealers(dealersData || [])
        setFormattedDate(formattedDateStr)
      } catch (error: any) {
        console.error("Error fetching schedule:", error)
        const errorMessage = error.message || "Unknown error"
        const errorDetails = error.details || ""
        toast.error(`Error fetching schedule: ${errorMessage} ${errorDetails}`)
        setSchedule(null)
        setDealers([])
        setFormattedDate("")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase.from("schedules").delete().eq("id", params.id)
      if (error) throw error
      toast.success("Schedule deleted successfully")
      router.push("/schedules")
    } catch (error: any) {
      toast.error(`Error deleting schedule: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleRegenerate = async () => {
    if (!schedule || !dealers.length) {
        toast.error("Не може да се регенерира график без данни за график или дилъри.");
        return;
    }
    if (!confirm("Сигурни ли сте, че искате да регенерирате графика? Това ще презапише текущите назначения.")) {
      return
    }

    setIsRegenerating(true)
    try {
      const activeDealerIds = new Set<string>()
      if (schedule.schedule_data && typeof schedule.schedule_data === 'object') {
        Object.values(schedule.schedule_data).forEach((timeSlotData: any) => {
          if (typeof timeSlotData === 'object' && timeSlotData !== null) {
            Object.keys(timeSlotData).forEach((dealerId) => {
              if (dealerId !== '_preferences') { // Exclude preferences key
                 activeDealerIds.add(dealerId);
              }
            });
          }
        });
      }


      const activeDealers = dealers.filter((dealer) => activeDealerIds.has(dealer.id))
      if (activeDealers.length === 0) {
        toast.warn("Няма активни дилъри в текущия график. Регенерацията може да доведе до празен график.");
      }


      const preferences = schedule.schedule_data?._preferences || {
        firstBreakDealers: [],
        lastBreakDealers: [],
      }

      const newScheduleData = await generateSchedule(activeDealers, schedule.shift_type as "day" | "night", supabase, {
        firstBreakDealers: preferences.firstBreakDealers || [],
        lastBreakDealers: preferences.lastBreakDealers || [],
      })

      newScheduleData._preferences = preferences

      if (schedule.absent_dealers && schedule.absent_dealers.length > 0) {
        const timeSlotsArray: TimeSlot[] = generateTimeSlots(schedule.shift_type as "day" | "night") // Use imported function

        for (const absent of schedule.absent_dealers) {
          const startTimeIndex = timeSlotsArray.findIndex((slot) => slot.time === absent.startTime)
          if (startTimeIndex === -1) continue
          for (let i = startTimeIndex; i < timeSlotsArray.length; i++) {
            const currentSlot = timeSlotsArray[i].time
            if (!newScheduleData[currentSlot]) {
              newScheduleData[currentSlot] = {}
            }
            newScheduleData[currentSlot][absent.dealerId] = "BREAK"
          }
        }
      }

      const { error } = await supabase.from("schedules").update({ schedule_data: newScheduleData }).eq("id", params.id)
      if (error) throw error

      toast.success("Графикът е регенериран успешно")
      // Fetch updated data instead of full reload for better UX
      const { data: updatedScheduleData, error: fetchError } = await supabase
        .from("schedules")
        .select("*")
        .eq("id", params.id)
        .single();
      if (fetchError) throw fetchError;
      if (updatedScheduleData) setSchedule(updatedScheduleData as Schedule);
      
      // router.refresh(); // This might be sufficient if server components are used correctly
      // window.location.reload(); // Avoid full page reload if possible
    } catch (error: any) {
      console.error("Error regenerating schedule:", error)
      toast.error(`Грешка при регенериране на графика: ${error.message}`)
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleCopyScheduleStats = () => {
    if (!schedule || !dealers || !schedule.schedule_data) return

    setIsCopying(true)
    try {
      const timeSlotsArray: TimeSlot[] = generateTimeSlots(schedule.shift_type as "day" | "night") // Use imported function

      const dealersInSchedule = dealers.filter((dealer) => {
        return Object.values(schedule.schedule_data!).some((timeSlotData: any) => Object.keys(timeSlotData).includes(dealer.id))
      })

      const dealerStats = dealersInSchedule.map((dealer) => {
        const stats: {
            name: string;
            rotations: number;
            breaks: number;
            assignedTables: Set<string>;
            breakPositions: number[];
        } = {
          name: dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name,
          rotations: 0,
          breaks: 0,
          assignedTables: new Set<string>(),
          breakPositions: [], // Store indices
        }

        timeSlotsArray.forEach((slot, index) => {
          const assignment = schedule.schedule_data![slot.time]?.[dealer.id]
          if (assignment === "BREAK") {
            stats.breaks++
            stats.breakPositions.push(index)
          } else if (assignment && assignment !== "-") {
            stats.rotations++
            stats.assignedTables.add(assignment)
          }
        })
        return stats
      })

      let output = "ИМЕ | РОТАЦИИ | ПОЧИВКИ | УНИКАЛНИ МАСИ\n"
      output += "-".repeat(50) + "\n"

      dealerStats.forEach((stats) => {
        output += `${stats.name} | ${stats.rotations} | ${stats.breaks} | ${stats.assignedTables.size}\n`
        output += `  Маси: ${Array.from(stats.assignedTables).join(", ") || "Няма"}\n`
        const breakPositionsFormatted = stats.breakPositions
          .sort((a, b) => a - b)
          .map((pos) => timeSlotsArray[pos].formattedTime)
          .join(", ")
        output += `  Почивки в: ${breakPositionsFormatted || "Няма"}\n`
        output += "-".repeat(25) + "\n"
      })
      
      const totalRotations = dealerStats.reduce((sum, stats) => sum + stats.rotations, 0)
      const totalBreaks = dealerStats.reduce((sum, stats) => sum + stats.breaks, 0)
      const avgRotations = dealerStats.length > 0 ? (totalRotations / dealerStats.length).toFixed(2) : "0.00"
      const avgBreaks = dealerStats.length > 0 ? (totalBreaks / dealerStats.length).toFixed(2) : "0.00"

      output += "\nОбобщена статистика:\n"
      output += `Общо дилъри: ${dealerStats.length}\n`
      output += `Средно ротации: ${avgRotations}\n`
      output += `Средно почивки: ${avgBreaks}\n`
      output += `Общо маси в графика: ${Array.from(new Set(dealerStats.flatMap((s) => Array.from(s.assignedTables)))).length}\n`

      navigator.clipboard
        .writeText(output)
        .then(() => toast.success("Статистиката на графика е копирана"))
        .catch((err) => toast.error(`Грешка при копиране: ${err}`))
    } catch (error) {
      console.error("Error copying schedule stats:", error)
      toast.error("Грешка при копиране на статистиката")
    } finally {
      setIsCopying(false)
    }
  }

  const handleCopyForGoogleSheets = () => {
    if (!schedule || !dealers || !schedule.schedule_data) return

    setIsCopyingSchedule(true)
    try {
      const timeSlotsArray: TimeSlot[] = generateTimeSlots(schedule.shift_type as "day" | "night") // Use imported function

      const dealersInSchedule = dealers
        .filter((dealer) => {
          return Object.values(schedule.schedule_data!).some((timeSlotData: any) => Object.keys(timeSlotData).includes(dealer.id))
        })
        .sort((a, b) => (a.name).localeCompare(b.name)) // Sort by full name

      // Create header row: "Дилър" followed by formatted times
      let output = "Дилър"
      timeSlotsArray.forEach((slot) => {
        output += `\t${slot.formattedTime}`
      })
      output += "\n"

      // Create data rows: Dealer name followed by assignments for each time slot
      dealersInSchedule.forEach((dealer) => {
        const dealerDisplayName = dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name;
        output += dealerDisplayName
        timeSlotsArray.forEach((slot) => {
          const assignment = schedule.schedule_data![slot.time]?.[dealer.id] || "-"
          let displayValue = assignment
          if (assignment === "BREAK") {
            displayValue = "ПОЧИВКА"
          } else if (assignment === "-" || !assignment) {
            displayValue = "-"
          }
          output += `\t${displayValue}`
        })
        output += "\n"
      })

      if (schedule.absent_dealers && schedule.absent_dealers.length > 0) {
        output += "\n\nОтсъстващи дилъри:\n"
        output += "Дилър\tОт час\tПричина\n"
        schedule.absent_dealers.forEach((absent) => {
          const dealer = dealers.find((d) => d.id === absent.dealerId)
          const dealerName = dealer ? (dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name) : "Неизвестен"
          const reason = getAbsenceReasonLabel(absent.reason)
          output += `${dealerName}\t${absent.startTime}\t${reason}\n`
        })
      }

      navigator.clipboard
        .writeText(output)
        .then(() => toast.success("Графикът е копиран за Google Sheets"))
        .catch((err) => toast.error(`Грешка при копиране: ${err}`))
    } catch (error) {
      console.error("Error copying schedule for Google Sheets:", error)
      toast.error("Грешка при копиране на графика")
    } finally {
      setIsCopyingSchedule(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Зареждане на графика...</p>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Графикът не е намерен.</p>
      </div>
    )
  }

  const getAbsenceReasonLabel = (reason: string): string => {
    const reasonLabels: Record<string, string> = {
      sick: "Болест",
      injured: "Пострадал",
      unauthorized: "Своеволен",
      voluntary: "Тръгнал си доброволно",
      break: "Освободен за почивка",
    }
    return reasonLabels[reason] || reason
  }

  // Removed local generateTimeSlots function, using imported one from lib/utils

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Детайли за График</h1>
          <p className="text-muted-foreground">
            {formattedDate} - {schedule.shift_type === "day" ? "Дневна смяна (08:00-20:00)" : "Нощна смяна (20:00-08:00)"}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:space-x-2 gap-2 w-full md:w-auto">
          <Button variant="outline" onClick={handlePrint} className="w-full md:w-auto">
            <Printer className="mr-2 h-4 w-4" />
            Принтирай
          </Button>
          <Button variant="outline" onClick={handleCopyScheduleStats} disabled={isCopying} className="w-full md:w-auto">
            <Copy className="mr-2 h-4 w-4" />
            {isCopying ? "Копира..." : "Копирай Статистика"}
          </Button>
          <Button variant="outline" onClick={handleCopyForGoogleSheets} disabled={isCopyingSchedule} className="w-full md:w-auto">
            <Copy className="mr-2 h-4 w-4" />
            {isCopyingSchedule ? "Копира..." : "Копирай за Sheets"}
          </Button>
          <Button variant="outline" onClick={() => router.push(`/schedules/${params.id}/edit`)} className="w-full md:w-auto">
            <Edit className="mr-2 h-4 w-4" />
            Редактирай
          </Button>
          <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating} className="w-full md:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            {isRegenerating ? "Регенерира..." : "Регенерирай"}
          </Button>
          <DeleteConfirmationDialog itemName={`график за ${formattedDate}`} onConfirm={handleDelete} />
          <Button variant="outline" onClick={() => router.back()} className="w-full md:w-auto col-span-2 sm:col-span-1">
            Назад
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="print:pb-2">
          <CardTitle>
            График за {formattedDate} - {schedule.shift_type === "day" ? "Дневна смяна" : "Нощна смяна"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleTable schedule={schedule} dealers={dealers} />
          {schedule.absent_dealers && schedule.absent_dealers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">Отсъстващи дилъри</h3>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left font-semibold">Дилър</th>
                      <th className="p-2 text-left font-semibold">От час</th>
                      <th className="p-2 text-left font-semibold">Причина</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.absent_dealers.map((absent, index) => {
                      const dealer = dealers.find((d) => d.id === absent.dealerId)
                      const timeSlot = generateTimeSlots(schedule.shift_type as "day" | "night").find( // Use imported
                        (t) => t.time === absent.startTime,
                      )
                      const dealerDisplayName = dealer 
                        ? (dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name) 
                        : "Неизвестен";

                      return (
                        <tr key={index} className="border-t hover:bg-muted/50">
                          <td className="p-2">{dealerDisplayName}</td>
                          <td className="p-2">{timeSlot ? timeSlot.formattedTime : absent.startTime}</td>
                          <td className="p-2">{getAbsenceReasonLabel(absent.reason)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
