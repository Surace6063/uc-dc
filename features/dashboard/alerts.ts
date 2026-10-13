// Shape of a management alert, shared by the alerts service (server) and
// the alerts panel. Kept outside services/ so UI code never imports
// server-only modules for a type or a constant.

export type AlertSeverity = "high" | "medium" | "low"

export type ManagementAlert = {
  id: string
  severity: AlertSeverity
  category: "Attendance" | "Examinations" | "Faculty" | "Data quality" | "Setup"
  title: string
  description: string
  count?: number
  // The date the alert hinges on (the oldest item, a missed deadline).
  date?: { label: string; value: Date }
  href: string
}

// Alerts the brief asks for but the system can't raise: it holds no
// records for them.
export const NOT_MONITORED = ["QAA/SSR evidence", "Quality-improvement actions", "Budget overruns"] as const

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 }
