"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Calendar,
  Users,
  TableIcon,
  BarChart3,
  Settings,
  AlertTriangle,
  Plus,
  DollarSign,
  BarChart,
} from "lucide-react"

const navigation = [
  { name: "Начало", href: "/", icon: BarChart3 },
  { name: "Дилъри", href: "/dealers", icon: Users },
  { name: "Маси", href: "/tables", icon: TableIcon },
  { name: "Типове маси", href: "/table-types", icon: Settings },
  { name: "Графици", href: "/schedules", icon: Calendar },
  { name: "Репорти", href: "/reports", icon: AlertTriangle },
  { name: "Глоби", href: "/fines", icon: DollarSign },
  { name: "Статистики", href: "/statistics", icon: BarChart },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900">
                График CASINO
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                      pathname === item.href
                        ? "border-blue-500 text-gray-900"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {pathname === "/reports" && (
              <Button asChild size="sm">
                <Link href="/reports/create">
                  <Plus className="h-4 w-4 mr-2" />
                  Нов репорт
                </Link>
              </Button>
            )}
            {pathname === "/schedules" && (
              <Button asChild size="sm">
                <Link href="/schedules/generate">
                  <Plus className="h-4 w-4 mr-2" />
                  Генерирай график
                </Link>
              </Button>
            )}
            {pathname === "/dealers" && (
              <Button asChild size="sm">
                <Link href="/dealers/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Добави дилър
                </Link>
              </Button>
            )}
            {pathname === "/tables" && (
              <Button asChild size="sm">
                <Link href="/tables/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Добави маса
                </Link>
              </Button>
            )}
            {pathname === "/table-types" && (
              <Button asChild size="sm">
                <Link href="/table-types/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Добави тип
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
