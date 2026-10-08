import type { Metadata } from "next"

import { Card } from "@/components/ui/card"
import { AccessDenied } from "@/components/shared/access-denied"
import { getPlatformPageUser } from "@/lib/authorization/page"
import { getPlatformStats } from "@/services/platform/platform-service"

export const metadata: Metadata = { title: "Platform" }

export default async function PlatformPage() {
  // Layouts don't re-run on every navigation, so each page checks again.
  if (!(await getPlatformPageUser())) return <AccessDenied />
  const stats = await getPlatformStats()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(stats).map(([label, value]) => (
          <Card key={label} className="gap-1 p-5">
            <p className="text-sm text-muted-foreground capitalize">{label}</p>
            <p className="text-3xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
