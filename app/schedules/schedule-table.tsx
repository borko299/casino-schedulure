"use client"
import type { Dealer, Schedule, TimeSlot, TableTypeEntity, CasinoTable } from "@/lib/types" // Added CasinoTable
import type React from "react"

import { generateTimeSlots } from "@/lib/utils"
import { useMemo, useState, useEffect } from "react"
import { ScheduleStatistics } from "@/components/schedule-statistics"
import { supabase } from "@/lib/supabase-singleton"
import { toast } from "sonner"

interface ScheduleTableProps {
  schedule: Schedule
  dealers: Dealer[]
  isEditable?: boolean
  onAssignmentChange?: (timeSlot: string, dealerId: string, value: string) => void
}

// This helper function is no longer the primary way to determine type for coloring,
// but can be a fallback or used for other stats if needed.
const getTableTypePrefixFromName = (tableName: string): string => {
  if (tableName.startsWith("BJ")) return "BJ"
  if (tableName.startsWith("ROU")) return "ROU"
  const parts = tableName.split(/[\d\s-]+/)
  return parts[0].toUpperCase()
}

export function ScheduleTable({ schedule, dealers, isEditable = false, onAssignmentChange }: ScheduleTableProps) {
  const [hoveredCellDetails, setHoveredCellDetails] = useState<string | null>(null)
  const [tableTypes, setTableTypes] = useState<TableTypeEntity[]>([])
  const [casinoTables, setCasinoTables] = useState<CasinoTable[]>([]) // State for casino tables
  const [isLoadingData, setIsLoadingData] = useState(true) // Combined loading state

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true)
      try {
        const [tableTypesResponse, casinoTablesResponse] = await Promise.all([
          supabase.from("table_types").select("*"),
          supabase.from("casino_tables").select("*"),
        ])

        if (tableTypesResponse.error) throw tableTypesResponse.error
        setTableTypes(tableTypesResponse.data || [])

        if (casinoTablesResponse.error) throw casinoTablesResponse.error
        setCasinoTables(casinoTablesResponse.data || [])
      } catch (error: any) {
        toast.error("Грешка при извличане на данни за маси: " + error.message)
        setTableTypes([])
        setCasinoTables([])
      } finally {
        setIsLoadingData(false)
      }
    }
    fetchData()
  }, [])

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

  const getCellStyleAttributes = (assignment: string): { style: React.CSSProperties; className: string } => {
    const style: React.CSSProperties = {}
    let className = "border p-2 text-center font-medium text-xs sm:text-sm"

    if (assignment === "BREAK") {
      className += " bg-yellow-100 text-yellow-800 dark:bg-yellow-700/30 dark:text-yellow-300"
    } else if (assignment === "-") {
      className += " text-muted-foreground"
    } else if (!isLoadingData && tableTypes.length > 0 && casinoTables.length > 0) {
      // Find the specific casino table by its name (assignment)
      const currentCasinoTable = casinoTables.find((ct) => ct.name === assignment)

      if (currentCasinoTable) {
        // Find the type of this casino table
        const matchedTableType = tableTypes.find((tt) => tt.value === currentCasinoTable.type)

        if (matchedTableType && matchedTableType.color && matchedTableType.text_color) {
          style.backgroundColor = matchedTableType.color
          style.color = matchedTableType.text_color
        } else {
          // Fallback to default class-based coloring if no specific type/color match
          if (assignment.startsWith("BJ")) {
            className += " bg-blue-100 text-blue-800 dark:bg-blue-700/30 dark:text-blue-300"
          } else if (assignment.startsWith("ROU")) {
            className += " bg-green-100 text-green-800 dark:bg-green-700/30 dark:text-green-300"
          }
        }
      } else {
        // Fallback if the specific table name isn't found in casino_tables (e.g. old schedule data)
        if (assignment.startsWith("BJ")) {
          className += " bg-blue-100 text-blue-800 dark:bg-blue-700/30 dark:text-blue-300"
        } else if (assignment.startsWith("ROU")) {
          className += " bg-green-100 text-green-800 dark:bg-green-700/30 dark:text-green-300"
        }
      }
    } else if (isLoadingData) {
      // Still loading, use default classes
      if (assignment.startsWith("BJ")) {
        className += " bg-blue-100 text-blue-800 dark:bg-blue-700/30 dark:text-blue-300"
      } else if (assignment.startsWith("ROU")) {
        className += " bg-green-100 text-green-800 dark:bg-green-700/30 dark:text-green-300"
      }
    }
    return { style, className }
  }

  const handleCellMouseEnter = (dealerId: string, slotTime: string, currentAssignment: string) => {
    if (!schedule.schedule_data) return

    const dealer = dealers.find((d) => d.id === dealerId)
    if (!dealer) return

    const dealerDisplayName = dealer.nickname ? `${dealer.name} (${dealer.nickname})` : dealer.name
    let details = `<b>${dealerDisplayName}</b> в <b>${slotTime}</b>: ${currentAssignment}<br/>`

    const currentSlotIndex = timeSlotsArray.findIndex((s) => s.time === slotTime)

    if (currentSlotIndex > 0) {
      const prevSlotTime = timeSlotsArray[currentSlotIndex - 1].time
      const prevAssignment = schedule.schedule_data[prevSlotTime]?.[dealerId] || "-"
      details += `Предишен слот (${prevSlotTime}): ${prevAssignment}<br/>`

      if (currentAssignment !== "BREAK" && currentAssignment !== "-") {
        if (prevAssignment === "BREAK") {
          details += `<i>Идва от почивка на маса ${currentAssignment}.</i><br/>`
        } else if (prevAssignment !== "-" && prevAssignment !== currentAssignment) {
          details += `<i>Премества се от ${prevAssignment} на ${currentAssignment}.</i><br/>`
        }
      }
    } else {
      if (currentAssignment !== "BREAK" && currentAssignment !== "-") {
        details += `<i>Започва смяна на маса ${currentAssignment}.</i><br/>`
      } else if (currentAssignment === "BREAK") {
        details += `<i>Започва смяна с почивка.</i><br/>`
      }
    }

    if (currentSlotIndex < timeSlotsArray.length - 1 && currentAssignment !== "BREAK" && currentAssignment !== "-") {
      const nextSlotTime = timeSlotsArray[currentSlotIndex + 1].time
      const dealerNextAssignment = schedule.schedule_data[nextSlotTime]?.[dealerId]

      if (dealerNextAssignment === "BREAK") {
        details += `Следващ слот (${nextSlotTime}): Отива в ПОЧИВКА.<br/>`
        const tableTaker = dealersInSchedule.find(
          (d) => schedule.schedule_data![nextSlotTime]?.[d.id] === currentAssignment,
        )
        if (tableTaker && tableTaker.id !== dealerId) {
          const takerName = tableTaker.nickname ? `${tableTaker.name} (${tableTaker.nickname})` : tableTaker.name
          details += `<i>${takerName} поема маса ${currentAssignment}.</i>`
        }
      } else if (dealerNextAssignment && dealerNextAssignment !== currentAssignment) {
        details += `Следващ слот (${nextSlotTime}): Отива на ${dealerNextAssignment}.<br/>`
        const tableTaker = dealersInSchedule.find(
          (d) => schedule.schedule_data![nextSlotTime]?.[d.id] === currentAssignment,
        )
        if (tableTaker && tableTaker.id !== dealerId) {
          const takerName = tableTaker.nickname ? `${tableTaker.name} (${tableTaker.nickname})` : tableTaker.name
          details += `<i>${takerName} поема маса ${currentAssignment}.</i>`
        }
      }
    }
    setHoveredCellDetails(details)
  }

  const handleCellMouseLeave = () => {
    setHoveredCellDetails(null)
  }

  const dealerTableTypeStats = useMemo(() => {
    const stats: Record<string, { BJ: number; ROU: number; BREAK: number }> = {}

    if (!schedule.schedule_data) {
      return stats // Cannot count anything without schedule_data
    }

    dealersInSchedule.forEach((dealer) => {
      stats[dealer.id] = { BJ: 0, ROU: 0, BREAK: 0 } // Initialize specific counts
      timeSlotsArray.forEach((slot) => {
        const assignment = schedule.schedule_data![slot.time]?.[dealer.id]
        let isBJ = false
        let isROU = false

        if (assignment === "BREAK") {
          stats[dealer.id].BREAK = (stats[dealer.id].BREAK || 0) + 1
        } else if (assignment && assignment !== "-") {
          // Prioritize checking casino_tables and table_types for accurate type
          const currentCasinoTable = casinoTables.find((ct) => ct.name === assignment)
          if (currentCasinoTable) {
            const matchedTableType = tableTypes.find((tt) => tt.value === currentCasinoTable.type)
            if (matchedTableType) {
              const typeValueUpper = matchedTableType.value.toUpperCase()
              const typeLabelUpper = matchedTableType.label.toUpperCase()
              // Check for BJ/Blackjack/Блекджек
              if (
                typeValueUpper.startsWith("BJ") ||
                typeLabelUpper.includes("BLACKJACK") ||
                typeLabelUpper.includes("БЛЕКДЖЕК")
              ) {
                isBJ = true
                // Check for ROU/Roulette/Рулетка
              } else if (
                typeValueUpper.startsWith("ROU") ||
                typeLabelUpper.includes("ROULETTE") ||
                typeLabelUpper.includes("РУЛЕТКА")
              ) {
                isROU = true
              }
            } else {
              // Fallback to assignment name if table type not found for the table
              if (assignment.toUpperCase().startsWith("BJ")) isBJ = true
              else if (assignment.toUpperCase().startsWith("ROU")) isROU = true
            }
          } else {
            // Fallback to assignment name if casino table itself not found (e.g. old data)
            if (assignment.toUpperCase().startsWith("BJ")) isBJ = true
            else if (assignment.toUpperCase().startsWith("ROU")) isROU = true
          }
        }

        if (isBJ) {
          stats[dealer.id].BJ = (stats[dealer.id].BJ || 0) + 1
        } else if (isROU) {
          stats[dealer.id].ROU = (stats[dealer.id].ROU || 0) + 1
        }
        // Other table types are ignored for this specific stat display
      })
    })
    return stats
  }, [schedule.schedule_data, dealersInSchedule, timeSlotsArray, tableTypes, casinoTables])

  if (!schedule || !schedule.schedule_data) {
    return (
      <div className="p-4 border rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700">
        Данните за графика липсват или са непълни. Моля, опитайте да презаредите страницата.
      </div>
    )
  }
  if (isLoadingData && dealersInSchedule.length > 0) {
    return (
      <div className="p-4 border rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-center">
        Зареждане на данни за маси и цветове...
      </div>
    )
  }

  if (dealersInSchedule.length === 0) {
    return (
      <div className="p-4 border rounded bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700">
        В този график няма намерени дилъри. Графикът може да е празен или повреден.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto shadow-md rounded-lg">
        <table className="w-full border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted">
              <th className="border p-2 text-left text-sm font-semibold text-muted-foreground sticky left-0 bg-muted z-20 min-w-[200px]">
                Дилър
                <span className="block text-xs font-normal print:hidden">(тип маса: брой)</span>
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
              const currentStats = dealerTableTypeStats[dealer.id]
              let statsString = ""
              if (currentStats) {
                const bjCount = currentStats.BJ || 0
                const rouCount = currentStats.ROU || 0
                const breakCount = currentStats.BREAK || 0
                statsString = `BJ: ${bjCount}, ROU: ${rouCount}, Почивки: ${breakCount}`
              }

              return (
                <tr key={dealer.id} className="hover:bg-muted/50 transition-colors">
                  <td className="border p-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-background hover:bg-muted/50 z-10 min-w-[200px]">
                    {dealerDisplayName}
                    {statsString && (
                      <span className="block text-xs text-muted-foreground print:hidden">{statsString}</span>
                    )}
                  </td>
                  {timeSlotsArray.map((slot) => {
                    const assignment = schedule.schedule_data![slot.time]?.[dealer.id] || "-"
                    const { style, className } = getCellStyleAttributes(assignment)
                    return (
                      <td
                        key={`${dealer.id}-${slot.time}`}
                        className={className}
                        style={style}
                        onMouseEnter={() => handleCellMouseEnter(dealer.id, slot.formattedTime, assignment)}
                        onMouseLeave={handleCellMouseLeave}
                      >
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

      {hoveredCellDetails && (
        <div
          className="fixed bottom-4 right-4 bg-background border p-3 rounded-md shadow-lg max-w-xs text-sm z-50 print:hidden"
          style={{ pointerEvents: "none" }}
        >
          <p className="font-semibold mb-1">Детайли за ротация:</p>
          <div dangerouslySetInnerHTML={{ __html: hoveredCellDetails }} />
        </div>
      )}

      {schedule?.schedule_data && dealersInSchedule.length > 0 && timeSlotsArray.length > 0 && (
        <ScheduleStatistics
          scheduleData={schedule.schedule_data}
          dealersInSchedule={dealersInSchedule}
          timeSlotsArray={timeSlotsArray}
          scheduleDate={schedule.date}
        />
      )}
    </>
  )
}
