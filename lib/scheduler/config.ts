/**
 * Конфигурация за алгоритъма за генериране на графици
 */
export const SCHEDULER_CONFIG = {
  // Минимален брой ротации преди почивка
  MIN_ROTATIONS_BEFORE_BREAK: 3,

  // Максимално допустимо средно отклонение при разпределение на почивки
  ACCEPTABLE_BREAK_DEVIATION: 1.5,

  // Минимална работа около потенциално нова почивка при преместване
  MIN_WORK_STINT_FOR_BREAK_MOVE: 2,

  // Максимален брой итерации за усъвършенстване на графика
  MAX_REFINEMENT_ITERATIONS: 10,

  // Максимален допустим спад в оценката при агресивни корекции
  ACCEPTABLE_SCORE_DROP_THRESHOLD: 20,

  // Максимален брой опити за балансиране
  MAX_BALANCE_ATTEMPTS: 5,

  // Радиус на търсене при преместване на почивки
  BREAK_SEARCH_RADIUS: 3,

  // Праг за "голяма разлика" при агресивно балансиране
  LARGE_DIFFERENCE_THRESHOLD: 2,

  // Минимален брой РАЗЛИЧНИ маси преди почивка
  MIN_TABLES_FIRST_SEGMENT: 1, // За първия работен сегмент от смяната
  MIN_TABLES_REGULAR_SEGMENT: 2, // За всички следващи работни сегменти

  // Тежести на различните нарушения
  WEIGHTS: {
    CONSECUTIVE_BREAKS: 100,
    SINGLE_ROTATION_BEFORE_BREAK: 80,
    CONSECUTIVE_TABLE_ASSIGNMENTS: 60,
    UNEVEN_BREAK_DISTRIBUTION: 40,
    WORKLOAD_IMBALANCE: 30,
  },
} as const

/**
 * Интерфейс за оценени опции
 */
export interface ScoredOption<T> {
  option: T
  score: number
  reason?: string
}

/**
 * Тип за приоритети на правилата
 */
export type RulePriority = "critical" | "high" | "medium" | "low"

/**
 * Интерфейс за правила на графика
 */
export interface ScheduleRule {
  name: string
  priority: RulePriority
  weight: number
  validate: (schedule: any, dealer: any, timeSlot: any) => boolean
  fix: (schedule: any, dealer: any, timeSlot: any) => any
}
