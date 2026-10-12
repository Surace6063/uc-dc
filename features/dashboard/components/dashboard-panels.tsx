import Link from "next/link"
import { ChevronRightIcon, CircleAlertIcon, CircleCheckIcon, ClipboardListIcon, HistoryIcon, InfoIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime, formatDay } from "@/features/exams/constants"
import { cn } from "@/lib/utils"
import { NOT_MONITORED, type AlertSeverity, type ManagementAlert } from "@/features/dashboard/alerts"
import type { ActivityEntry } from "@/services/dashboard/alerts-service"

// The dashboard's bottom row: work waiting on someone, QAA/SSR tasks and
// the latest changes recorded in the audit log.

function Panel({ title, description, icon: Icon, action, children }: { title: string; description: string; icon: LucideIcon; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

function PanelEmpty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="text-xs text-muted-foreground">{children}</p>}
    </div>
  )
}

export function PanelSkeleton() {
  return (
    <Card className="gap-4 p-5" aria-busy="true">
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 rounded-lg" />
        <div className="grid flex-1 gap-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </Card>
  )
}

const SEVERITY: Record<AlertSeverity, { label: string; icon: LucideIcon; className: string }> = {
  high: { label: "High", icon: CircleAlertIcon, className: "bg-destructive/10 text-destructive" },
  medium: { label: "Medium", icon: TriangleAlertIcon, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  low: { label: "Low", icon: InfoIcon, className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
}

export function AlertsPanel({ alerts }: { alerts: ManagementAlert[] }) {
  return (
    <Panel
      title="Management alerts"
      description="Raised from current records, for modules you can act on."
      icon={TriangleAlertIcon}
      action={alerts.length > 0 ? <Badge variant="secondary" className="tabular-nums">{alerts.length}</Badge> : undefined}
    >
      {alerts.length === 0 ? (
        <PanelEmpty icon={CircleCheckIcon} title="Nothing needs attention">Alerts appear here for overdue results, marks awaiting review, attendance shortages and incomplete records.</PanelEmpty>
      ) : (
        <ul className="-mx-2 flex max-h-112 flex-col overflow-y-auto">
          {alerts.map((a) => {
            const sev = SEVERITY[a.severity]
            return (
              <li key={a.id}>
                <Link href={a.href} className="group flex items-start gap-3 rounded-lg px-2 py-2.5 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", sev.className)} title={`${sev.label} severity`}>
                    <sev.icon className="size-3.5" aria-hidden />
                    <span className="sr-only">{sev.label} severity</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                      {a.title}
                      {a.count !== undefined && <Badge variant="secondary" className="tabular-nums">{a.count.toLocaleString()}</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{a.description}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {a.category}
                      {a.date && ` · ${a.date.label} ${formatDay(a.date.value)}`}
                    </span>
                  </span>
                  <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Not monitored (no records in the system): {NOT_MONITORED.join(", ").toLowerCase()}.</p>
    </Panel>
  )
}

// DEVELOPMENT PLACEHOLDER: there is no IQAC/QAA module yet, so there are no
// tasks to list. Replace with the module's open action items (gap,
// corrective action, responsible person, deadline, status) when it exists.
export function QaaTasksPanel() {
  return (
    <Panel
      title="Pending QAA/SSR tasks"
      description="Improvement actions and missing evidence for accreditation."
      icon={ClipboardListIcon}
      action={<Badge variant="outline" className="text-muted-foreground">Not set up</Badge>}
    >
      <PanelEmpty icon={ClipboardListIcon} title="QAA/SSR tracking isn't set up yet">
        Once the IQAC/QAA module exists, open corrective actions and evidence still to collect will be listed here with owners and deadlines.
      </PanelEmpty>
    </Panel>
  )
}

export function ActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Panel title="Recent activity" description="Latest changes recorded in the audit log." icon={HistoryIcon}>
      {entries.length === 0 ? (
        <PanelEmpty icon={HistoryIcon} title="No activity in this period" />
      ) : (
        <ol className="flex flex-col">
          {entries.map((e, i) => (
            <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
              {i < entries.length - 1 && <span aria-hidden className="absolute top-3 left-0.75 h-full w-px bg-border" />}
              <span aria-hidden className="mt-1.5 size-1.75 shrink-0 rounded-full bg-muted-foreground/50" />
              <div className="min-w-0">
                {e.href ? (
                  <Link href={e.href} className="text-sm leading-snug hover:underline">
                    {e.summary}
                  </Link>
                ) : (
                  <p className="text-sm leading-snug">{e.summary}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {e.actor?.name || e.actor?.email || "System"} · {formatDateTime(e.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
