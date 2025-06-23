import { Spinner } from "@/components/ui/spinner"

export default function Loading() {
  return (
    <div className="flex flex-col justify-center items-center h-64 space-y-4">
      <Spinner className="h-12 w-12 text-primary" />
      <p className="text-lg text-muted-foreground">Preparing schedule generator...</p>
    </div>
  )
}
