"use client"

import { useState, useEffect, useMemo } from "react"
import { format, addMinutes } from "date-fns"
import { bg } from "date-fns/locale"
import { supabase } from "@/lib/supabase-singleton"
import type { Schedule, Dealer, DisplaySettings, TimeSlot } from "@/lib/types"
import { Loader2, Clock, AlertCircle, Monitor } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function LiveView() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [settings, setSettings] = useState<DisplaySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Fetch initial data and set up polling
  useEffect(() => {
    fetchData()
    const pollTimer = setInterval(fetchData, 60000) // Poll every minute
    return () => clearInterval(pollTimer)
  }, [])

  const fetchData = async () => {
    try {
      // 1. Fetch settings
      const { data: settingsData, error: settingsError } = await supabase.from("display_settings").select("*").single()

      if (settingsError && settingsError.code !== "PGRST116") throw settingsError

      // Default settings if none found
      const currentSettings = settingsData || { advance_minutes: 15, slots_to_show: 3 }
      setSettings(currentSettings)

      // 2. Fetch dealers
      const { data: dealersData, error: dealersError } = await supabase.from("dealers").select("*").order("name")

      if (dealersError) throw dealersError
      setDealers(dealersData || [])

      // 3. Fetch active schedule
      const today = format(new Date(), "yyyy-MM-dd")
      const yesterday = format(addMinutes(new Date(), -24 * 60), "yyyy-MM-dd")

      const { data: schedulesData, error: schedulesError } = await supabase
        .from("schedules")
        .select("*")
        .eq("published", true)
        .in("date", [yesterday, today])
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })

      if (schedulesError) throw schedulesError

      let activeSchedule = null
      if (schedulesData && schedulesData.length > 0) {
        const now = new Date()
        const currentHour = now.getHours()

        if (currentHour < 8) {
          const yesterdayNight = schedulesData.find((s) => s.date === yesterday && s.shift_type === "night")
          if (yesterdayNight) {
            activeSchedule = yesterdayNight
          } else {
            activeSchedule = schedulesData[0]
          }
        } else {
          activeSchedule = schedulesData[0]
        }
      }

      setSchedule(activeSchedule)
      setError(null)
    } catch (err: any) {
      console.error("Error fetching live data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getMinutes = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(":").map(Number)
    return hours * 60 + minutes
  }

  const activeDealers = useMemo(() => {
    if (!schedule || !dealers.length) return []

    const scheduledDealerIds = new Set<string>()

    // Iterate through all time slots in the schedule data to find active dealers
    Object.values(schedule.schedule_data).forEach((slotAssignments) => {
      Object.keys(slotAssignments).forEach((dealerId) => {
        scheduledDealerIds.add(dealerId)
      })
    })

    return dealers.filter((dealer) => scheduledDealerIds.has(dealer.id))
  }, [schedule, dealers])

  const displayTime = addMinutes(currentTime, settings?.advance_minutes || 0)
  const displayTimeStr = format(displayTime, "HH:mm")
  const displayMinutes = getMinutes(displayTimeStr)

  let relevantSlots: TimeSlot[] = []

  if (schedule?.shift_type === "night") {
    const adjustTime = (m: number) => (m < 12 * 60 ? m + 24 * 60 : m)
    const adjustedDisplay = adjustTime(displayMinutes)

    let startIndex = schedule.time_slots.findIndex((slot) => {
      const slotMinutes = getMinutes(slot.time)
      const adjustedSlot = adjustTime(slotMinutes)
      return adjustedSlot >= adjustedDisplay
    })

    if (startIndex === -1) startIndex = 0
    relevantSlots = schedule.time_slots.slice(startIndex, startIndex + (settings?.slots_to_show || 3))
  } else {
    const startIndex = schedule?.time_slots.findIndex((slot) => {
      const slotMinutes = getMinutes(slot.time)
      return slotMinutes >= displayMinutes
    })

    if (startIndex !== -1) {
      relevantSlots = schedule.time_slots.slice(startIndex, startIndex + (settings?.slots_to_show || 3))
    }
  }

  if (loading && !schedule) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 bg-black min-h-screen text-white">
        <Alert variant="destructive" className="border-red-900 bg-red-950 text-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Грешка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!schedule || !settings) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4 bg-black text-white">
        <Monitor className="h-16 w-16 text-muted-foreground opacity-20" />
        <h1 className="text-2xl font-bold tracking-tight">Няма Активен График</h1>
        <p className="text-muted-foreground">В момента няма публикуван график за показване.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20">
      {/* Top Bar */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-[1920px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-bold tracking-tighter text-white">
              ГРАФИК <span className="text-white/40 font-light">НА ЖИВО</span>
            </h1>
            <div className="h-8 w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white/80 uppercase tracking-wider">
                {format(new Date(schedule.date), "EEEE, d MMMM", { locale: bg })}
              </span>
              <span className="text-xs text-white/40 uppercase tracking-widest">
                {schedule.shift_type === "day" ? "Дневна Смяна" : "Нощна Смяна"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-widest mb-0.5">Текущо време</div>
              <div className="text-3xl font-mono font-bold tracking-tight leading-none">
                {format(currentTime, "HH:mm")}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-6">
        {relevantSlots.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden backdrop-blur-sm">
            {/* Table Header */}
            <div
              className="grid border-b border-white/10 bg-white/5"
              style={{
                gridTemplateColumns: `minmax(200px, 1fr) repeat(${relevantSlots.length}, minmax(150px, 1fr))`,
              }}
            >
              <div className="p-4 text-xs font-medium text-white/40 uppercase tracking-widest flex items-center">
                Дилър
              </div>
              {relevantSlots.map((slot) => (
                <div
                  key={slot.time}
                  className="p-4 text-center border-l border-white/10 flex flex-col items-center justify-center py-6"
                >
                  <span className="text-2xl font-mono font-bold text-white">{slot.formattedTime}</span>
                  <span className="text-[10px] text-white/30 uppercase tracking-widest mt-1">Слот</span>
                </div>
              ))}
            </div>

            {/* Table Body */}
            <div className="divide-y divide-white/5">
              {activeDealers.map((dealer) => {
                // Check if dealer has any assignment in these slots
                const hasAssignment = relevantSlots.some(
                  (slot) =>
                    schedule.schedule_data[slot.time]?.[dealer.id] &&
                    schedule.schedule_data[slot.time]?.[dealer.id] !== "-",
                )

                // Optional: Hide dealers with no assignments in view
                // if (!hasAssignment) return null;

                return (
                  <div
                    key={dealer.id}
                    className="grid hover:bg-white/5 transition-colors group"
                    style={{
                      gridTemplateColumns: `minmax(200px, 1fr) repeat(${relevantSlots.length}, minmax(150px, 1fr))`,
                    }}
                  >
                    <div className="p-4 flex items-center font-medium text-lg text-white/90 group-hover:text-white transition-colors">
                      {dealer.nickname || dealer.name}
                    </div>
                    {relevantSlots.map((slot) => {
                      const assignment = schedule.schedule_data[slot.time]?.[dealer.id] || "-"
                      const isBreak = assignment === "BREAK"
                      const isRoulette = assignment.startsWith("ROU")
                      const isBlackjack = assignment.startsWith("BJ")

                      return (
                        <div
                          key={`${dealer.id}-${slot.time}`}
                          className="p-2 border-l border-white/5 flex items-center justify-center"
                        >
                          <div
                            className={`
                            w-full h-full min-h-[3rem] rounded flex items-center justify-center font-bold text-lg tracking-tight transition-all
                            ${
                              isBreak
                                ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                                : isRoulette
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : isBlackjack
                                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                    : assignment !== "-"
                                      ? "bg-white/5 text-white border border-white/10"
                                      : "text-white/10"
                            }
                          `}
                          >
                            {isBreak ? "ПОЧИВКА" : assignment}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-white/20 border border-white/10 rounded-xl bg-white/5">
            <Clock className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-xl font-light">Няма предстоящи слотове за тази смяна</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between text-xs text-white/30 uppercase tracking-widest">
          <div>Показване на графика {settings?.advance_minutes || 0} минути напред</div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Системата е онлайн
          </div>
        </div>
      </main>
    </div>
  )
}
