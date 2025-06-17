export const INCIDENT_TYPES = [
  { value: "dealing_error", label: "Грешка при раздаване" },
  { value: "procedure_violation", label: "Нарушение на процедура" },
  { value: "customer_complaint", label: "Оплакване от клиент" },
  { value: "cash_handling", label: "Грешка с пари/чипове" },
  { value: "late_arrival", label: "Закъснение" },
  { value: "early_departure", label: "Ранно напускане" },
  { value: "unprofessional_behavior", label: "Непрофесионално поведение" },
  { value: "dress_code", label: "Нарушение на дрескод" },
  { value: "equipment_damage", label: "Повреда на оборудване" },
  { value: "security_issue", label: "Проблем със сигурността" },
  { value: "other", label: "Друго" },
] as const

export const SEVERITY_LEVELS = [
  { value: "low", label: "Ниска", color: "bg-green-100 text-green-800" },
  { value: "medium", label: "Средна", color: "bg-yellow-100 text-yellow-800" },
  { value: "high", label: "Висока", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "Критична", color: "bg-red-100 text-red-800" },
] as const

export const REPORT_STATUS = [
  { value: "active", label: "Активен", color: "bg-red-100 text-red-800" },
  { value: "resolved", label: "Решен", color: "bg-green-100 text-green-800" },
  { value: "dismissed", label: "Отхвърлен", color: "bg-gray-100 text-gray-800" },
] as const
