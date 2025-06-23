"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { format } from "date-fns"
import { toast } from "sonner"
import { generateSchedule } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Search, CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Dealer, DealerBreakPreference } from "@/lib/types" // Added DealerBreakPreference
import { supabase } from "@/lib/supabase-singleton"
import { Spinner } from "@/components/ui/spinner" // Import Spinner

export default function GenerateSchedulePage() {
  const router = useRouter()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [selectedDealers, setSelectedDealers] = useState<string[]>([])
  const [firstBreakPreferences, setFirstBreakPreferences] = useState<DealerBreakPreference[]>([])
  const [lastBreakPreferences, setLastBreakPreferences] = useState<DealerBreakPreference[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [date, setDate] = useState<Date>(new Date())
  const [shiftType, setShiftType] = useState<"day" | "night">("day")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("dealers")
  const [calendarOpen, setCalendarOpen] = useState(false)

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const { data, error } = await supabase.from("dealers").select("*").order("name")

        if (error) throw error

        setDealers(data || [])
      } catch (error: any) {
        console.error("Error fetching dealers:", error)
        toast.error(`Error fetching dealers: ${error.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDealers()
  }, [])

  const filteredDealers = dealers.filter(
    (dealer) =>
      dealer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dealer.nickname && dealer.nickname.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const handleSelectAll = () => {
    if (selectedDealers.length === filteredDealers.length) {
      setSelectedDealers([])
    } else {
      setSelectedDealers(filteredDealers.map((dealer) => dealer.id))
    }
  }

  const handleDealerSelect = (dealerId: string, checked: boolean) => {
    if (checked) {
      setSelectedDealers([...selectedDealers, dealerId])
    } else {
      setSelectedDealers(selectedDealers.filter((id) => id !== dealerId))
      setFirstBreakPreferences(firstBreakPreferences.filter((pref) => pref.dealerId !== dealerId))
      setLastBreakPreferences(lastBreakPreferences.filter((pref) => pref.dealerId !== dealerId))
    }
  }

  const handleFirstBreakPreferenceChange = (dealerId: string, checked: boolean) => {
    if (checked) {
      // Add with default reason, can be refined later if reasons are added here
      setFirstBreakPreferences([...firstBreakPreferences, { dealerId, reason: "dealer_request" }])
      setLastBreakPreferences(lastBreakPreferences.filter((pref) => pref.dealerId !== dealerId))
    } else {
      setFirstBreakPreferences(firstBreakPreferences.filter((pref) => pref.dealerId !== dealerId))
    }
  }

  const handleLastBreakPreferenceChange = (dealerId: string, checked: boolean) => {
    if (checked) {
      setLastBreakPreferences([...lastBreakPreferences, { dealerId, reason: "dealer_request" }])
      setFirstBreakPreferences(firstBreakPreferences.filter((pref) => pref.dealerId !== dealerId))
    } else {
      setLastBreakPreferences(lastBreakPreferences.filter((pref) => pref.dealerId !== dealerId))
    }
  }

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate)
      setCalendarOpen(false)
    }
  }

  const handleGenerate = async () => {
    if (selectedDealers.length === 0) {
      toast.error("Please select at least one dealer")
      return
    }

    setIsSubmitting(true)

    try {
      const selectedDealersData = dealers.filter((dealer) => selectedDealers.includes(dealer.id))

      const scheduleData = await generateSchedule(selectedDealersData, shiftType, supabase, {
        firstBreakPreferences, // Pass full preference objects
        lastBreakPreferences,
      })

      // Store preferences within schedule_data
      scheduleData._preferences = {
        firstBreakPreferences,
        lastBreakPreferences,
      }
      scheduleData._manualAdjustments = [] // Initialize as empty for new schedules

      const { data, error } = await supabase
        .from("schedules")
        .insert([
          {
            date: format(date, "yyyy-MM-dd"),
            shift_type: shiftType,
            schedule_data: scheduleData,
          },
        ])
        .select()

      if (error) throw error

      toast.success("Schedule generated successfully")

      if (data && data.length > 0) {
        router.push(`/schedules/${data[0].id}`)
      } else {
        router.push("/schedules")
      }
    } catch (error: any) {
      console.error("Error generating schedule:", error)
      toast.error(`Error generating schedule: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <Spinner className="h-12 w-12 text-primary" />
        <p className="text-lg text-muted-foreground">Loading dealers...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Generate New Schedule</CardTitle>
          <CardDescription>
            Select date, shift type, dealers, and break preferences for the new schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(newDate) => newDate && setDate(newDate)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Shift Type</Label>
              <RadioGroup value={shiftType} onValueChange={(value) => setShiftType(value as "day" | "night")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="day" id="day" />
                  <Label htmlFor="day">Day Shift (08:00-20:00)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="night" id="night" />
                  <Label htmlFor="night">Night Shift (20:00-08:00)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search">Search Dealers</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name or nickname..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dealers">Select Dealers</TabsTrigger>
              <TabsTrigger value="firstBreak">First Break Preferences</TabsTrigger>
              <TabsTrigger value="lastBreak">Last Break Preferences</TabsTrigger>
            </TabsList>

            <TabsContent value="dealers" className="mt-4">
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedDealers.length > 0 && selectedDealers.length === filteredDealers.length}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label htmlFor="select-all" className="font-medium">
                      Select All Dealers
                    </Label>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedDealers.length} of {filteredDealers.length} selected
                  </div>
                </div>

                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {filteredDealers.length > 0 ? (
                    <div className="space-y-2">
                      {filteredDealers.map((dealer) => (
                        <div key={dealer.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                          <Checkbox
                            id={`dealer-${dealer.id}`}
                            checked={selectedDealers.includes(dealer.id)}
                            onCheckedChange={(checked) => handleDealerSelect(dealer.id, checked === true)}
                          />
                          <Label htmlFor={`dealer-${dealer.id}`} className="flex-1 cursor-pointer">
                            {dealer.name}{" "}
                            {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">No dealers found</div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="firstBreak" className="mt-4">
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Select Dealers for First Break</h3>
                  <p className="text-sm text-muted-foreground">
                    These dealers will get their break early in the shift. Punishment for lateness is applied on
                    regeneration.
                  </p>
                </div>
                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {dealers.filter((d) => selectedDealers.includes(d.id)).length > 0 ? (
                    <div className="space-y-2">
                      {dealers
                        .filter((d) => selectedDealers.includes(d.id))
                        .map((dealer) => {
                          const preference = firstBreakPreferences.find((p) => p.dealerId === dealer.id)
                          const isChecked = !!preference
                          const currentReason = preference?.reason || "dealer_request"
                          const isPunishmentActive = !!(
                            currentReason === "late_for_table" && preference?.punishment?.isActive
                          )

                          return (
                            <div key={`gen-first-break-${dealer.id}`} className="p-2 hover:bg-muted/50 rounded-md">
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  id={`gen-first-break-check-${dealer.id}`}
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setFirstBreakPreferences((prev) => [
                                        ...prev,
                                        { dealerId: dealer.id, reason: "dealer_request" },
                                      ])
                                      setLastBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealer.id))
                                    } else {
                                      setFirstBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealer.id))
                                    }
                                  }}
                                />
                                <Label htmlFor={`gen-first-break-check-${dealer.id}`} className="flex-1 cursor-pointer">
                                  {dealer.name}{" "}
                                  {dealer.nickname && (
                                    <span className="text-muted-foreground">({dealer.nickname})</span>
                                  )}
                                </Label>
                                {/* Simplified reason selection for generate page, or remove if too complex here */}
                              </div>
                              {isChecked && (
                                <div className="pl-8 mt-1 space-y-1">
                                  <select
                                    value={currentReason}
                                    onChange={(e) => {
                                      const newReason = e.target.value as
                                        | "dealer_request"
                                        | "late_for_table"
                                        | "schedule_needs"
                                        | "other"
                                      setFirstBreakPreferences((prev) =>
                                        prev.map((p) =>
                                          p.dealerId === dealer.id
                                            ? {
                                                ...p,
                                                reason: newReason,
                                                punishment: newReason === "late_for_table" ? p.punishment : undefined,
                                              }
                                            : p,
                                        ),
                                      )
                                    }}
                                    className="text-xs p-1 border rounded bg-background"
                                  >
                                    <option value="dealer_request">По желание</option>
                                    <option value="late_for_table">Закъснял</option>
                                    <option value="schedule_needs">Нужди на графика</option>
                                    <option value="other">Друго</option>
                                  </select>
                                  {currentReason === "late_for_table" && (
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`gen-punish-${dealer.id}`}
                                        checked={isPunishmentActive}
                                        onCheckedChange={(punishChecked) => {
                                          setFirstBreakPreferences((prev) =>
                                            prev.map((p) =>
                                              p.dealerId === dealer.id
                                                ? {
                                                    ...p,
                                                    punishment: { isActive: punishChecked === true, tablesToWork: 4 },
                                                  }
                                                : p,
                                            ),
                                          )
                                        }}
                                      />
                                      <Label
                                        htmlFor={`gen-punish-${dealer.id}`}
                                        className="text-xs text-muted-foreground"
                                      >
                                        Накажи с 4 маси
                                      </Label>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No selected dealers to set preferences for.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="lastBreak" className="mt-4">
              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h3 className="font-medium">Select Dealers for Last Break</h3>
                  <p className="text-sm text-muted-foreground">These dealers will get their break late in the shift.</p>
                </div>
                <div className="p-3 max-h-[300px] overflow-y-auto">
                  {dealers.filter((d) => selectedDealers.includes(d.id)).length > 0 ? (
                    <div className="space-y-2">
                      {dealers
                        .filter((d) => selectedDealers.includes(d.id))
                        .map((dealer) => (
                          <div
                            key={`gen-last-break-${dealer.id}`}
                            className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md"
                          >
                            <Checkbox
                              id={`gen-last-break-check-${dealer.id}`}
                              checked={lastBreakPreferences.some((p) => p.dealerId === dealer.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setLastBreakPreferences((prev) => [
                                    ...prev,
                                    { dealerId: dealer.id, reason: "dealer_request" },
                                  ])
                                  setFirstBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealer.id))
                                } else {
                                  setLastBreakPreferences((prev) => prev.filter((p) => p.dealerId !== dealer.id))
                                }
                              }}
                            />
                            <Label htmlFor={`gen-last-break-check-${dealer.id}`} className="flex-1 cursor-pointer">
                              {dealer.name}{" "}
                              {dealer.nickname && <span className="text-muted-foreground">({dealer.nickname})</span>}
                            </Label>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      No selected dealers to set preferences for.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={isSubmitting || selectedDealers.length === 0} size="lg">
              {isSubmitting ? (
                <div className="flex items-center">
                  <Spinner className="mr-2 h-5 w-5" />
                  Generating...
                </div>
              ) : (
                "Generate Schedule"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
