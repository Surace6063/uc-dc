import Link from "next/link"
import { GraduationCapIcon } from "lucide-react"

import { site } from "@/components/landing/site"

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-8 -rotate-6 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/30">
        <GraduationCapIcon className="size-4.5" />
      </span>
      <span className="font-display text-2xl leading-none tracking-tight">
        {site.name}
      </span>
    </Link>
  )
}
