"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { bg } from "date-fns/locale"
import type { Schedule, SystemSettings } from "@/lib/types"
import { Clock, Calendar } from "lucide-react"

interface DealerScheduleDisplayProps {
  schedule: Schedule
  settings: SystemSettings
}

export function DealerScheduleDisplay({ schedule, settings }: DealerScheduleDisplayProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [displayTime, setDisplayTime] = useState(new Date())
  const [relevantSlots, setRelevantSlots] = useState<string[]>([])
  const [dealers, setDealers] = useState<string[]>([])

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setCurrentTime(now)

      // Calculate display time based on offset
      const offsetTime = new Date(now.getTime() + settings.dealer_view_offset_minutes * 60000)
      setDisplayTime(offsetTime)
    }, 1000)

    return () => clearInterval(timer)
  }, [settings.dealer_view_offset_minutes])

  // Calculate relevant slots based on display time
  useEffect(() => {
    if (!schedule.schedule_data) return

    const allSlots = Object.keys(schedule.schedule_data).sort()
    if (allSlots.length === 0) return

    // Extract dealers list from the first slot
    const firstSlot = allSlots[0]
    const dealerIds = Object.keys(schedule.schedule_data[firstSlot]).sort()
    setDealers(dealerIds)

    // Find the current/next slot based on displayTime
    // We convert displayTime to HH:mm string to compare
    const displayTimeStr = format(displayTime, "HH:mm")

    // Find the index of the slot that covers the display time
    // Assuming slots are sorted
    const startIndex = -1

    // Simple logic: find the first slot that is >= displayTimeStr
    // Or if we are in the middle of a slot, find that slot.
    // Since we don't know the duration, we'll assume we want the slot that starts closest to now but not too far in past
    // Actually, the requirement is: "at 7:15 show 7:30".
    // If slots are 7:00, 7:30, 8:00.
    // At 7:15 + 15min offset = 7:30. So we show 7:30.
    // At 7:14 + 15min offset = 7:29. We should probably still show 7:30 if we want to be "ahead".
    // But usually "current slot" means the one active.
    // Let's stick to: Find the first slot where startTime >= displayTimeStr
    // Wait, if it's 7:35 (display time), and slots are 7:30, 8:00. We should show 7:30 as "current".
    // So we find the last slot where startTime <= displayTimeStr.

    // Let's handle the day rollover (night shift) carefully if needed, but for now string comparison works for same day.
    // For night shift crossing midnight, 00:00 is smaller than 23:00.
    // We need a robust way to sort and find.

    // Helper to convert "HH:mm" to minutes from start of day (or shift start)
    const getMinutes = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(":").map(Number)
      // Handle night shift logic if needed, but let's assume standard day for sorting
      // If schedule is night shift, we might need to treat 00:00-08:00 as "after" 20:00.
      if (schedule.shift_type === "night" && hours < 12) {
        return (hours + 24) * 60 + minutes
      }
      return hours * 60 + minutes
    }

    const sortedSlots = [...allSlots].sort((a, b) => getMinutes(a) - getMinutes(b))
    const displayMinutes = getMinutes(displayTimeStr)

    // Find the active slot: the last slot with startTime <= displayTime
    let activeSlotIndex = -1
    for (let i = 0; i < sortedSlots.length; i++) {
      if (getMinutes(sortedSlots[i]) <= displayMinutes) {
        activeSlotIndex = i
      } else {
        break
      }
    }

    // If we haven't started yet (activeSlotIndex -1), show from the beginning
    if (activeSlotIndex === -1) activeSlotIndex = 0

    // Take N slots starting from activeSlotIndex
    // But wait, if we are "offsetting" to see the FUTURE, maybe we want the NEXT slot?
    // "At 7:15 show 7:30".
    // If slots are 7:00, 7:30.
    // 7:15 real time. Offset 15. Display time 7:30.
    // getMinutes(7:30) <= getMinutes(7:30) is true. So active slot is 7:30.
    // So logic holds.

    const slotsToShow = sortedSlots.slice(
      activeSlotIndex,
      activeSlotIndex + (settings.dealer_view_lookahead_slots || 3),
    )
    setRelevantSlots(slotsToShow)
  }, [displayTime, schedule, settings.dealer_view_lookahead_slots])

  // Helper to get dealer name (mocked or from ID if we had dealer list)
  // Since we only have IDs in schedule_data, we might need to fetch dealers.
  // But wait, schedule_data keys are dealer IDs.
  // We should probably fetch dealer names.
  // For now, I'll just use the ID or try to find a name if available in the schedule object (it's not).
  // I'll fetch dealers in the parent or here.
  // Actually, let's just display the ID for now or assume the ID is the name if it looks like one.
  // In the real app, we should fetch dealers.
  // I'll add a quick fetch for dealers in the useEffect.

  const [dealerNames, setDealerNames] = useState<Record<string, string>>({})

  useEffect(() => {
    // Fetch dealer names
    const fetchDealers = async () => {
      // We can't easily import supabase here if we want to keep this pure UI?
      // No, we can use client supabase.
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { data } = await supabase.from("dealers").select("id, name, nickname")
      if (data) {
        const names: Record<string, string> = {}
        data.forEach((d) => {
          names[d.id] = d.nickname || d.name
        })
        setDealerNames(names)
      }
    }
    fetchDealers()
  }, [])

  return (
    <div className="container mx-auto p-4 max-w-full overflow-x-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8" />
            График за {format(new Date(schedule.date), "d MMMM yyyy", { locale: bg })}
          </h1>
          <p className="text-muted-foreground">{schedule.shift_type === "day" ? "Дневна смяна" : "Нощна смяна"}</p>
        </div>
        <div className="flex items-center gap-4 bg-secondary p-4 rounded-lg">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Текущо време</p>
            <p className="text-2xl font-mono font-bold">{format(currentTime, "HH:mm:ss")}</p>
          </div>
          <div className="h-10 w-px bg-border mx-2" />
          <div className="text-left">
            <p className="text-sm text-muted-foreground">Показано време (+{settings.dealer_view_offset_minutes}м)</p>
            <p className="text-2xl font-mono font-bold text-primary">{format(displayTime, "HH:mm")}</p>
          </div>
        </div>
      </div>

      {relevantSlots.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px] font-bold text-lg">Дилър</TableHead>
                  {relevantSlots.map((slot) => (
                    <TableHead key={slot} className="text-center font-bold text-lg bg-muted/50">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-4 w-4" />
                        {slot}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dealers.map((dealerId) => (
                  <TableRow key={dealerId} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-lg">{dealerNames[dealerId] || dealerId}</TableCell>
                    {relevantSlots.map((slot) => {
                      const assignment = schedule.schedule_data[slot]?.[dealerId]
                      const isBreak = assignment === "BREAK" || !assignment
                      return (
                        <TableCell key={slot} className="text-center p-2">
                          <div
                            className={`
                            py-3 px-4 rounded-md font-bold text-lg shadow-sm border
                            ${
                              isBreak
                                ? "bg-gray-100 text-gray-400 border-gray-200"
                                : "bg-white text-primary border-blue-200"
                            }
                          `}
                          >
                            {isBreak ? "ПОЧИВКА" : assignment}
                          </div>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-12">
          <p className="text-xl text-muted-foreground">Няма слотове за показване в момента.</p>
        </div>
      )}
    </div>
  )
}
