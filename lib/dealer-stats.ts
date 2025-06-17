import { supabase } from "@/lib/supabase-singleton"
import type { DealerStats } from "@/lib/types"

export async function calculateDealerStats(dealerId: string, month: number, year: number): Promise<DealerStats> {
  try {
    // Получаваме всички графици за месеца
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0)

    const { data: schedules, error } = await supabase
      .from("schedules")
      .select("*")
      .gte("date", startDate.toISOString().split("T")[0])
      .lte("date", endDate.toISOString().split("T")[0])

    if (error) throw error

    let tablesWorked = 0
    let daysOff = 0
    let dayShifts = 0
    let nightShifts = 0
    const workedDays = new Set<string>()

    schedules?.forEach((schedule) => {
      const scheduleData = schedule.schedule_data
      let dealerWorkedThisDay = false
      let dealerHadBreakThisDay = false

      // Проверяваме всички времеви слотове за този ден
      Object.values(scheduleData).forEach((timeSlot: any) => {
        if (timeSlot[dealerId]) {
          if (timeSlot[dealerId] === "BREAK" || timeSlot[dealerId] === "ПОЧИВКА") {
            dealerHadBreakThisDay = true
          } else {
            tablesWorked++
            dealerWorkedThisDay = true
          }
        }
      })

      if (dealerWorkedThisDay) {
        workedDays.add(schedule.date)
        if (schedule.shift_type === "day") {
          dayShifts++
        } else {
          nightShifts++
        }
      }
    })

    // Изчисляваме дните почивни
    const totalDaysInMonth = endDate.getDate()
    daysOff = totalDaysInMonth - workedDays.size

    const totalShifts = dayShifts + nightShifts

    // Изчисляваме надника
    let salary = 0
    if (totalShifts <= 18) {
      salary = dayShifts * 80 + nightShifts * 100
    } else {
      salary = dayShifts * 100 + nightShifts * 120
    }

    return {
      tablesWorked,
      daysOff,
      totalShifts,
      dayShifts,
      nightShifts,
      salary,
    }
  } catch (error) {
    console.error("Error calculating dealer stats:", error)
    return {
      tablesWorked: 0,
      daysOff: 0,
      totalShifts: 0,
      dayShifts: 0,
      nightShifts: 0,
      salary: 0,
    }
  }
}
