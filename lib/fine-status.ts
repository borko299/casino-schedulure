import type { FineStatusInfo } from "./types"

export const FINE_STATUS: FineStatusInfo[] = [
  {
    value: "pending",
    label: "Чака одобрение",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: "Clock",
  },
  {
    value: "approved",
    label: "Одобрена",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: "Check",
  },
  {
    value: "rejected",
    label: "Отхвърлена",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: "X",
  },
  {
    value: "paid",
    label: "Платена",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: "CreditCard",
  },
]

export const getFineStatusInfo = (status: string): FineStatusInfo => {
  return FINE_STATUS.find((s) => s.value === status) || FINE_STATUS[0]
}
