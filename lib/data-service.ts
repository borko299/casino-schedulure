import { supabase } from "@/lib/supabase-singleton"
import type { SystemSettings, Schedule } from "@/lib/types"

export async function getSystemSettings(): Promise<SystemSettings> {
  const { data, error } = await supabase.from("system_settings").select("*").single()

  if (error) {
    console.error("Error fetching system settings:", error)
    // Return default if error or not found
    return {
      id: 1,
      dealer_view_offset_minutes: 15,
      dealer_view_lookahead_slots: 3,
      updated_at: new Date().toISOString(),
    }
  }

  return data
}

export async function updateSystemSettings(settings: Partial<SystemSettings>) {
  const { error } = await supabase.from("system_settings").update(settings).eq("id", 1)

  if (error) {
    throw error
  }
}

export async function getActiveSchedule(): Promise<Schedule | null> {
  // Fetch the schedule for today or the most recently created one
  const today = new Date().toISOString().split("T")[0]

  // Try to find schedule for today
  const { data: todaySchedule, error: todayError } = await supabase
    .from("schedules")
    .select("*")
    .eq("date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (todaySchedule) return todaySchedule

  // If no schedule for today, get the latest one
  const { data: latestSchedule, error: latestError } = await supabase
    .from("schedules")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .single()

  if (latestError) {
    console.error("Error fetching active schedule:", latestError)
    return null
  }

  return latestSchedule
}
