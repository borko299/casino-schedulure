import type { DealerWithTables, ScheduleData, TimeSlot } from "../scheduler-types"
import { SCHEDULER_CONFIG, type ScoredOption } from "./config"

/**
 * Оценява колко подходяща е дадена маса за конкретен дилър в даден слот
 */
export function scoreTableAssignment(
  dealer: DealerWithTables,
  table: string,
  slotIndex: number,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): number {
  let score = 100 // Базова оценка

  const stats = dealerAssignments[dealer.id]
  const currentSlot = timeSlots[slotIndex].time

  // Наказание, ако дилърът е работил на тази маса скоро
  if (stats.lastTable === table) {
    const timeSinceLastAssignment = slotIndex - (stats.lastTableIndex || 0)
    if (timeSinceLastAssignment < 4) {
      score -= 50 // Голямо наказание за скорошна работа на същата маса
    }
  }

  // Бонус за разнообразие (ако дилърът не е работил на този тип маса)
  if (!stats.assignedTables.has(table)) {
    score += 30 // Бонус за нова маса
  }

  // Наказание за последователни назначения на една и съща маса
  if (slotIndex > 0) {
    const prevSlot = timeSlots[slotIndex - 1].time
    if (schedule[prevSlot][dealer.id] === table) {
      score -= 80 // Много голямо наказание
    }
  }

  if (slotIndex < timeSlots.length - 1) {
    const nextSlot = timeSlots[slotIndex + 1].time
    if (schedule[nextSlot] && schedule[nextSlot][dealer.id] === table) {
      score -= 80 // Много голямо наказание
    }
  }

  // Бонус за балансиране на натоварването
  const dealerRotationRatio = stats.rotations / (stats.targetRotations || 1)
  if (dealerRotationRatio < 0.8) {
    score += 20 // Бонус за дилъри с малко ротации
  } else if (dealerRotationRatio > 1.2) {
    score -= 20 // Наказание за дилъри с много ротации
  }

  // Проверка за "гореща" маса (заета от много дилъри наоколо)
  const tableHotness = calculateTableHotness(table, slotIndex, timeSlots, schedule)
  score -= tableHotness * 5

  return Math.max(0, score) // Минимум 0
}

/**
 * Изчислява колко "гореща" е масата (колко често се използва наоколо)
 */
function calculateTableHotness(
  table: string,
  slotIndex: number,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
): number {
  let hotness = 0
  const checkRadius = 2

  for (
    let i = Math.max(0, slotIndex - checkRadius);
    i <= Math.min(timeSlots.length - 1, slotIndex + checkRadius);
    i++
  ) {
    if (i === slotIndex) continue

    const slot = timeSlots[i].time
    const assignments = Object.values(schedule[slot] || {})
    if (assignments.includes(table)) {
      hotness++
    }
  }

  return hotness
}

/**
 * Избира най-добрата маса от списък с достъпни маси
 */
export function selectBestTable(
  dealer: DealerWithTables,
  availableTables: string[],
  slotIndex: number,
  timeSlots: TimeSlot[],
  schedule: ScheduleData,
  dealerAssignments: Record<string, any>,
): string | null {
  if (availableTables.length === 0) return null

  const scoredTables: ScoredOption<string>[] = availableTables.map((table) => ({
    option: table,
    score: scoreTableAssignment(dealer, table, slotIndex, timeSlots, schedule, dealerAssignments),
    reason: `Score calculation for table ${table}`,
  }))

  // Сортиране по най-висока оценка
  scoredTables.sort((a, b) => b.score - a.score)

  console.log(
    `Best table for ${dealer.name} at slot ${slotIndex}: ${scoredTables[0].option} (score: ${scoredTables[0].score})`,
  )

  return scoredTables[0].option
}

/**
 * Оценява цялостното качество на графика за даден дилър
 */
export function calculateDealerScheduleScore(
  dealer: DealerWithTables,
  schedule: ScheduleData,
  timeSlots: TimeSlot[],
  dealerAssignments: Record<string, any>,
): number {
  let score = 1000 // Базова оценка
  const stats = dealerAssignments[dealer.id]

  // Наказания за различни нарушения
  let consecutiveBreaks = 0
  let consecutiveTables = 0
  let singleRotationBeforeBreak = 0

  let consecutiveRotations = 0
  let lastWasBreak = false
  let lastTable = ""

  for (let i = 0; i < timeSlots.length; i++) {
    const slot = timeSlots[i].time
    const assignment = schedule[slot][dealer.id]

    if (assignment === "BREAK") {
      // Проверка за последователни почивки
      if (lastWasBreak) {
        consecutiveBreaks++
      }

      // Проверка за единична ротация преди почивка
      if (consecutiveRotations === 1) {
        singleRotationBeforeBreak++
      }

      consecutiveRotations = 0
      lastWasBreak = true
      lastTable = ""
    } else if (assignment && assignment !== "-") {
      // Проверка за последователни назначения на една и съща маса
      if (assignment === lastTable) {
        consecutiveTables++
      }

      consecutiveRotations++
      lastWasBreak = false
      lastTable = assignment
    }
  }

  // Прилагане на наказания
  score -= consecutiveBreaks * SCHEDULER_CONFIG.WEIGHTS.CONSECUTIVE_BREAKS
  score -= singleRotationBeforeBreak * SCHEDULER_CONFIG.WEIGHTS.SINGLE_ROTATION_BEFORE_BREAK
  score -= consecutiveTables * SCHEDULER_CONFIG.WEIGHTS.CONSECUTIVE_TABLE_ASSIGNMENTS

  // Наказание за дисбаланс в натоварването
  const rotationDiff = Math.abs(stats.rotations - stats.targetRotations)
  const breakDiff = Math.abs(stats.breaks - stats.targetBreaks)
  score -= (rotationDiff + breakDiff) * SCHEDULER_CONFIG.WEIGHTS.WORKLOAD_IMBALANCE

  // Наказание за неравномерно разпределение на почивките
  const breakDistributionScore = calculateBreakDistributionScore(stats, timeSlots.length)
  score -= ((100 - breakDistributionScore) * SCHEDULER_CONFIG.WEIGHTS.UNEVEN_BREAK_DISTRIBUTION) / 100

  return Math.max(0, score)
}

/**
 * Изчислява оценка за разпределението на почивките (0-100)
 */
function calculateBreakDistributionScore(dealerStats: any, totalSlots: number): number {
  if (!dealerStats.breakPositions || dealerStats.breakPositions.length === 0) {
    return 100 // Няма почивки, няма проблем с разпределението
  }

  const breakPositions = [...dealerStats.breakPositions].sort((a, b) => a - b)
  const targetBreaks = dealerStats.targetBreaks || breakPositions.length

  // Изчисляваме идеалния интервал
  const idealInterval = Math.floor(totalSlots / (targetBreaks + 1))
  const idealPositions: number[] = []
  for (let i = 1; i <= targetBreaks; i++) {
    idealPositions.push(Math.min(totalSlots - 1, i * idealInterval))
  }

  // Изчисляваме отклонението
  let totalDeviation = 0
  for (let i = 0; i < Math.min(breakPositions.length, idealPositions.length); i++) {
    totalDeviation += Math.abs(breakPositions[i] - idealPositions[i])
  }

  const averageDeviation = totalDeviation / targetBreaks
  const maxPossibleDeviation = totalSlots / 2 // Най-лошия случай

  // Конвертираме в оценка от 0 до 100
  const score = Math.max(0, 100 - (averageDeviation / maxPossibleDeviation) * 100)

  return score
}
