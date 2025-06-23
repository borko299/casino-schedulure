"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
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
import { Spinner } from "@/components/ui/spinner" // Import Spinner

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
  id: string
  dealerId: string
  dealerName: string
  type: "first" | "last"
  reason: FirstBreakReasonCode | LastBreakReasonCode
  reasonLabel: string
  timestamp: string
  rawSlotTimeKey: string
  adjustedSlotFormattedTime?: string
  isPunishmentApplied?: boolean
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
  { value: "dealer_request", label: "По желание на дилъра" },
]

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
  // const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false) // Already exists

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
    return JSON.stringify(currentPrefs) !== JSON.stringify(initialPreferences)
  }, [firstBreakPreferences, lastBreakPreferences, initialPreferences])

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

  const getBreakReasonLabel = (reason: FirstBreakReasonCode | LastBreakReasonCode, type: "first" | "last"): string => {
    const options = type === "first" ? firstBreakReasonOptions : lastBreakReasonOptions
    return options.find((opt) => opt.value === reason)?.label || String(reason)
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

  const applyManualBreak = useCallback(
    (
      dealerId: string,
      type: "first" | "last",
      reason: FirstBreakReasonCode | LastBreakReasonCode,
      isPunishmentApplied = false,
    ) => {
      const dealer = dealers.find((d) => d.id === dealerId)
      if (!dealer) return false

      const currentSlots = generateTimeSlots(shiftType)
      let targetSlotTimeKey: string | undefined = undefined
      let affectedSlotIndex: number | undefined = undefined

      const newScheduleData = JSON.parse(JSON.stringify(scheduleData))

      if (type === "first") {
        for (let i = 0; i < currentSlots.length; i++) {
          const slotTimeKey = currentSlots[i].time
          if (newScheduleData[slotTimeKey]?.[dealerId] && newScheduleData[slotTimeKey][dealerId] !== "BREAK") {
            targetSlotTimeKey = slotTimeKey
            affectedSlotIndex = i
            break
          }
        }
      } else {
        for (let i = currentSlots.length - 1; i >= 0; i--) {
          const slotTimeKey = currentSlots[i].time
          if (newScheduleData[slotTimeKey]?.[dealerId] && newScheduleData[slotTimeKey][dealerId] !== "BREAK") {
            targetSlotTimeKey = slotTimeKey
            affectedSlotIndex = i
            break
          }
        }
      }

      if (targetSlotTimeKey && affectedSlotIndex !== undefined) {
        const slotTimeToChange = currentSlots[affectedSlotIndex].time
        if (!newScheduleData[slotTimeToChange]) newScheduleData[slotTimeToChange] = {}
        newScheduleData[slotTimeToChange][dealerId] = "BREAK"
        setScheduleData(newScheduleData)

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
          rawSlotTimeKey: targetSlotTimeKey,
          adjustedSlotFormattedTime: currentSlots[affectedSlotIndex].formattedTime,
          isPunishmentApplied,
        }
        setManualAdjustments((prev) => [...prev, newAdjustment])
        toast.success(
          `${dealer.name} - ${type === "first" ? "първа" : "последна"} почивка е приложена в ${newAdjustment.adjustedSlotFormattedTime}. Графикът е обновен.`,
        )
        return true
      } else {
        toast.warn(
          `Не е намерен работен слот за ${dealer.name}, за да се приложи ${type === "first" ? "първа" : "последна"} почивка.`,
        )
        return false
      }
    },
    [dealers, scheduleData, shiftType],
  )

  const handleFirstBreakPreferenceChange = (
    dealerId: string,
    checked: boolean,
    reason: FirstBreakReasonCode,
    applyPunishment?: boolean,
  ) => {
    const dealer = dealers.find((d) => d.id === dealerId)
    if (!dealer) return

    if (checked) {
      const newPreference: DealerBreakPreference = {
        dealerId,
        reason,
      }
      if (reason === "late_for_table" && applyPunishment) {
        newPreference.punishment = { isActive: true, tablesToWork: 4 }
        toast.info(
          `${dealer.name} е маркиран за първа почивка като "Закъснял" с наказание (4 маси). Промяната ще се отрази при регенериране или запазване и презареждане на графика.`,
        )
      } else {
        applyManualBreak(dealerId, "first", reason)
      }

      setFirstBreakPreferences((prev) => {
        const existingPrefIndex = prev.findIndex((p) => p.dealerId === dealerId)
        if (existingPrefIndex !== -1) {
          const updatedPrefs = [...prev]
          updatedPrefs[existingPrefIndex] = newPreference
          return updatedPrefs
        }
        return [...prev, newPreference]
      })
      setLastBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealerId))
    } else {
      setFirstBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealerId))
      const existingPref = firstBreakPreferences.find((p) => p.dealerId === dealerId)
      if (!existingPref?.punishment?.isActive) {
        const currentSlots = generateTimeSlots(shiftType)
        let breakRevertedInSchedule = false
        let revertedSlotFormattedTime = ""
        let revertedRawSlotKey = ""

        setScheduleData((prevScheduleData) => {
          const newScheduleData = JSON.parse(JSON.stringify(prevScheduleData))
          for (let i = 0; i < currentSlots.length; i++) {
            const slotTimeKey = currentSlots[i].time
            const manualAdjustmentLog = manualAdjustments.find(
              (adj) =>
                adj.dealerId === dealerId &&
                adj.type === "first" &&
                adj.rawSlotTimeKey === slotTimeKey &&
                !adj.isPunishmentApplied,
            )
            if (newScheduleData[slotTimeKey]?.[dealerId] === "BREAK" && manualAdjustmentLog) {
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
              (adj) =>
                !(
                  adj.dealerId === dealerId &&
                  adj.type === "first" &&
                  adj.rawSlotTimeKey === revertedRawSlotKey &&
                  !adj.isPunishmentApplied
                ),
            ),
          )
          toast.info(`${dealer.name} - премахната първа почивка от ${revertedSlotFormattedTime}. Слотът е изчистен.`)
        } else {
          toast.info(
            `Премахнато предпочитание за първа почивка за ${dealer.name}. Не е намерена активна ръчно приложена почивка за премахване. Ако е било с наказание, промяната ще се отрази при регенерация.`,
          )
        }
      } else {
        toast.info(
          `Премахнато предпочитание за първа почивка (с наказание) за ${dealer.name}. Промяната ще се отрази при регенериране на графика.`,
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
          const manualAdjustmentLog = manualAdjustments.find(
            (adj) => adj.dealerId === dealerId && adj.type === "last" && adj.rawSlotTimeKey === slotTimeKey,
          )
          if (newScheduleData[slotTimeKey]?.[dealerId] === "BREAK" && manualAdjustmentLog) {
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
          `Премахнато предпочитание за последна почивка за ${dealer.name}. Не е намерена активна ръчно приложена почивка за премахване.`,
        )
      }
    }
  }

  const executeSave = async () => {
    if (!date) {
      toast.error("Please select a date")
      return
    }
    setIsSubmitting(true)

    try {
      const dataToSave: ScheduleData = { ...scheduleData }
      dataToSave._preferences = {
        firstBreakPreferences,
        lastBreakPreferences,
      }
      dataToSave._manualAdjustments = manualAdjustments

      const { error } = await supabase
        .from("schedules")
        .update({
          date: format(date, "yyyy-MM-dd"),
          shift_type: shiftType,
          schedule_data: dataToSave,
          absent_dealers: absentDealers,
        })
        .eq("id", params.id)

      if (error) throw error

      toast.success(`Schedule saved successfully`)
      setInitialPreferences({
        first: firstBreakPreferences,
        last: lastBreakPreferences,
      })
    } catch (error: any) {
      toast.error(`Error saving schedule: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveClick = () => {
    executeSave()
  }

  const [isProcessingAbsence, setIsProcessingAbsence] = useState(false)
  const handleMarkAbsent = async () => {
    const { dealerId, startTime, reason } = absenceForm
    if (!dealerId || !startTime) {
      toast.error("Please select a dealer and start time")
      return
    }

    setIsProcessingAbsence(true) // Start spinner for this specific action
    setIsPreviewingAbsence(true)
    try {
      const timeSlots = generateTimeSlots(shiftType)
      const leaveTimeIndex = timeSlots.findIndex((slot) => slot.time === startTime)

      if (leaveTimeIndex === -1) {
        toast.error("Invalid start time")
        setIsPreviewingAbsence(false)
        setIsProcessingAbsence(false)
        return
      }

      const updatedScheduleData = JSON.parse(JSON.stringify(scheduleData))

      for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
        const currentSlot = timeSlots[i].time
        if (updatedScheduleData[currentSlot]) {
          updatedScheduleData[currentSlot][dealerId] = "BREAK"
        }
      }

      const remainingDealers = dealers
        .filter((d) => d.id !== dealerId && originalDealerIds.includes(d.id))
        .map((d) => ({
          ...d,
          available_tables: Array.isArray(d.available_tables) ? d.available_tables : [],
        })) as Dealer[]

      if (remainingDealers.length === 0) {
        toast.error("No remaining dealers to cover the schedule")
        setIsPreviewingAbsence(false)
        setIsProcessingAbsence(false)
        return
      }

      const remainingTimeSlots = timeSlots.slice(leaveTimeIndex)
      const currentFirstBreakPrefs = firstBreakPreferences.filter((pref) =>
        remainingDealers.some((d) => d.id === pref.dealerId),
      )
      const currentLastBreakPrefs = lastBreakPreferences.filter((pref) =>
        remainingDealers.some((d) => d.id === pref.dealerId),
      )

      const partialScheduleData = await generateScheduleAlgorithm(remainingDealers, shiftType, supabase, {
        firstBreakPreferences: currentFirstBreakPrefs,
        lastBreakPreferences: currentLastBreakPrefs,
      })

      for (let i = leaveTimeIndex; i < timeSlots.length; i++) {
        const currentSlot = timeSlots[i].time
        const partialSlotIndex = i - leaveTimeIndex
        const partialSlotTime = remainingTimeSlots[partialSlotIndex]?.time

        if (partialSlotTime && partialScheduleData[partialSlotTime]) {
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
    } finally {
      setIsProcessingAbsence(false) // Stop spinner for this specific action
    }
  }

  const [isProcessingExtraBreak, setIsProcessingExtraBreak] = useState(false)
  const handleExtraBreak = async () => {
    const { dealerId, timeSlot, reason } = extraBreakForm
    if (!dealerId || !timeSlot || !reason) {
      toast.error("Please fill all fields")
      return
    }
    setIsProcessingExtraBreak(true)
    setIsPreviewingExtraBreak(true)
    try {
      // ... (rest of the logic remains the same)
      const dealer = dealers.find((d) => d.id === dealerId)
      if (!dealer) {
        toast.error("Dealer not found")
        setIsPreviewingExtraBreak(false)
        setIsProcessingExtraBreak(false)
        return
      }

      const updatedScheduleData = JSON.parse(JSON.stringify(scheduleData))
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
        setIsProcessingExtraBreak(false)
        return
      }

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
        setIsProcessingExtraBreak(false)
        return
      }

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
        setIsProcessingExtraBreak(false)
        return
      }

      const coveringDealer = availableDealers[0]
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
    } finally {
      setIsProcessingExtraBreak(false)
    }
  }

  const [isProcessingDealerChange, setIsProcessingDealerChange] = useState(false)
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
    setIsProcessingDealerChange(true)
    setIsPreviewingDealerChange(true)
    try {
      // ... (rest of the logic remains the same)
      const dealer1 = dealers.find((d) => d.id === dealer1Id)
      const dealer2 = dealers.find((d) => d.id === dealer2Id)
      if (!dealer1 || !dealer2) {
        toast.error("Dealers not found")
        setIsPreviewingDealerChange(false)
        setIsProcessingDealerChange(false)
        return
      }

      const updatedScheduleData = JSON.parse(JSON.stringify(scheduleData))
      const dealer1Assignment = updatedScheduleData[timeSlot]?.[dealer1Id]
      const dealer2Assignment = updatedScheduleData[timeSlot]?.[dealer2Id]
      const warnings: string[] = []
      let isValid = true
      let message = ""

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

      if (isValid) {
        if (dealer2Assignment && !dealer1.available_tables.includes(dealer2Assignment)) {
          warnings.push(`${dealer1.name} не може да работи на маса ${dealer2Assignment}`)
          isValid = false
        }
        if (dealer1Assignment && !dealer2.available_tables.includes(dealer1Assignment)) {
          warnings.push(`${dealer2.name} не може да работи на маса ${dealer1Assignment}`)
          isValid = false
        }
      }

      if (isValid) {
        updatedScheduleData[timeSlot][dealer1Id] = dealer2Assignment
        updatedScheduleData[timeSlot][dealer2Id] = dealer1Assignment
        message = `Успешна смяна: ${dealer1.name} ще работи на ${dealer2Assignment || "-"}, ${dealer2.name} ще работи на ${dealer1Assignment || "-"}`
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
    } finally {
      setIsProcessingDealerChange(false)
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
    setScheduleData(previewData.scheduleData)
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
    toast.info("Dealer removed from absent list. Schedule might need regeneration or manual adjustment.")
  }

  // const [isRegenerating, setIsRegenerating] = useState(false); // Already defined
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)

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
        firstBreakPreferences,
        lastBreakPreferences,
      }

      const newScheduleData = await generateScheduleAlgorithm(activeDealers, shiftType, supabase, generatorPreferences)

      newScheduleData._preferences = {
        firstBreakPreferences,
        lastBreakPreferences,
      }
      newScheduleData._manualAdjustments = []
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
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <Spinner className="h-12 w-12 text-primary" />
        <p className="text-lg text-muted-foreground">Loading schedule...</p>
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
        <Button
          onClick={() => setShowRegenerateConfirm(true)}
          variant="outline"
          disabled={isRegenerating || isSubmitting}
        >
          {isRegenerating ? (
            <div className="flex items-center">
              <Spinner className="mr-2 h-4 w-4" />
              Regenerating...
            </div>
          ) : (
            "Regenerate Full Schedule"
          )}
        </Button>
      </div>
      {showRegenerateConfirm && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="text-yellow-600">Confirm Regeneration</CardTitle>
            <CardDescription>
              Are you sure you want to regenerate the entire schedule? This will apply all current break preferences and
              absences, and will clear any manual table assignments.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                runRegenerationForAll()
                setShowRegenerateConfirm(false)
              }}
            >
              Yes, Regenerate
            </Button>
          </CardContent>
        </Card>
      )}
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
                Edit dealer assignments. Manual break preferences are applied directly unless a punishment is active.
                Use actions tab for advanced modifications.
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
              {(firstBreakPreferences.length > 0 || lastBreakPreferences.length > 0) && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Active Break Preferences</h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Dealer</th>
                          <th className="p-2 text-left">Break Type</th>
                          <th className="p-2 text-left">Reason</th>
                          <th className="p-2 text-left">Punishment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {firstBreakPreferences.map((pref) => {
                          const dealer = dealers.find((d) => d.id === pref.dealerId)
                          return (
                            <tr key={`first-${pref.dealerId}`} className="border-t">
                              <td className="p-2">{dealer?.name || pref.dealerId}</td>
                              <td className="p-2">First Break</td>
                              <td className="p-2">
                                {getBreakReasonLabel(pref.reason as FirstBreakReasonCode, "first")}
                              </td>
                              <td className="p-2">
                                {pref.reason === "late_for_table" && pref.punishment?.isActive
                                  ? `Да (${pref.punishment.tablesToWork} маси)`
                                  : "Не"}
                              </td>
                            </tr>
                          )
                        })}
                        {lastBreakPreferences.map((pref) => {
                          const dealer = dealers.find((d) => d.id === pref.dealerId)
                          return (
                            <tr key={`last-${pref.dealerId}`} className="border-t">
                              <td className="p-2">{dealer?.name || pref.dealerId}</td>
                              <td className="p-2">Last Break</td>
                              <td className="p-2">{getBreakReasonLabel(pref.reason as LastBreakReasonCode, "last")}</td>
                              <td className="p-2">N/A</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
                          <th className="p-2 text-left">Punishment Related</th>
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
                            <td className="p-2">{adj.isPunishmentApplied ? "Да" : "Не"}</td>
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
                Apply break preferences, manage absent dealers, extra breaks, and dealer changes. Punishments for
                lateness are applied on schedule regeneration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* First Break Section */}
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">First Break Preferences</h3>
                  <p className="text-sm text-muted-foreground">
                    Mark dealers for first working slot break. Punishment for lateness is applied on regeneration.
                  </p>
                </div>
                <div className="p-3 max-h-[200px] overflow-y-auto space-y-3">
                  {dealersToDisplayInTable.length > 0 ? (
                    dealersToDisplayInTable.map((dealer) => {
                      const preference = firstBreakPreferences.find((p) => p.dealerId === dealer.id)
                      const isChecked = !!preference
                      const currentReason = (preference?.reason as FirstBreakReasonCode) || "dealer_request"
                      const isPunishmentActive = !!(
                        currentReason === "late_for_table" && preference?.punishment?.isActive
                      )

                      return (
                        <div key={`first-break-main-${dealer.id}`} className="p-2 hover:bg-muted/50 rounded-md">
                          <div className="flex items-center space-x-3">
                            <Checkbox
                              id={`first-break-${dealer.id}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const reasonToUse =
                                  isChecked && preference
                                    ? (preference.reason as FirstBreakReasonCode)
                                    : "dealer_request"
                                handleFirstBreakPreferenceChange(
                                  dealer.id,
                                  checked === true,
                                  reasonToUse,
                                  reasonToUse === "late_for_table" ? isPunishmentActive : undefined,
                                )
                              }}
                            />
                            <Label htmlFor={`first-break-${dealer.id}`} className="flex-1 cursor-pointer">
                              {dealer.name}{" "}
                              {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                            </Label>
                            {isChecked && (
                              <Select
                                value={currentReason}
                                onValueChange={(newReason) =>
                                  handleFirstBreakPreferenceChange(
                                    dealer.id,
                                    true,
                                    newReason as FirstBreakReasonCode,
                                    newReason === "late_for_table" ? isPunishmentActive : undefined,
                                  )
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
                          {isChecked && currentReason === "late_for_table" && (
                            <div className="flex items-center space-x-3 mt-2 pl-8">
                              <Checkbox
                                id={`first-break-punish-${dealer.id}`}
                                checked={isPunishmentActive}
                                onCheckedChange={(punishChecked) =>
                                  handleFirstBreakPreferenceChange(
                                    dealer.id,
                                    true,
                                    "late_for_table",
                                    punishChecked === true,
                                  )
                                }
                              />
                              <Label
                                htmlFor={`first-break-punish-${dealer.id}`}
                                className="text-sm text-muted-foreground cursor-pointer"
                              >
                                Накажи с 4 маси (прилага се при регенерация)
                              </Label>
                            </div>
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
                        <div
                          key={`last-break-main-${dealer.id}`}
                          className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-md"
                        >
                          <Checkbox
                            id={`last-break-${dealer.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) =>
                              handleLastBreakPreferenceChange(
                                dealer.id,
                                checked === true,
                                (preference?.reason as LastBreakReasonCode) || "dealer_request",
                              )
                            }
                          />
                          <Label htmlFor={`last-break-${dealer.id}`} className="flex-1 cursor-pointer">
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                          </Label>
                          {isChecked && (
                            <Select
                              value={(preference?.reason as LastBreakReasonCode) || "dealer_request"}
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
                        disabled={
                          isProcessingExtraBreak ||
                          !extraBreakForm.dealerId ||
                          !extraBreakForm.timeSlot ||
                          !extraBreakForm.reason
                        }
                        className="w-full"
                      >
                        {isProcessingExtraBreak ? <Spinner className="mr-2 h-4 w-4" /> : null}
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
                          isProcessingDealerChange ||
                          !dealerChangeForm.dealer1Id ||
                          !dealerChangeForm.dealer2Id ||
                          !dealerChangeForm.timeSlot
                        }
                        className="w-full"
                      >
                        {isProcessingDealerChange ? <Spinner className="mr-2 h-4 w-4" /> : null}
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
                      disabled={isProcessingAbsence || !absenceForm.dealerId || !absenceForm.startTime}
                    >
                      {isProcessingAbsence ? <Spinner className="mr-2 h-4 w-4" /> : null}
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
        <Button variant="outline" onClick={() => router.back()} disabled={isSubmitting || isRegenerating}>
          Cancel
        </Button>
        <Button onClick={handleSaveClick} disabled={isSubmitting || isRegenerating}>
          {isSubmitting ? (
            <div className="flex items-center">
              <Spinner className="mr-2 h-4 w-4" />
              Saving...
            </div>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  )
}
