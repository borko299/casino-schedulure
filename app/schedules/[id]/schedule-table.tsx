"use client"
import type { Dealer, Schedule, TimeSlot } from "@/lib/types"
import { generateTimeSlots } from "@/lib/utils"

interface ScheduleTableProps {
  schedule: Schedule
  dealers: Dealer[]
  isEditable?: boolean
  onAssignmentChange?: (timeSlot: string, dealerId: string, value: string) => void
}

export function ScheduleTable({ schedule, dealers, isEditable = false, onAssignmentChange }: ScheduleTableProps) {
  if (!schedule || !schedule.schedule_data) {
    return (
      <div className="p-4 border rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
        Данните за графика липсват или са непълни. Моля, опитайте да презаредите страницата.
      </div>
    )
  }

  const timeSlotsArray: TimeSlot[] = generateTimeSlots(schedule.shift_type as "day" | "night")

  const dealersInSchedule = dealers.filter((dealer) => {
    if (schedule.schedule_data && typeof schedule.schedule_data === "object") {
      return Object.values(schedule.schedule_data).some(
        (timeSlotData: any) =>
          timeSlotData && typeof timeSlotData === "object" && Object.keys(timeSlotData).includes(dealer.id),
      )
    }
    return false
  })

  if (dealersInSchedule.length === 0) {
    return (
      <div className="p-4 border rounded bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">
        В този график няма намерени дилъри. Графикът може да е празен или повреден.
      </div>
    )
  }

  const getCellClass = (assignment: string) => {
    const isBreak = assignment === "BREAK"
    let cellClass = "border p-2 text-center font-medium text-xs sm:text-sm"

    if (isBreak) {
      cellClass += " bg-yellow-100 text-yellow-800 dark:bg-yellow-700/30 dark:text-yellow-300"
    } else if (assignment.startsWith("BJ")) {
      cellClass += " bg-blue-100 text-blue-800 dark:bg-blue-700/30 dark:text-blue-300"
    } else if (assignment.startsWith("ROU")) {
      cellClass += " bg-green-100 text-green-800 dark:bg-green-700/30 dark:text-green-300"
    } else if (assignment === "-") {
      cellClass += " text-muted-foreground"
    }
    return cellClass
  }

  return (
    <div className="overflow-x-auto shadow-md rounded-lg">
      <table className="w-full border-collapse min-w-[800px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted">
            <th className="border p-2 text-left text-sm font-semibold text-muted-foreground sticky left-0 bg-muted z-20">
              Дилър
            </th>
            {timeSlotsArray.map((slot) => (
              <th
                key={slot.time}
                className="border p-2 text-center text-sm font-semibold text-muted-foreground whitespace-nowrap"
              >
                {slot.formattedTime}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dealersInSchedule.map((dealer) => {
            const dealerDisplayName = dealer.nickname ? `${dealer.name} - ${dealer.nickname}` : dealer.name
            return (
              <tr key={dealer.id} className="hover:bg-muted/50 transition-colors">
                <td className="border p-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-background hover:bg-muted/50 z-10">
                  {dealerDisplayName}
                </td>
                {timeSlotsArray.map((slot) => {
                  const assignment = schedule.schedule_data![slot.time]?.[dealer.id] || "-"
                  return (
                    <td key={`${dealer.id}-${slot.time}`} className={getCellClass(assignment)}>
                      {assignment}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
