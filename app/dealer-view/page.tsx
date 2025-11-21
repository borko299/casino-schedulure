"use client"

import { useEffect, useState } from "react"
import { getActiveSchedule, getSystemSettings } from "@/lib/data-service"
import type { Schedule, SystemSettings } from "@/lib/types"
import { DealerScheduleDisplay } from "./dealer-schedule-display"
import { Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function DealerViewPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [scheduleData, settingsData] = await Promise.all([getActiveSchedule(), getSystemSettings()])

        setSchedule(scheduleData)
        setSettings(settingsData)
      } catch (err: any) {
        console.error("Error fetching dealer view data:", err)
        setError(err.message || "Failed to load data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="ml-4 text-lg">Зареждане на график...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Грешка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!schedule || !settings) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Няма активен график</AlertTitle>
          <AlertDescription>
            В момента няма активен график. Моля, свържете се с Pit Boss за генериране на нов график.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return <DealerScheduleDisplay schedule={schedule} settings={settings} />
}
