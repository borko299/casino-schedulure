import type { Dealer, CasinoTable, SchedulePreferences, FirstBreakReasonCode, LastBreakReasonCode } from "@/lib/types"

export type { Dealer, CasinoTable, SchedulePreferences, FirstBreakReasonCode, LastBreakReasonCode }

export interface DealerWithTables extends Dealer {
  available_tables_count: number
  // available_table_names: string[]; // Може да се добави, ако е нужно за оптимизации
}

export interface TimeSlotData {
  [dealerId: string]: string // table name or "BREAK"
}

export interface ScheduleData {
  [timeSlot: string]: TimeSlotData
  _preferences?: {
    firstBreakPreferences?: DealerBreakPreference[]
    lastBreakPreferences?: DealerBreakPreference[]
  }
  _manualAdjustments?: any[]
}

export interface DealerBreakPreference {
  dealerId: string
  reason: FirstBreakReasonCode | LastBreakReasonCode
  punishment?: {
    isActive: boolean
    tablesToWork: number
  }
}

export interface ScheduleParameters {
  R: number // Total rotation slots
  T: number // Total unique tables
  D: number // Total eligible dealers
  totalWorkSlots: number
  workSlotsPerDealer: number
  extraWorkSlots: number
  breakSlotsPerDealer: number
  dealersOnBreakCount: number
}

export interface DealerAssignment {
  rotations: number // Брой отработени ротации
  breaks: number // Брой взети почивки
  lastTable: string | null // Последна маса, на която е работил
  assignedTables: Set<string> // Уникални маси, на които е работил
  breakPositions: number[] // Индекси на слотовете, в които е бил в почивка
  targetRotations: number // Целеви брой ротации
  targetBreaks: number // Целеви брой почивки
  slotsSinceLastBreak: number // Брой слотове от последната почивка
  tableHistory: string[] // История на последните няколко маси
  isReturningFromBreak: boolean // Дали се връща от почивка в текущия слот

  // Punishment related fields
  isUnderPunishment?: boolean
  punishmentTablesWorked?: number
  punishmentTargetTables?: number
  hasCompletedPunishment?: boolean // To prevent re-punishing in the same shift if re-evaluated
}

export interface TimeSlot {
  time: string
  formattedTime: string
}
