import type { Dealer } from "@/lib/types"

export type ShiftType = "day" | "night"

export interface TimeSlot {
  time: string
  formattedTime: string
}

export interface SchedulePreferences {
  firstBreakDealers?: string[]
  lastBreakDealers?: string[]
}

// Променен DealerAssignment, за да поддържа новата логика
export interface DealerAssignment {
  rotations: number
  breaks: number
  lastTable: string | null // Може да е null в началото
  assignedTables: Set<string>
  breakPositions: number[]
  targetRotations: number
  targetBreaks: number

  // Нови полета за верижната ротация
  slotsSinceLastBreak: number // Брояч на слотове от последната почивка
  tableHistory: string[] // История на последните N маси
  isReturningFromBreak: boolean // Дали дилърът се връща от почивка в текущия слот
}

export interface ScheduleData {
  [timeSlot: string]: {
    [dealerId: string]: string // име на маса или "BREAK"
  }
}

export interface ScheduleParameters {
  R: number // Брой ротации (24)
  T: number // Брой маси
  D: number // Брой дилъри
  totalWorkSlots: number
  workSlotsPerDealer: number
  extraWorkSlots: number
  breakSlotsPerDealer: number
  dealersOnBreakCount: number // Брой дилъри в почивка във всеки един момент
}

export interface DealerWithTables extends Dealer {
  available_tables: string[]
}

export interface AbsenceInfo {
  dealerId: string
  startTime: string
  reason: string
}
