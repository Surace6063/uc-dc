"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { LogInIcon, LogOutIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { selfCheckAction } from "@/features/attendance/actions"

// Check-in / check-out with the server's clock.
export function SelfCheckIn({ checkedIn, checkedOut }: { checkedIn: boolean; checkedOut: boolean }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const direction = checkedIn ? "out" : "in"
  if (checkedOut) return <p className="text-sm text-muted-foreground">You have checked in and out today.</p>
  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true)
        const result = await selfCheckAction(direction)
        setPending(false)
        toast.add(
          result.ok
            ? { title: `Checked ${direction} at ${result.data.time}`, type: "success" }
            : { title: `Couldn't check ${direction}`, description: result.error, type: "error" }
        )
        router.refresh()
      }}
    >
      {pending ? <Spinner /> : direction === "in" ? <LogInIcon data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />}
      Check {direction}
    </Button>
  )
}
