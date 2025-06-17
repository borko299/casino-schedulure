"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Phone, Calendar, DollarSign, Clock } from "lucide-react"
import { calculateDealerStats } from "@/lib/dealer-stats"
import type { Dealer, DealerStats } from "@/lib/types"

interface DealerStatsCardProps {
  dealer: Dealer
}

export function DealerStatsCard({ dealer }: DealerStatsCardProps) {
  const [stats, setStats] = useState<DealerStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1
  const currentYear = currentDate.getFullYear()

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true)
      const dealerStats = await calculateDealerStats(dealer.id, currentMonth, currentYear)
      setStats(dealerStats)
      setIsLoading(false)
    }

    fetchStats()
  }, [dealer.id, currentMonth, currentYear])

  const handleCall = () => {
    if (dealer.phone) {
      window.open(`tel:${dealer.phone}`, "_self")
    }
  }

  const getMonthName = (month: number) => {
    const months = [
      "Януари",
      "Февруари",
      "Март",
      "Април",
      "Май",
      "Юни",
      "Юли",
      "Август",
      "Септември",
      "Октомври",
      "Ноември",
      "Декември",
    ]
    return months[month - 1]
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              {dealer.name}
              {dealer.nickname && <Badge variant="secondary">({dealer.nickname})</Badge>}
            </CardTitle>
            <CardDescription>
              Статистика за {getMonthName(currentMonth)} {currentYear}
            </CardDescription>
          </div>
          {dealer.phone && (
            <Button size="sm" variant="outline" onClick={handleCall} className="flex items-center gap-1">
              <Phone className="h-4 w-4" />
              Обади се
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">
            <p className="text-muted-foreground">Зареждане на статистика...</p>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Clock className="h-4 w-4 mr-1 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats.tablesWorked}</p>
              <p className="text-xs text-muted-foreground">Маси карани</p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Calendar className="h-4 w-4 mr-1 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.daysOff}</p>
              <p className="text-xs text-muted-foreground">Дни почивни</p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Badge variant="outline" className="text-xs">
                  {stats.totalShifts} смени
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Дневни: {stats.dayShifts} | Нощни: {stats.nightShifts}
              </p>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <DollarSign className="h-4 w-4 mr-1 text-yellow-500" />
              </div>
              <p className="text-2xl font-bold text-yellow-600">{stats.salary} лв</p>
              <p className="text-xs text-muted-foreground">
                {stats.totalShifts > 18 ? "Повишен надник" : "Базов надник"}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground">Няма данни за този месец</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
