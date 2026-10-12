"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useSession } from "@/components/shared/session-provider"
import { Pill } from "@/components/shared/status-pill"
import {
  EXAM_STATUS_LABELS,
  EXAM_STATUS_TONE,
  RESULT_STATUS_LABELS,
  RESULT_STATUS_TONE,
  SCALE_STATUS_LABELS,
  SCALE_STATUS_TONE,
  SHEET_STATUS_LABELS,
  SHEET_STATUS_TONE,
} from "@/features/exams/constants"
import type { PermissionKey } from "@/lib/authorization/permissions"
import type { ExaminationStatus, GradingScaleStatus, MarksSheetStatus, ResultStatus } from "@/lib/generated/prisma/enums"
import { cn } from "@/lib/utils"

type Item = { href: string; label: string; any: PermissionKey[]; exact?: boolean }

// Section links within Examinations. Visibility is a convenience; every
// page checks its own permission (and record scope) on the server.
const ITEMS: Item[] = [
  { href: "/dashboard/exams", label: "Examinations", any: ["exams.view"], exact: true },
  { href: "/dashboard/exams/marks", label: "Marks entry", any: ["exams.grade", "exams.marks.manage", "exams.review", "exams.approve"] },
  { href: "/dashboard/exams/review", label: "Review", any: ["exams.review", "exams.approve"] },
  { href: "/dashboard/exams/import", label: "Import marks", any: ["exams.grade", "exams.marks.manage"] },
  { href: "/dashboard/exams/analytics", label: "Analytics", any: ["results.view_all"] },
  { href: "/dashboard/exams/settings", label: "Grading & policies", any: ["exams.configure"] },
]

export function ExamsNav() {
  const pathname = usePathname()
  const { permissions } = useSession()
  const items = ITEMS.filter((item) => item.any.some((p) => permissions.includes(p)))
  if (items.length <= 1) return null
  return (
    <nav aria-label="Examination sections" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-px print:hidden">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href || /^\/dashboard\/exams\/(new|[0-9a-f-]{36})/.test(pathname) : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              active ? "border-primary font-medium text-foreground" : "border-transparent"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function ExamStatusBadge({ status, phase }: { status: ExaminationStatus; phase?: string | null }) {
  return <Pill className={EXAM_STATUS_TONE[status]}>{phase ? `${EXAM_STATUS_LABELS[status]} · ${phase}` : EXAM_STATUS_LABELS[status]}</Pill>
}

export function SheetStatusBadge({ status }: { status: MarksSheetStatus | "NOT_STARTED" }) {
  return <Pill className={SHEET_STATUS_TONE[status]}>{status === "NOT_STARTED" ? "Not started" : SHEET_STATUS_LABELS[status]}</Pill>
}

export function ResultStatusBadge({ status }: { status: ResultStatus | "NOT_TAKEN" }) {
  return <Pill className={RESULT_STATUS_TONE[status]}>{RESULT_STATUS_LABELS[status]}</Pill>
}

export function ScaleStatusBadge({ status }: { status: GradingScaleStatus }) {
  return <Pill className={SCALE_STATUS_TONE[status]}>{SCALE_STATUS_LABELS[status]}</Pill>
}
