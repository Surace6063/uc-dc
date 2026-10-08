import Link from "next/link"
import { ShieldXIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

// Rendered by pages when the server-side permission check fails.
export function AccessDenied({ title = "You don't have access to this page" }: { title?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <ShieldXIcon className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask your organisation&apos;s administrator if you need access.
        </p>
      </div>
      <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  )
}
