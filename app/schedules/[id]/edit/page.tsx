"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { format, parse } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, AlertTriangle, CheckCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { generateTimeSlots, cn } from "@/lib/utils"
import type {
  Dealer,
  Schedule,
  CasinoTable,
  ScheduleData,
  DealerBreakPreference,
  FirstBreakReasonCode,
  LastBreakReasonCode,
} from "@/lib/types"
import { supabase } from "@/lib/supabase-singleton"
import { generateSchedule as generateScheduleAlgorithm } from "@/lib/schedule-generator"

type AbsenceReasonUi = "sick" | "injured" | "unauthorized" | "voluntary" | "break"

interface AbsenceFormData {
  dealerId: string
  startTime: string
  reason: AbsenceReasonUi
}

interface ExtraBreakFormData {
  dealerId: string
  timeSlot: string
  reason: string
}

interface DealerChangeFormData {
  dealer1Id: string
  dealer2Id: string
  timeSlot: string
}

interface ManualAdjustment {
  id: string // За key в React
  dealerId: string
  dealerName: string // За по-лесно показване
  type: "first" | "last"
  reason: FirstBreakReasonCode | LastBreakReasonCode
  reasonLabel: string
  timestamp: string // Кога е направена промяната
  rawSlotTimeKey: string // Добавено: Суровият ключ на времевия слот, напр. "0800"
  adjustedSlotFormattedTime?: string // Променено име за яснота (преди adjustedSlotTime)
}

interface ScheduleTableProps {
  schedule: Schedule | null
  dealers: Dealer[]
}

const firstBreakReasonOptions: { value: FirstBreakReasonCode; label: string }[] = [
  { value: "dealer_request", label: "По желание на дилъра" },
  { value: "late_for_table", label: "Закъснял за първа маса" },
  { value: "schedule_needs", label: "Нужди на графика" },
  { value: "other", label: "Друга причина" },
]

const lastBreakReasonOptions: { value: LastBreakReasonCode; label: string }[] = [
  { value: "personal_commitment", label: "Личен ангажимент" },
  { value: "dealer_request", label: "По желание на дилъра" },
  { value: "schedule_needs", label: "Нужди на графика" },
  { value: "other", label: "Друга причина" },
]

// ... (ScheduleTableComponent остава същия)
function ScheduleTableComponent({ schedule, dealers }: ScheduleTableProps) {
  if (!schedule || !schedule.schedule_data) {
    return <p>No schedule data available.</p>
  }

  const timeSlots = generateTimeSlots(schedule.shift_type)
  const dealersToDisplay = dealers.sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border p-2 text-left">Dealer</th>
            {timeSlots.map((slot) => (
              <th key={slot.time} className="border p-2 text-center">
                {slot.formattedTime}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dealersToDisplay.map((dealer) => (
            <tr key={dealer.id} className="hover:bg-muted/50">
              <td className="border p-2 font-medium">
                {dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name}
              </td>
              {timeSlots.map((slot) => {
                const assignment = schedule.schedule_data[slot.time]?.[dealer.id] || "-"
                const isBreak = assignment === "BREAK"
                let cellClass = "border p-2 text-center"

                if (isBreak) {
                  cellClass += " bg-yellow-100 text-yellow-800"
                } else if (assignment.startsWith("BJ")) {
                  cellClass += " bg-blue-100 text-blue-800"
                } else if (assignment.startsWith("ROU")) {
                  cellClass += " bg-green-100 text-green-800"
                }

                return (
                  <td key={`${dealer.id}-${slot.time}`} className={cellClass}>
                    {assignment}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function EditSchedulePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [tables, setTables] = useState<CasinoTable[]>([])
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [shiftType, setShiftType] = useState<"day" | "night">("day")
  const [scheduleData, setScheduleData] = useState<ScheduleData>({})

  const [firstBreakPreferences, setFirstBreakPreferences] = useState<DealerBreakPreference[]>([])
  const [lastBreakPreferences, setLastBreakPreferences] = useState<DealerBreakPreference[]>([])
  const [manualAdjustments, setManualAdjustments] = useState<ManualAdjustment[]>([])

  const [initialPreferences, setInitialPreferences] = useState<{
    first: DealerBreakPreference[]
    last: DealerBreakPreference[]
  }>({ first: [], last: [] })

  const [activeTab, setActiveTab] = useState("schedule")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)

  const [absenceForm, setAbsenceForm] = useState<AbsenceFormData>({
    dealerId: "",
    startTime: "",
    reason: "sick",
  })

  const [extraBreakForm, setExtraBreakForm] = useState<ExtraBreakFormData>({
    dealerId: "",
    timeSlot: "",
    reason: "",
  })

  const [dealerChangeForm, setDealerChangeForm] = useState<DealerChangeFormData>({
    dealer1Id: "",
    dealer2Id: "",
    timeSlot: "",
  })

  const [absentDealers, setAbsentDealers] = useState<
    {
      dealerId: string
      startTime: string
      reason: AbsenceReasonUi
    }[]
  >([])

  const [isPreviewingAbsence, setIsPreviewingAbsence] = useState(false)
  const [previewData, setPreviewData] = useState<{
    dealerId: string
    startTime: string
    reason: AbsenceReasonUi
    scheduleData: ScheduleData
  } | null>(null)

  const [isPreviewingExtraBreak, setIsPreviewingExtraBreak] = useState(false)
  const [extraBreakPreviewData, setExtraBreakPreviewData] = useState<{
    dealerId: string
    timeSlot: string
    reason: string
    scheduleData: ScheduleData
    coveringDealer?: string
    isValid: boolean
    message: string
  } | null>(null)

  const [isPreviewingDealerChange, setIsPreviewingDealerChange] = useState(false)
  const [dealerChangePreviewData, setDealerChangePreviewData] = useState<{
    dealer1Id: string
    dealer2Id: string
    timeSlot: string
    scheduleData: ScheduleData
    isValid: boolean
    message: string
    warnings: string[]
  } | null>(null)

  const [originalDealerIds, setOriginalDealerIds] = useState<string[]>([])

  const preferencesHaveChanged = useMemo(() => {
    const currentPrefs = {
      first: firstBreakPreferences,
      last: lastBreakPreferences,
    }
    // Simple deep comparison
    return JSON.stringify(currentPrefs) !== JSON.stringify(initialPreferences)
  }, [firstBreakPreferences, lastBreakPreferences, initialPreferences])

  const tableOptions = [{ id: "break", value: "BREAK", label: "BREAK" }]

  const dealersToDisplayInTable = useMemo(() => {
    if (originalDealerIds.length > 0) {
      return dealers.filter((d) => originalDealerIds.includes(d.id)).sort((a, b) => a.name.localeCompare(b.name))
    }
    return dealers
      .filter((dealer) => {
        if (!scheduleData || Object.keys(scheduleData).length === 0) return false
        return Object.values(scheduleData).some(
          (timeSlotData) => timeSlotData && Object.keys(timeSlotData).includes(dealer.id),
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dealers, scheduleData, originalDealerIds])

  const dealersCurrentlyInScheduleForAbsenceSelection = useMemo(() => {
    return dealersToDisplayInTable
      .filter((d) => !absentDealers.some((ad) => ad.dealerId === d.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dealersToDisplayInTable, absentDealers])

  const getAbsenceReasonLabel = (reason: AbsenceReasonUi): string => {
    const reasonLabels: Record<AbsenceReasonUi, string> = {
      sick: "Болест",
      injured: "Пострадал",
      unauthorized: "Своеволен",
      voluntary: "Тръгнал си доброволно",
      break: "Освободен за почивка",
    }
    return reasonLabels[reason] || reason
  }

  const getCellClass = (assignment: string) => {
    const isBreak = assignment === "BREAK"
    let cellClass = "border p-2 text-center"
    if (isBreak) cellClass += " bg-yellow-100 text-yellow-800"
    else if (assignment.startsWith("BJ")) cellClass += " bg-blue-100 text-blue-800"
    else if (assignment.startsWith("ROU")) cellClass += " bg-green-100 text-green-800"
    return cellClass
  }

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const { data: scheduleResult, error: scheduleError } = await supabase
          .from("schedules")
          .select("*")
          .eq("id", params.id)
          .single()

        if (scheduleError) throw scheduleError
        if (!scheduleResult) throw new Error("Schedule not found")

        const currentScheduleData = (scheduleResult.schedule_data as ScheduleData) || {}
        if (currentScheduleData && typeof currentScheduleData === "object") {
          const dealerIdsInInitialSchedule = new Set<string>()
          Object.values(currentScheduleData).forEach((timeSlotData: any) => {
            if (typeof timeSlotData === "object" && timeSlotData !== null) {
              Object.keys(timeSlotData).forEach((dealerId) => {
                if (dealerId !== "_preferences" && dealerId !== "_manualAdjustments") {
                  // Игнорираме и новия ключ
                  dealerIdsInInitialSchedule.add(dealerId)
                }
              })
            }
          })
          setOriginalDealerIds(Array.from(dealerIdsInInitialSchedule))
        }
        setScheduleData(currentScheduleData)

        const { data: dealersResult, error: dealersError } = await supabase.from("dealers").select("*").order("name")
        if (dealersError) throw dealersError
        const sanitizedDealers = (dealersResult || []).map((d) => ({
          ...d,
          available_tables: Array.isArray(d.available_tables) ? d.available_tables : [],
        })) as Dealer[]
        setDealers(sanitizedDealers)

        const { data: tablesResult, error: tablesError } = await supabase
          .from("casino_tables")
          .select("*")
          .order("name")
        if (tablesError) throw tablesError
        setTables(tablesResult || [])

        const parsedDate = parse(scheduleResult.date, "yyyy-MM-dd", new Date())
        const preferences = currentScheduleData._preferences || {}
        const loadedPrefs = {
          first: preferences.firstBreakPreferences || [],
          last: preferences.lastBreakPreferences || [],
        }
        setFirstBreakPreferences(preferences.firstBreakPreferences || [])
        setLastBreakPreferences(preferences.lastBreakPreferences || [])
        setInitialPreferences(loadedPrefs)
        setManualAdjustments(currentScheduleData._manualAdjustments || [])

        setSchedule(scheduleResult as Schedule)
        setDate(parsedDate)
        setShiftType(scheduleResult.shift_type)

        if (scheduleResult.absent_dealers) {
          setAbsentDealers(scheduleResult.absent_dealers as any[])
        }
      } catch (error: any) {
        console.error("Error fetching schedule:", error)
        toast.error(`Error fetching schedule: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [params.id])

  const handleAssignmentChange = (timeSlot: string, dealerId: string, value: string) => {
    setScheduleData((prev) => {
      const newData = { ...prev }
      if (!newData[timeSlot]) {
        newData[timeSlot] = {}
      }
      newData[timeSlot][dealerId] = value
      return newData
    })
  }

  const applyManualBreak = (
    dealerId: string,
    type: "first" | "last",
    reason: FirstBreakReasonCode | LastBreakReasonCode,
  ) => {
    const dealer = dealers.find((d) => d.id === dealerId)
    if (!dealer) return

    const currentSlots = generateTimeSlots(shiftType)
    let targetSlotTime: string | undefined = undefined // Това ще бъде суровият ключ, напр. "0800"
    const affectedSlotIndices: number[] = []

    setScheduleData((prevScheduleData) => {
      const newScheduleData = JSON.parse(JSON.stringify(prevScheduleData)) // Deep copy

      if (type === "first") {
        for (let i = 0; i < currentSlots.length; i++) {
          const slotTimeKey = currentSlots[i].time
          if (newScheduleData[slotTimeKey]?.[dealerId] && newScheduleData[slotTimeKey][dealerId] !== "BREAK") {
            targetSlotTime = slotTimeKey
            affectedSlotIndices.push(i)
            break
          }
        }
      } else {
        // type === "last"
        for (let i = currentSlots.length - 1; i >= 0; i--) {
          const slotTimeKey = currentSlots[i].time
          if (newScheduleData[slotTimeKey]?.[dealerId] && newScheduleData[slotTimeKey][dealerId] !== "BREAK") {
            targetSlotTime = slotTimeKey
            affectedSlotIndices.push(i)
            break
          }
        }
      }

      if (targetSlotTime) {
        // Прилагаме промяната към всички засегнати слотове (макар тук да е само един)
        affectedSlotIndices.forEach((index) => {
          const slotTimeToChange = currentSlots[index].time // Суров ключ
          if (!newScheduleData[slotTimeToChange]) newScheduleData[slotTimeToChange] = {}
          newScheduleData[slotTimeToChange][dealerId] = "BREAK"
        })

        const reasonOption =
          type === "first"
            ? firstBreakReasonOptions.find((opt) => opt.value === reason)
            : lastBreakReasonOptions.find((opt) => opt.value === reason)

        const newAdjustment: ManualAdjustment = {
          id: crypto.randomUUID(),
          dealerId,
          dealerName: dealer.nickname || dealer.name,
          type,
          reason,
          reasonLabel: reasonOption?.label || String(reason),
          timestamp: new Date().toISOString(),
          rawSlotTimeKey: targetSlotTime, // Запазваме суровия ключ
          adjustedSlotFormattedTime: targetSlotTime // Форматираното време за показване в лога
            ? currentSlots.find((s) => s.time === targetSlotTime)?.formattedTime
            : undefined,
        }
        setManualAdjustments((prev) => [...prev, newAdjustment])
        toast.success(
          `${dealer.name} - ${type === "first" ? "първа" : "последна"} почивка е приложена в ${newAdjustment.adjustedSlotFormattedTime || newAdjustment.rawSlotTimeKey}. Графикът е обновен.`,
        )
      } else {
        toast.warn(
          `Не е намерен работен слот за ${dealer.name}, за да се приложи ${type === "first" ? "първа" : "последна"} почивка.`,
        )
      }
      return newScheduleData
    })
  }

  const handleFirstBreakPreferenceChange = (dealerId: string, checked: boolean, reason: FirstBreakReasonCode) => {
    const dealer = dealers.find((d) => d.id === dealerId)
    if (!dealer) return

    if (checked) {
      applyManualBreak(dealerId, "first", reason)
      setFirstBreakPreferences((prev) => {
        const existingPrefIndex = prev.findIndex((p) => p.dealerId === dealerId)
        if (existingPrefIndex !== -1) {
          const updatedPrefs = [...prev]
          updatedPrefs[existingPrefIndex].reason = reason
          return updatedPrefs
        }
        return [...prev, { dealerId, reason }]
      })
      setLastBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealerId))
    } else {
      setFirstBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealerId))

      const currentSlots = generateTimeSlots(shiftType)
      let breakRevertedInSchedule = false
      let revertedSlotFormattedTime = ""
      let revertedRawSlotKey = ""

      setScheduleData((prevScheduleData) => {
        const newScheduleData = JSON.parse(JSON.stringify(prevScheduleData))
        for (let i = 0; i < currentSlots.length; i++) {
          const slotTimeKey = currentSlots[i].time
          if (newScheduleData[slotTimeKey]?.[dealerId] === "BREAK") {
            newScheduleData[slotTimeKey][dealerId] = "-"
            revertedSlotFormattedTime = currentSlots[i].formattedTime
            revertedRawSlotKey = slotTimeKey
            breakRevertedInSchedule = true
            break
          }
        }
        return newScheduleData
      })

      if (breakRevertedInSchedule) {
        setManualAdjustments((prevAdj) =>
          prevAdj.filter(
            (adj) => !(adj.dealerId === dealerId && adj.type === "first" && adj.rawSlotTimeKey === revertedRawSlotKey),
          ),
        )
        toast.info(`${dealer.name} - премахната първа почивка от ${revertedSlotFormattedTime}. Слотът е изчистен.`)
      } else {
        toast.info(
          `Премахнато предпочитание за първа почивка за ${dealer.name}. Не е намерена активна почивка за премахване в графика.`,
        )
      }
    }
  }

  const handleLastBreakPreferenceChange = (dealerId: string, checked: boolean, reason: LastBreakReasonCode) => {
    const dealer = dealers.find((d) => d.id === dealerId)
    if (!dealer) return

    if (checked) {
      applyManualBreak(dealerId, "last", reason)
      setLastBreakPreferences((prev) => {
        const existingPrefIndex = prev.findIndex((p) => p.dealerId === dealerId)
        if (existingPrefIndex !== -1) {
          const updatedPrefs = [...prev]
          updatedPrefs[existingPrefIndex].reason = reason
          return updatedPrefs
        }
        return [...prev, { dealerId, reason }]
      })
      setFirstBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealerId))
    } else {
      setLastBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealerId))

      const currentSlots = generateTimeSlots(shiftType)
      let breakRevertedInSchedule = false
      let revertedSlotFormattedTime = ""
      let revertedRawSlotKey = ""

      setScheduleData((prevScheduleData) => {
        const newScheduleData = JSON.parse(JSON.stringify(prevScheduleData))
        for (let i = currentSlots.length - 1; i >= 0; i--) {
          const slotTimeKey = currentSlots[i].time
          if (newScheduleData[slotTimeKey]?.[dealerId] === "BREAK") {
            newScheduleData[slotTimeKey][dealerId] = "-"
            revertedSlotFormattedTime = currentSlots[i].formattedTime
            revertedRawSlotKey = slotTimeKey
            breakRevertedInSchedule = true
            break
          }
        }
        return newScheduleData
      })

      if (breakRevertedInSchedule) {
        setManualAdjustments((prevAdj) =>
          prevAdj.filter(
            (adj) => !(adj.dealerId === dealerId && adj.type === "last" && adj.rawSlotTimeKey === revertedRawSlotKey),
          ),
        )
        toast.info(`${dealer.name} - премахната последна почивка от ${revertedSlotFormattedTime}. Слотът е изчистен.`)
      } else {
        toast.info(
          `Премахнато предпочитание за последна почивка за ${dealer.name}. Не е намерена активна почивка за премахване в графика.`,
        )
      }
    }
  }

  const executeSave = async () => {
    setShowRegenerateConfirm(false)
    if (!date) {
      toast.error("Please select a date")
      return
    }
    setIsSubmitting(true)

    try {
      const dataToSave = { ...scheduleData }
      dataToSave._preferences = {
        // Запазваме списъка с избрани предпочитания
        firstBreakPreferences,
        lastBreakPreferences,
      }
      dataToSave._manualAdjustments = manualAdjustments // Запазваме лога на ръчните промени

      const { error } = await supabase
        .from("schedules")
        .update({
          date: format(date, "yyyy-MM-dd"),
          shift_type: shiftType,
          schedule_data: dataToSave, // scheduleData вече е променено от applyManualBreak
          absent_dealers: absentDealers,
        })
        .eq("id", params.id)

      if (error) throw error

      toast.success(`Schedule saved successfully`)
      // Update initial preferences to match the saved state
      setInitialPreferences({
        first: firstBreakPreferences,
        last: lastBreakPreferences,
      })
      // No need to push, user stays on the page to see changes
      // router.push(`/schedules/${params.id}`);
    } catch (error: any) {
      toast.error(`Error saving schedule: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveClick = () => {
    executeSave()
  }

  const generatePartialSchedule = async (
    dealers: Dealer[],
    timeSlots: { time: string; formattedTime: string }[],
    shiftType: "day" | "night",
    preferences?: { firstBreakDealers: string[]; lastBreakDealers: string[] },
  ): Promise<ScheduleData> => {
    try {
      // Create a temporary shift type that matches our partial time slots
      // We'll use the existing algorithm but only take the slots we need
      const fullSchedule = await generateScheduleAlgorithm(dealers, shiftType, supabase, preferences)

      // Extract only the time slots we need
      const partialSchedule: ScheduleData = {}
      timeSlots.forEach((slot, index) => {
        // Map our partial slots to the full schedule slots
        const fullTimeSlots = generateTimeSlots(shiftType)
        const correspondingFullSlot = fullTimeSlots[index]

        if (correspondingFullSlot && fullSchedule[correspondingFullSlot.time]) {
          partialSchedule[slot.time] = fullSchedule[correspondingFullSlot.time]
        } else {
          // Initialize empty slot if no corresponding slot found
          partialSchedule[slot.time] = {}
          dealers.forEach((dealer) => {
            partialSchedule[slot.time][dealer.id] = "BREAK"
          })
        }
      })

      return partialSchedule
    } catch (error) {
      console.error("Error generating partial schedule:", error)
      // Return empty schedule on error
      const emptySchedule: ScheduleData = {}
      timeSlots.forEach((slot) => {
        emptySchedule[slot.time] = {}
        dealers.forEach((dealer) => {
          emptySchedule[slot.time][dealer.id] = "BREAK"
        })
      })
      return emptySchedule
    }
  }

  const handleMarkAbsent = async () => {
    const { dealerId, startTime, reason } = absenceForm
    if (!dealerId || !startTime) {
      toast.error("Please select a dealer and start time")
      return
    }

    setIsPreviewingAbsence(true)
    try {
      const timeSlots = generateTimeSlots(shiftType)
      const leaveTimeIndex = timeSlots.findIndex((slot) => slot.time === startTime)

      if (leaveTimeIndex === -1) {
        toast.error("Invalid start time")
        setIsPreviewingAbsence(false)
        return
      }

      // Create a copy of current schedule data
      const updatedScheduleData = JSON.parse(JSON.stringify(scheduleData))

      // Mark dealer as BREAK from the specified time onwards
      for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
        const currentSlot = timeSlots[i].time
        if (updatedScheduleData[currentSlot]) {
          updatedScheduleData[currentSlot][dealerId] = "BREAK"
        }
      }

      // Get remaining active dealers (excluding the one leaving)
      const remainingDealers = dealers
        .filter((d) => d.id !== dealerId && originalDealerIds.includes(d.id))
        .map((d) => ({
          ...d,
          available_tables: Array.isArray(d.available_tables) ? d.available_tables : [],
        })) as Dealer[]

      if (remainingDealers.length === 0) {
        toast.error("No remaining dealers to cover the schedule")
        setIsPreviewingAbsence(false)
        return
      }

      // Generate new schedule for the remaining time slots using the normal algorithm
      const remainingTimeSlots = timeSlots.slice(leaveTimeIndex)

      // Create preferences for the partial schedule generation
      const partialPreferences = {
        firstBreakDealers: firstBreakPreferences
          .filter((p) => remainingDealers.some((d) => d.id === p.dealerId))
          .map((p) => p.dealerId),
        lastBreakDealers: lastBreakPreferences
          .filter((p) => remainingDealers.some((d) => d.id === p.dealerId))
          .map((p) => p.dealerId),
      }

      // Generate new partial schedule from the leave time onwards
      const partialScheduleData = await generateScheduleAlgorithm(
        remainingDealers,
        shiftType,
        supabase,
        partialPreferences,
      )

      // Apply the new partial schedule to the remaining time slots
      for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
        const currentSlot = timeSlots[i].time
        const partialSlotIndex = i - leaveTimeIndex
        const partialSlotTime = remainingTimeSlots[partialSlotIndex]?.time

        if (partialSlotTime && partialScheduleData[partialSlotTime]) {
          // Copy assignments from partial schedule for remaining dealers
          remainingDealers.forEach((dealer) => {
            if (partialScheduleData[partialSlotTime][dealer.id]) {
              updatedScheduleData[currentSlot][dealer.id] = partialScheduleData[partialSlotTime][dealer.id]
            }
          })
        }
      }

      setPreviewData({
        dealerId,
        startTime,
        reason,
        scheduleData: updatedScheduleData,
      })
    } catch (error: any) {
      console.error("Error generating preview:", error)
      toast.error(`Error generating preview: ${error.message}`)
      setIsPreviewingAbsence(false)
    }
  }

  const handleExtraBreak = async () => {
    const { dealerId, timeSlot, reason } = extraBreakForm
    if (!dealerId || !timeSlot || !reason) {
      toast.error("Please fill all fields")
      return
    }

    setIsPreviewingExtraBreak(true)
    try {
      const timeSlots = generateTimeSlots(shiftType)
      const dealer = dealers.find((d) => d.id === dealerId)
      if (!dealer) {
        toast.error("Dealer not found")
        setIsPreviewingExtraBreak(false)
        return
      }

      // Create a copy of current schedule data
      const updatedScheduleData = JSON.parse(JSON.stringify(scheduleData))

      // Check if dealer is already on break at this time
      const currentAssignment = updatedScheduleData[timeSlot]?.[dealerId]
      if (currentAssignment === "BREAK") {
        setExtraBreakPreviewData({
          dealerId,
          timeSlot,
          reason,
          scheduleData: updatedScheduleData,
          isValid: false,
          message: "Дилърът вече е на почивка в този слот.",
        })
        return
      }

      // Find who can cover this dealer's table
      const tableToReplace = currentAssignment
      if (!tableToReplace || tableToReplace === "-") {
        setExtraBreakPreviewData({
          dealerId,
          timeSlot,
          reason,
          scheduleData: updatedScheduleData,
          isValid: false,
          message: "Дилърът не работи на маса в този слот.",
        })
        return
      }

      // Find available dealers who can work this table
      const availableDealers = dealersToDisplayInTable.filter((d) => {
        if (d.id === dealerId) return false
        if (!d.available_tables.includes(tableToReplace)) return false
        const theirAssignment = updatedScheduleData[timeSlot]?.[d.id]
        return theirAssignment === "BREAK" || theirAssignment === "-"
      })

      if (availableDealers.length === 0) {
        setExtraBreakPreviewData({
          dealerId,
          timeSlot,
          reason,
          scheduleData: updatedScheduleData,
          isValid: false,
          message: `Няма налични дилъри, които могат да поемат маса ${tableToReplace}.`,
        })
        return
      }

      // Choose the first available dealer (could be improved with better logic)
      const coveringDealer = availableDealers[0]

      // Apply the change
      updatedScheduleData[timeSlot][dealerId] = "BREAK"
      updatedScheduleData[timeSlot][coveringDealer.id] = tableToReplace

      setExtraBreakPreviewData({
        dealerId,
        timeSlot,
        reason,
        scheduleData: updatedScheduleData,
        coveringDealer: coveringDealer.name,
        isValid: true,
        message: `${coveringDealer.name} ще поеме маса ${tableToReplace}. ${dealer.name} ще навакса почивката.`,
      })
    } catch (error: any) {
      console.error("Error generating extra break preview:", error)
      toast.error(`Error generating preview: ${error.message}`)
      setIsPreviewingExtraBreak(false)
    }
  }

  const handleDealerChange = async () => {
    const { dealer1Id, dealer2Id, timeSlot } = dealerChangeForm
    if (!dealer1Id || !dealer2Id || !timeSlot) {
      toast.error("Please fill all fields")
      return
    }

    if (dealer1Id === dealer2Id) {
      toast.error("Please select different dealers")
      return
    }

    setIsPreviewingDealerChange(true)
    try {
      const dealer1 = dealers.find((d) => d.id === dealer1Id)
      const dealer2 = dealers.find((d) => d.id === dealer2Id)
      if (!dealer1 || !dealer2) {
        toast.error("Dealers not found")
        setIsPreviewingDealerChange(false)
        return
      }

      // Create a copy of current schedule data
      const updatedScheduleData = JSON.parse(JSON.stringify(scheduleData))

      const dealer1Assignment = updatedScheduleData[timeSlot]?.[dealer1Id]
      const dealer2Assignment = updatedScheduleData[timeSlot]?.[dealer2Id]

      const warnings: string[] = []
      let isValid = true
      let message = ""

      // Check if both dealers are working (not on break)
      if (dealer1Assignment === "BREAK") {
        warnings.push(`${dealer1.name} е на почивка в този слот`)
        isValid = false
      }
      if (dealer2Assignment === "BREAK") {
        warnings.push(`${dealer2.name} е на почивка в този слот`)
        isValid = false
      }

      if (dealer1Assignment === "-" || dealer2Assignment === "-") {
        warnings.push("Един от дилърите не работи в този слот")
        isValid = false
      }

      // Check if dealers can work each other's tables
      if (isValid) {
        if (!dealer1.available_tables.includes(dealer2Assignment)) {
          warnings.push(`${dealer1.name} не може да работи на маса ${dealer2Assignment}`)
          isValid = false
        }
        if (!dealer2.available_tables.includes(dealer1Assignment)) {
          warnings.push(`${dealer2.name} не може да работи на маса ${dealer1Assignment}`)
          isValid = false
        }
      }

      if (isValid) {
        // Apply the swap
        updatedScheduleData[timeSlot][dealer1Id] = dealer2Assignment
        updatedScheduleData[timeSlot][dealer2Id] = dealer1Assignment
        message = `Успешна смяна: ${dealer1.name} ще работи на ${dealer2Assignment}, ${dealer2.name} ще работи на ${dealer1Assignment}`
      } else {
        message = "Смяната не е възможна поради следните проблеми:"
      }

      setDealerChangePreviewData({
        dealer1Id,
        dealer2Id,
        timeSlot,
        scheduleData: updatedScheduleData,
        isValid,
        message,
        warnings,
      })
    } catch (error: any) {
      console.error("Error generating dealer change preview:", error)
      toast.error(`Error generating preview: ${error.message}`)
      setIsPreviewingDealerChange(false)
    }
  }

  const confirmAbsence = () => {
    if (!previewData) return
    setAbsentDealers([
      ...absentDealers,
      {
        dealerId: previewData.dealerId,
        startTime: previewData.startTime,
        reason: previewData.reason,
      },
    ])
    setScheduleData(previewData.scheduleData) // Прилагаме промените от handleDealerLeaving
    setAbsenceForm({ dealerId: "", startTime: "", reason: "sick" })
    setPreviewData(null)
    setIsPreviewingAbsence(false)
    toast.success("Dealer marked as absent and schedule updated")
  }

  const confirmExtraBreak = () => {
    if (!extraBreakPreviewData || !extraBreakPreviewData.isValid) return
    setScheduleData(extraBreakPreviewData.scheduleData)
    setExtraBreakForm({ dealerId: "", timeSlot: "", reason: "" })
    setExtraBreakPreviewData(null)
    setIsPreviewingExtraBreak(false)
    toast.success("Extra break applied successfully")
  }

  const confirmDealerChange = () => {
    if (!dealerChangePreviewData || !dealerChangePreviewData.isValid) return
    setScheduleData(dealerChangePreviewData.scheduleData)
    setDealerChangeForm({ dealer1Id: "", dealer2Id: "", timeSlot: "" })
    setDealerChangePreviewData(null)
    setIsPreviewingDealerChange(false)
    toast.success("Dealer change applied successfully")
  }

  const cancelAbsence = () => {
    setPreviewData(null)
    setIsPreviewingAbsence(false)
  }

  const cancelExtraBreak = () => {
    setExtraBreakPreviewData(null)
    setIsPreviewingExtraBreak(false)
  }

  const cancelDealerChange = () => {
    setDealerChangePreviewData(null)
    setIsPreviewingDealerChange(false)
  }

  const handleRemoveAbsent = (index: number) => {
    const newAbsentDealers = [...absentDealers]
    newAbsentDealers.splice(index, 1)
    setAbsentDealers(newAbsentDealers)
    // TODO: Трябва да се ре-генерира графика или да се върне дилъра ръчно
    toast.info("Dealer removed from absent list. Schedule might need regeneration or manual adjustment.")
  }

  const runRegenerationForAll = async () => {
    if (!schedule) {
      toast.error("Schedule not loaded")
      return
    }
    setIsRegenerating(true)
    try {
      const activeDealers = dealers.filter(
        (dealer) =>
          !absentDealers.some((absent) => absent.dealerId === dealer.id) && originalDealerIds.includes(dealer.id),
      )
      if (activeDealers.length === 0) {
        toast.error("Няма активни дилъри за генериране на график")
        setIsRegenerating(false)
        return
      }

      const generatorPreferences = {
        firstBreakDealers: firstBreakPreferences.map((p) => p.dealerId),
        lastBreakDealers: lastBreakPreferences.map((p) => p.dealerId),
      }

      const newScheduleData = await generateScheduleAlgorithm(activeDealers, shiftType, supabase, generatorPreferences)

      newScheduleData._preferences = {
        firstBreakPreferences,
        lastBreakPreferences,
      }
      newScheduleData._manualAdjustments = [] // Изчистваме ръчните корекции при пълна регенерация
      setManualAdjustments([])

      const currentLocalTimeSlots = generateTimeSlots(shiftType)
      for (const absent of absentDealers) {
        const startTimeIndex = currentLocalTimeSlots.findIndex((slot) => slot.time === absent.startTime)
        if (startTimeIndex === -1) continue
        for (let i = startTimeIndex; i < currentLocalTimeSlots.length; i++) {
          const currentSlotTime = currentLocalTimeSlots[i].time
          if (!newScheduleData[currentSlotTime]) {
            newScheduleData[currentSlotTime] = {}
          }
          newScheduleData[currentSlotTime][absent.dealerId] = "BREAK"
        }
      }
      setScheduleData(newScheduleData)
      toast.success("График регенериран успешно, прилагайки всички предпочитания и отсъствия.")
    } catch (error: any) {
      console.error("Error regenerating schedule:", error)
      toast.error(`Грешка при регенериране на графика: ${error.message}`)
    } finally {
      setIsRegenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Loading schedule...</p>
      </div>
    )
  }
  if (!schedule) {
    return (
      <div className="flex justify-center items-center h-64">
        <p>Schedule not found</p>
      </div>
    )
  }

  const timeSlots = generateTimeSlots(shiftType)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Edit Schedule</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Schedule Settings</CardTitle>
          <CardDescription>Update the schedule date and shift type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Shift Type</Label>
              <RadioGroup value={shiftType} onValueChange={(value) => setShiftType(value as "day" | "night")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="day" id="day" />
                  <Label htmlFor="day">Day Shift (08:00-20:00)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="night" id="night" />
                  <Label htmlFor="night">Night Shift (20:00-08:00)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Assignments</CardTitle>
              <CardDescription>
                Edit dealer assignments. Manual break preferences are applied directly. Use actions tab to apply
                preferences and manage absences.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2 text-left">Dealer</th>
                      {timeSlots.map((slot) => (
                        <th key={slot.time} className="border p-2 text-center">
                          {slot.formattedTime}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dealersToDisplayInTable.map((dealer) => (
                      <tr key={dealer.id} className="hover:bg-muted/50">
                        <td className="border p-2 font-medium">
                          {dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name}
                        </td>
                        {timeSlots.map((slot) => {
                          const assignment = scheduleData[slot.time]?.[dealer.id] || "-"
                          return (
                            <td key={`${dealer.id}-${slot.time}`} className={getCellClass(assignment)}>
                              <Select
                                value={assignment}
                                onValueChange={(value) => handleAssignmentChange(slot.time, dealer.id, value)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select table">
                                    {assignment === "BREAK" ? "BREAK" : assignment}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="-">-</SelectItem>
                                  <SelectItem value="BREAK">BREAK</SelectItem>
                                  {tables.map((table) => (
                                    <SelectItem key={table.id} value={table.name}>
                                      {table.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {manualAdjustments.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Log of Manual Break Adjustments</h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Dealer</th>
                          <th className="p-2 text-left">Type</th>
                          <th className="p-2 text-left">Reason</th>
                          <th className="p-2 text-left">Adjusted Slot</th>
                          <th className="p-2 text-left">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualAdjustments.map((adj) => (
                          <tr key={adj.id} className="border-t">
                            <td className="p-2">{adj.dealerName}</td>
                            <td className="p-2">{adj.type === "first" ? "First Break" : "Last Break"}</td>
                            <td className="p-2">{adj.reasonLabel}</td>
                            <td className="p-2">{adj.adjustedSlotFormattedTime || "N/A"}</td>
                            <td className="p-2">{format(new Date(adj.timestamp), "Pp")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Actions</CardTitle>
              <CardDescription>
                Apply break preferences, manage absent dealers, extra breaks, and dealer changes. Changes are applied
                immediately to the current schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* First Break Section */}
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">First Break Preferences</h3>
                  <p className="text-sm text-muted-foreground">Mark dealers for first working slot break</p>
                </div>
                <div className="p-3 max-h-[200px] overflow-y-auto space-y-3">
                  {dealersToDisplayInTable.length > 0 ? (
                    dealersToDisplayInTable.map((dealer) => {
                      const preference = firstBreakPreferences.find((p) => p.dealerId === dealer.id)
                      const isChecked = !!preference
                      return (
                        <div key={dealer.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md">
                          <Checkbox
                            id={`first-break-${dealer.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) =>
                              handleFirstBreakPreferenceChange(
                                dealer.id,
                                checked === true,
                                (checked === true
                                  ? preference?.reason || "dealer_request"
                                  : preference?.reason) as FirstBreakReasonCode,
                              )
                            }
                          />
                          <Label htmlFor={`first-break-${dealer.id}`} className="flex-1 cursor-pointer">
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                          </Label>
                          {isChecked && (
                            <Select
                              value={preference.reason}
                              onValueChange={(reason) =>
                                handleFirstBreakPreferenceChange(dealer.id, true, reason as FirstBreakReasonCode)
                              }
                            >
                              <SelectTrigger className="w-[200px] h-8">
                                <SelectValue placeholder="Select reason" />
                              </SelectTrigger>
                              <SelectContent>
                                {firstBreakReasonOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found in schedule</div>
                  )}
                </div>
              </div>

              {/* Last Break Section */}
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Last Break Preferences</h3>
                  <p className="text-sm text-muted-foreground">Mark dealers for last working slot break</p>
                </div>
                <div className="p-3 max-h-[200px] overflow-y-auto space-y-3">
                  {dealersToDisplayInTable.length > 0 ? (
                    dealersToDisplayInTable.map((dealer) => {
                      const preference = lastBreakPreferences.find((p) => p.dealerId === dealer.id)
                      const isChecked = !!preference
                      return (
                        <div key={dealer.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md">
                          <Checkbox
                            id={`last-break-${dealer.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) =>
                              handleLastBreakPreferenceChange(
                                dealer.id,
                                checked === true,
                                (checked === true
                                  ? preference?.reason || "dealer_request"
                                  : preference?.reason) as LastBreakReasonCode,
                              )
                            }
                          />
                          <Label htmlFor={`last-break-${dealer.id}`} className="flex-1 cursor-pointer">
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                          </Label>
                          {isChecked && (
                            <Select
                              value={preference.reason}
                              onValueChange={(reason) =>
                                handleLastBreakPreferenceChange(dealer.id, true, reason as LastBreakReasonCode)
                              }
                            >
                              <SelectTrigger className="w-[200px] h-8">
                                <SelectValue placeholder="Select reason" />
                              </SelectTrigger>
                              <SelectContent>
                                {lastBreakReasonOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found in schedule</div>
                  )}
                </div>
              </div>

              {/* Extra Break Section */}
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Extra Break</h3>
                  <p className="text-sm text-muted-foreground">
                    Request additional break for a dealer. Another dealer will cover their table.
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="extraBreakDealer">Dealer</Label>
                      <Select
                        value={extraBreakForm.dealerId}
                        onValueChange={(value) => setExtraBreakForm({ ...extraBreakForm, dealerId: value })}
                      >
                        <SelectTrigger id="extraBreakDealer">
                          <SelectValue placeholder="Select dealer" />
                        </SelectTrigger>
                        <SelectContent>
                          {dealersCurrentlyInScheduleForAbsenceSelection.map((dealer) => (
                            <SelectItem key={dealer.id} value={dealer.id}>
                              {dealer.name} {dealer.nickname && `(${dealer.nickname})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extraBreakTime">Time Slot</Label>
                      <Select
                        value={extraBreakForm.timeSlot}
                        onValueChange={(value) => setExtraBreakForm({ ...extraBreakForm, timeSlot: value })}
                      >
                        <SelectTrigger id="extraBreakTime">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot.time} value={slot.time}>
                              {slot.formattedTime}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extraBreakReason">Reason</Label>
                      <Select
                        value={extraBreakForm.reason}
                        onValueChange={(value) => setExtraBreakForm({ ...extraBreakForm, reason: value })}
                      >
                        <SelectTrigger id="extraBreakReason">
                          <SelectValue placeholder="Select reason" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Лична нужда</SelectItem>
                          <SelectItem value="medical">Медицинска нужда</SelectItem>
                          <SelectItem value="emergency">Спешност</SelectItem>
                          <SelectItem value="other">Друго</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        onClick={handleExtraBreak}
                        disabled={!extraBreakForm.dealerId || !extraBreakForm.timeSlot || !extraBreakForm.reason}
                        className="w-full"
                      >
                        Preview Extra Break
                      </Button>
                    </div>
                  </div>
                  {isPreviewingExtraBreak && extraBreakPreviewData && (
                    <div className="mt-6 border rounded-md p-4 bg-muted/20">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        {extraBreakPreviewData.isValid ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        )}
                        Extra Break Preview
                      </h3>
                      <p className="mb-4">{extraBreakPreviewData.message}</p>
                      {extraBreakPreviewData.isValid && (
                        <div className="max-h-[300px] overflow-auto mb-4">
                          <ScheduleTableComponent
                            schedule={{ ...schedule, schedule_data: extraBreakPreviewData.scheduleData } as Schedule}
                            dealers={dealersToDisplayInTable}
                          />
                        </div>
                      )}
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={cancelExtraBreak}>
                          Cancel
                        </Button>
                        {extraBreakPreviewData.isValid && (
                          <Button onClick={confirmExtraBreak}>Confirm Extra Break</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dealer Change Section */}
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Dealer Change</h3>
                  <p className="text-sm text-muted-foreground">
                    Swap two dealers' table assignments for a specific time slot.
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="dealer1">First Dealer</Label>
                      <Select
                        value={dealerChangeForm.dealer1Id}
                        onValueChange={(value) => setDealerChangeForm({ ...dealerChangeForm, dealer1Id: value })}
                      >
                        <SelectTrigger id="dealer1">
                          <SelectValue placeholder="Select dealer" />
                        </SelectTrigger>
                        <SelectContent>
                          {dealersToDisplayInTable.map((dealer) => (
                            <SelectItem key={dealer.id} value={dealer.id}>
                              {dealer.name} {dealer.nickname && `(${dealer.nickname})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dealer2">Second Dealer</Label>
                      <Select
                        value={dealerChangeForm.dealer2Id}
                        onValueChange={(value) => setDealerChangeForm({ ...dealerChangeForm, dealer2Id: value })}
                      >
                        <SelectTrigger id="dealer2">
                          <SelectValue placeholder="Select dealer" />
                        </SelectTrigger>
                        <SelectContent>
                          {dealersToDisplayInTable
                            .filter((d) => d.id !== dealerChangeForm.dealer1Id)
                            .map((dealer) => (
                              <SelectItem key={dealer.id} value={dealer.id}>
                                {dealer.name} {dealer.nickname && `(${dealer.nickname})`}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="changeTimeSlot">Time Slot</Label>
                      <Select
                        value={dealerChangeForm.timeSlot}
                        onValueChange={(value) => setDealerChangeForm({ ...dealerChangeForm, timeSlot: value })}
                      >
                        <SelectTrigger id="changeTimeSlot">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot.time} value={slot.time}>
                              {slot.formattedTime}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        onClick={handleDealerChange}
                        disabled={
                          !dealerChangeForm.dealer1Id || !dealerChangeForm.dealer2Id || !dealerChangeForm.timeSlot
                        }
                        className="w-full"
                      >
                        Preview Dealer Change
                      </Button>
                    </div>
                  </div>
                  {isPreviewingDealerChange && dealerChangePreviewData && (
                    <div className="mt-6 border rounded-md p-4 bg-muted/20">
                      <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                        {dealerChangePreviewData.isValid ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        )}
                        Dealer Change Preview
                      </h3>
                      <p className="mb-4">{dealerChangePreviewData.message}</p>
                      {dealerChangePreviewData.warnings.length > 0 && (
                        <div className="mb-4">
                          <ul className="list-disc list-inside text-red-600 space-y-1">
                            {dealerChangePreviewData.warnings.map((warning, index) => (
                              <li key={index}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {dealerChangePreviewData.isValid && (
                        <div className="max-h-[300px] overflow-auto mb-4">
                          <ScheduleTableComponent
                            schedule={{ ...schedule, schedule_data: dealerChangePreviewData.scheduleData } as Schedule}
                            dealers={dealersToDisplayInTable}
                          />
                        </div>
                      )}
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={cancelDealerChange}>
                          Cancel
                        </Button>
                        {dealerChangePreviewData.isValid && (
                          <Button onClick={confirmDealerChange}>Confirm Dealer Change</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Absent Dealers Section */}
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Absent Dealers</h3>
                  <p className="text-sm text-muted-foreground">
                    Mark dealers as absent. Schedule will be recalculated from the specified time onwards.
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="dealer">Dealer</Label>
                      <Select
                        value={absenceForm.dealerId}
                        onValueChange={(value) => setAbsenceForm({ ...absenceForm, dealerId: value })}
                      >
                        <SelectTrigger id="dealer">
                          <SelectValue placeholder="Select dealer" />
                        </SelectTrigger>
                        <SelectContent>
                          {dealersCurrentlyInScheduleForAbsenceSelection.map((dealer) => (
                            <SelectItem key={dealer.id} value={dealer.id}>
                              {dealer.name} {dealer.nickname && `(${dealer.nickname})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startTime">Start Time</Label>
                      <Select
                        value={absenceForm.startTime}
                        onValueChange={(value) => setAbsenceForm({ ...absenceForm, startTime: value })}
                      >
                        <SelectTrigger id="startTime">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot.time} value={slot.time}>
                              {slot.formattedTime}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reason">Reason</Label>
                      <Select
                        value={absenceForm.reason}
                        onValueChange={(value) => setAbsenceForm({ ...absenceForm, reason: value as AbsenceReasonUi })}
                      >
                        <SelectTrigger id="reason">
                          <SelectValue placeholder="Select reason" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sick">Болест</SelectItem>
                          <SelectItem value="injured">Пострадал</SelectItem>
                          <SelectItem value="unauthorized">Своеволен</SelectItem>
                          <SelectItem value="voluntary">Тръгнал си доброволно</SelectItem>
                          <SelectItem value="break">Освободен за почивка</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={handleMarkAbsent}
                      disabled={!absenceForm.dealerId || !absenceForm.startTime}
                    >
                      Mark as Absent & Preview Reassignment
                    </Button>
                  </div>
                  {isPreviewingAbsence && previewData && (
                    <div className="mt-6 border rounded-md p-4 bg-muted/20">
                      <h3 className="text-lg font-medium mb-4">Preview of Schedule Changes (Absence)</h3>
                      <p className="mb-4">
                        <strong>Dealer:</strong> {dealers.find((d) => d.id === previewData.dealerId)?.name || "Unknown"}{" "}
                        will be marked as absent from{" "}
                        {timeSlots.find((t) => t.time === previewData.startTime)?.formattedTime ||
                          previewData.startTime}{" "}
                        due to {getAbsenceReasonLabel(previewData.reason)}. The schedule below shows attempted
                        reassignments.
                      </p>
                      <div className="max-h-[400px] overflow-auto mb-4">
                        <ScheduleTableComponent
                          schedule={{ ...schedule, schedule_data: previewData.scheduleData } as Schedule}
                          dealers={dealersToDisplayInTable}
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" onClick={cancelAbsence}>
                          Cancel
                        </Button>
                        <Button onClick={confirmAbsence}>Confirm Absence & Apply Changes</Button>
                      </div>
                    </div>
                  )}
                  {absentDealers.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-2">Absent Dealers List</h3>
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-2 text-left">Dealer</th>
                              <th className="p-2 text-left">From Time</th>
                              <th className="p-2 text-left">Reason</th>
                              <th className="p-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {absentDealers.map((absent, index) => {
                              const dealer = dealers.find((d) => d.id === absent.dealerId)
                              const timeSlot = timeSlots.find((t) => t.time === absent.startTime)
                              return (
                                <tr key={index} className="border-t">
                                  <td className="p-2">
                                    {dealer
                                      ? dealer.nickname
                                        ? `${dealer.name} - ${dealer.nickname}`
                                        : dealer.name
                                      : "Unknown"}
                                  </td>
                                  <td className="p-2">{timeSlot ? timeSlot.formattedTime : absent.startTime}</td>
                                  <td className="p-2">{getAbsenceReasonLabel(absent.reason as AbsenceReasonUi)}</td>
                                  <td className="p-2 text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveAbsent(index)}
                                      className="h-8 px-2 text-destructive hover:text-destructive"
                                    >
                                      Remove
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <div className="flex justify-end space-x-2 mt-6">
        <Button variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSaveClick} disabled={isSubmitting || isRegenerating}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
