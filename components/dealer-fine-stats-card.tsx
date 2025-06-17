"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, DollarSign, Clock, CheckCircle, Database } from "lucide-react"
import { getDealerFineStats } from "@/lib/dealer-fine-stats"
import type { Dealer, DealerFineStats } from "@/lib/types"

interface DealerFineStatsCardProps {
  dealer: Dealer
}

export function DealerFineStatsCard({ dealer }: DealerFineStatsCardProps) {
  const [stats, setStats] = useState<DealerFineStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [finesNotEnabled, setFinesNotEnabled] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const fineStats = await getDealerFineStats(dealer.id)
        setStats(fineStats)

        // Проверяваме дали всички стойности са 0 - това може да означава че колоните не съществуват
        const allZero = Object.values(fineStats).every((value) => value === 0)
        if (allZero) {
          setFinesNotEnabled(true)
        }
      } catch (error) {
        console.error("Error fetching fine stats:", error)
        setFinesNotEnabled(true)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [dealer.id])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center py-8">
          <p>Зареждане на статистика за глоби...</p>
        </CardContent>
      </Card>
    )
  }

  if (finesNotEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Database className="h-5 w-5 mr-2 text-gray-500" />
            Глоби
          </CardTitle>
          <CardDescription>Статистика за глоби на дилъра</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <Database className="h-12 w-12 mx-auto text-gray-400 mb-2" />
            <p className="text-muted-foreground mb-2">Функционалността за глоби не е активирана</p>
            <p className="text-sm text-muted-foreground">
              Моля, изпълнете SQL скрипта за добавяне на колоните за глоби
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!stats || stats.totalFines === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
            Глоби
          </CardTitle>
          <CardDescription>Статистика за глоби на дилъра</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">Няма наложени глоби</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <DollarSign className="h-5 w-5 mr-2 text-orange-500" />
          Глоби
        </CardTitle>
        <CardDescription>Статистика за глоби на дилъра</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Total Fines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Общо глоби</span>
              <Badge variant="outline">{stats.totalFines}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Обща сума</span>
              <span className="font-semibold">{stats.totalFineAmount.toFixed(2)} лв.</span>
            </div>
          </div>

          {/* Applied Fines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground flex items-center">
                <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                Приложени
              </span>
              <Badge variant="default" className="bg-green-500">
                {stats.appliedFines}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Сума</span>
              <span className="font-semibold text-green-600">{stats.appliedFineAmount.toFixed(2)} лв.</span>
            </div>
          </div>

          {/* Pending Fines */}
          {stats.pendingFines > 0 && (
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground flex items-center">
                  <Clock className="h-4 w-4 mr-1 text-orange-500" />
                  Чакащи прилагане
                </span>
                <Badge variant="destructive">{stats.pendingFines}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Сума</span>
                <span className="font-semibold text-red-600">{stats.pendingFineAmount.toFixed(2)} лв.</span>
              </div>
            </div>
          )}
        </div>

        {stats.pendingFines > 0 && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-orange-500 mr-2" />
              <span className="text-sm text-orange-700">
                Има {stats.pendingFines} чакащи глоби на стойност {stats.pendingFineAmount.toFixed(2)} лв.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
