import { type NextRequest } from "next/server"
import { z } from "zod"

import { ENTRY_KIND_LABELS, FEE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/features/finance/constants"
import { parseEntryFilters, parseFeeFilters, parsePaymentFilters, parseReportFilters } from "@/features/finance/filters"
import { requireMembership } from "@/lib/authorization/context"
import { withErrorHandling } from "@/lib/authorization/route"
import { csvLine } from "@/lib/csv"
import { prisma } from "@/lib/prisma"
import { audit } from "@/services/audit/audit-service"
import { requireFinance } from "@/services/finance/access"
import { listEntries } from "@/services/finance/ledger-service"
import { listPayments, listStudentFees } from "@/services/finance/payment-service"
import { currentYear, outstandingReport } from "@/services/finance/report-service"

type Params = { params: Promise<{ kind: string }> }

const KINDS = ["fees", "payments", "income", "expenses", "outstanding"] as const
const rs = (paisa: number) => (paisa / 100).toFixed(2)
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")

// GET /api/finance/export/:kind?<the page's filters> → CSV (finance.reports).
// Lists are read in pages so large exports don't load at once.
export const GET = withErrorHandling(async (request: NextRequest, { params }: Params) => {
  const ctx = await requireMembership()
  requireFinance(ctx, "finance.reports")
  const kind = z.enum(KINDS).parse((await params).kind)
  const sp = request.nextUrl.searchParams
  const lines: string[] = []
  const pages = async <T,>(fetch: (page: number) => Promise<{ total: number; rows: T[] }>, each: (row: T) => unknown[]) => {
    for (let page = 1; page <= 200; page++) {
      const { total, rows } = await fetch(page)
      rows.forEach((r) => lines.push(csvLine(each(r))))
      if (page * 100 >= total) break
    }
  }

  if (kind === "fees") {
    lines.push(csvLine(["Student", "Admission no.", "Class", "Fee", "Category", "Year", "Due date", "Amount", "Discount", "Paid", "Balance", "Status"]))
    const f = parseFeeFilters(sp)
    await pages((page) => listStudentFees(ctx, { ...f, page, pageSize: 100 }), (r) => [r.student.name, r.student.admissionNumber, r.student.className ?? "", r.title, r.category, r.year, day(r.dueDate), rs(r.amount), rs(r.discount), rs(r.paid), rs(r.balance), FEE_STATUS_LABELS[r.status]])
  } else if (kind === "payments") {
    lines.push(csvLine(["Receipt", "Date", "Student", "Admission no.", "Amount", "Method", "Reference", "Status", "Received by"]))
    const f = parsePaymentFilters(sp)
    await pages((page) => listPayments(ctx, { ...f, page, pageSize: 100 }), (r) => [r.receiptNumber, day(r.receivedOn), r.studentName, r.student.admissionNumber, rs(r.amount), PAYMENT_METHOD_LABELS[r.method], r.reference ?? "", r.status === "REVERSED" ? "Reversed" : r.verificationStatus === "PENDING" ? "Pending" : "Completed", r.receivedBy ?? ""])
  } else if (kind === "income" || kind === "expenses") {
    const entryKind = kind === "income" ? "INCOME" : "EXPENSE"
    lines.push(csvLine(["Date", "Type", "Category", "Description", kind === "income" ? "Received from" : "Paid to", "Amount", "Method", "Reference", "Status"]))
    const f = parseEntryFilters(sp)
    await pages((page) => listEntries(ctx, entryKind, { ...f, page, pageSize: 100 }), (r) => [day(r.entryDate), ENTRY_KIND_LABELS[entryKind], r.category.name, r.description, r.party ?? "", rs(r.amount), PAYMENT_METHOD_LABELS[r.method], r.reference ?? "", r.status === "VOIDED" ? "Voided" : "Active"])
  } else {
    const f = parseReportFilters(sp)
    const year = await currentYear(ctx, f.year)
    const report = await outstandingReport(ctx, { yearId: year?.id ?? null, classId: f.class })
    lines.push(csvLine(["Student", "Admission no.", "Class", "Phone", "Balance", "Overdue"]))
    report.students.forEach((s) => lines.push(csvLine([s.name, s.admissionNumber, s.className, s.phone ?? "", rs(s.balance), rs(s.overdue)])))
  }

  await audit(prisma, ctx, { action: "finance.export", entityType: "finance", summary: `Exported ${kind} (${lines.length - 1} rows)`, metadata: { kind, filters: Object.fromEntries(sp) } })
  return new Response("﻿" + lines.join(""), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
})
