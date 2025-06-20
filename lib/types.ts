export type Dealer = {
  id: string
  name: string
  nickname: string
  phone?: string
  available_tables: string[]
  created_at: string
}

export type CasinoTable = {
  id: string
  name: string
  type: string
  status: "active" | "inactive" | "service"
  created_at: string
}

export type FirstBreakReasonCode = "dealer_request" | "late_for_table" | "schedule_needs" | "other"
export type LastBreakReasonCode = "personal_commitment" | "dealer_request" | "schedule_needs" | "other"

export interface DealerBreakPreference {
  dealerId: string
  reason: FirstBreakReasonCode | LastBreakReasonCode
  // customReason?: string; // За бъдещо разширение
}

export type Schedule = {
  id: string
  date: string
  shift_type: "day" | "night"
  schedule_data: ScheduleData & {
    _preferences?: {
      firstBreakPreferences?: DealerBreakPreference[]
      lastBreakPreferences?: DealerBreakPreference[]
    }
  }
  absent_dealers?: {
    dealerId: string
    startTime: string
    reason: string
  }[]
  created_at: string
}

export type ScheduleData = {
  [timeSlot: string]: {
    [dealerId: string]: string // table name or "BREAK"
  }
}

export type TimeSlot = {
  time: string
  formattedTime: string
}

export type ShiftType = "day" | "night"

export type TableType = {
  value: string
  label: string
}

export type TableTypeEntity = {
  id: string
  value: string
  label: string
  color: string | null // Added color
  text_color: string | null // Added text_color
  created_at: string
}

export type DealerTableTypePermission = {
  id: string
  dealer_id: string
  table_type: string
  created_at: string
}

export type TableStatus = "active" | "inactive" | "service"

export type DealerStats = {
  tablesWorked: number
  daysOff: number
  totalShifts: number
  dayShifts: number
  nightShifts: number
  salary: number
}

export type DealerReport = {
  id: string
  dealer_id: string
  table_id?: string // Added for report statistics
  table_name?: string
  incident_type: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  status: "active" | "resolved" | "dismissed"
  reported_by: string
  reported_at: string
  resolved_at?: string
  resolution_notes?: string
  fine_amount?: number
  fine_reason?: string
  fine_applied?: boolean
  fine_applied_at?: string
  fine_applied_by?: string
  fine_status?: "pending" | "approved" | "rejected" | "paid"
  created_at: string
  updated_at: string
  dealer?: Dealer
  tables?: { name: string } // Added for report statistics
}

export type IncidentType = {
  value: string
  label: string
}

export type DealerFineStats = {
  totalFines: number
  totalFineAmount: number
  appliedFines: number
  appliedFineAmount: number
  pendingFines: number
  pendingFineAmount: number
}

export type FineStatus = "pending" | "approved" | "rejected" | "paid"

export type FineStatusInfo = {
  value: FineStatus
  label: string
  color: string
  icon: string
}
