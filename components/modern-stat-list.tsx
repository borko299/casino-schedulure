import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText } from "lucide-react"
import type { ReactNode } from "react"

type StatItem = {
  label: string
  value: number
  subLabel?: string | null
}

type ModernStatListProps = {
  title: string
  icon: ReactNode
  data: StatItem[]
  valueFormatter?: (value: number) => string
}

const NoDataMessage = ({ message = "Няма данни за избрания период." }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
    <FileText className="w-12 h-12 mb-2 opacity-50" />
    <p>{message}</p>
  </div>
)

export function ModernStatList({ title, icon, data, valueFormatter }: ModernStatListProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader>
          <div className="flex items-center space-x-2">
            {icon}
            <CardTitle>{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="h-[250px]">
          <NoDataMessage />
        </CardContent>
      </Card>
    )
  }

  const maxValue = Math.max(...data.map((item) => item.value))

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {data.map((item, index) => {
            const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0
            return (
              <li key={index} className="flex items-center justify-between gap-4 text-sm">
                <div className="flex-shrink-0 truncate">
                  <p className="font-semibold text-foreground truncate">{item.label}</p>
                  {item.subLabel && <p className="text-xs text-muted-foreground truncate">{item.subLabel}</p>}
                </div>
                <div className="flex items-center gap-3 w-2/5 flex-shrink">
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="font-bold text-foreground w-12 text-right">
                    {valueFormatter ? valueFormatter(item.value) : item.value.toLocaleString()}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
