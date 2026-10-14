import "server-only"

import { hasPermission, type AuthContext } from "@/lib/authorization/context"
import { ForbiddenError } from "@/lib/authorization/errors"
import type { PermissionKey } from "@/lib/authorization/permissions"

// Who may do what in finance:
//   finance staff (create, update or reports)  see institution-wide finance
//   finance.create    assign fees, record payments, record income/expenses
//   finance.update    fee structures, categories, confirm pending payments
//   finance.adjust    discounts, scholarships, waivers, cancelling fees
//   finance.reverse   reverse payments, void income/expense entries
//   finance.reports   reports and CSV exports
// finance.view alone (parents, by default) is for one's own or one's
// children's fees and never opens institution-wide finance.

export type Ctx = Pick<AuthContext, "organization" | "user" | "permissions">

export const isFinanceStaff = (ctx: Pick<AuthContext, "permissions">) =>
  hasPermission(ctx, "finance.create") || hasPermission(ctx, "finance.update") || hasPermission(ctx, "finance.reports")

const MESSAGES: Record<string, string> = {
  "finance.create": "You don't have permission to record fees or payments.",
  "finance.update": "You don't have permission to change fee settings.",
  "finance.adjust": "You don't have permission to give discounts or cancel fees.",
  "finance.reverse": "You don't have permission to reverse payments or void entries.",
  "finance.reports": "You don't have permission to view finance reports.",
}

export function requireFinance(ctx: Pick<AuthContext, "permissions">, need: "staff" | PermissionKey) {
  if (need === "staff" ? !isFinanceStaff(ctx) : !hasPermission(ctx, need)) {
    throw new ForbiddenError(MESSAGES[need] ?? "You don't have access to finance.")
  }
}
