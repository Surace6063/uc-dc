"use client"

import { useEffect } from "react"
import { CircleAlertIcon, RotateCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Error state for the staff list, profile and forms. Server errors arrive
// here without their message (only a digest), so nothing sensitive leaks.
export default function StaffError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Empty className="rounded-xl border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load staff</EmptyTitle>
        <EmptyDescription>
          Something went wrong while loading this page. Your data hasn&apos;t changed.
          {error.digest && <span className="mt-1 block font-mono text-xs">Reference: {error.digest}</span>}
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex justify-center">
        <Button variant="outline" onClick={() => retry()}>
          <RotateCwIcon data-icon="inline-start" />
          Try again
        </Button>
      </div>
    </Empty>
  )
}
