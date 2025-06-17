"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { bg } from "date-fns/locale" // Bulgarian locale
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DateRangePickerProps extends React.ComponentProps<typeof PopoverTrigger> {
  initialDateFrom?: Date
  initialDateTo?: Date
  onUpdate: (values: { range: DateRange; rangeCompare?: DateRange }) => void
  align?: "start" | "center" | "end"
  locale?: string
  showCompare?: boolean
}

export function DateRangePicker({
  initialDateFrom,
  initialDateTo,
  onUpdate,
  className,
  align = "start",
  locale = "en-US", // Default to en-US, will be overridden by prop
  showCompare = true,
}: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: initialDateFrom,
    to: initialDateTo,
  })
  const [compareDate, setCompareDate] = React.useState<DateRange | undefined>()
  const [isOpen, setIsOpen] = React.useState(false)

  const handleUpdate = (newDate: DateRange | undefined, newCompareDate?: DateRange | undefined) => {
    setDate(newDate)
    if (showCompare) {
      setCompareDate(newCompareDate)
    }
    if (newDate?.from && newDate?.to) {
      onUpdate({ range: newDate, rangeCompare: newCompareDate })
    } else if (newDate?.from && !newDate?.to) {
      onUpdate({ range: { from: newDate.from, to: newDate.from }, rangeCompare: newCompareDate })
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn("w-[260px] justify-start text-left font-normal", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y", { locale: bg })} - {format(date.to, "LLL dd, y", { locale: bg })}
                </>
              ) : (
                format(date.from, "LLL dd, y", { locale: bg })
              )
            ) : (
              <span>Избери период</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={(newRange) => handleUpdate(newRange, compareDate)}
            numberOfMonths={2}
            locale={bg} // Use Bulgarian locale for the calendar
          />
          {showCompare && (
            <div className="p-4 border-t">
              <p className="text-sm font-medium mb-2">Сравни с:</p>
              <Calendar
                mode="range"
                defaultMonth={compareDate?.from}
                selected={compareDate}
                onSelect={(newCompareRange) => handleUpdate(date, newCompareRange)}
                numberOfMonths={2}
                locale={bg}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
