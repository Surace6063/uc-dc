import type { Metadata } from "next"
import Link from "next/link"
import { SearchIcon, UsersIcon } from "lucide-react"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { StudentAccountView } from "@/features/finance/components/student-account"
import { formatRs } from "@/features/finance/money"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { cn } from "@/lib/utils"
import { isFinanceStaff } from "@/services/finance/access"
import { financeOptions } from "@/services/finance/options-service"
import { searchStudents, studentAccount } from "@/services/finance/payment-service"

export const metadata: Metadata = { title: "Fee collection" }

const params = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  class: z.uuid().optional().catch(undefined),
  student: z.uuid().optional().catch(undefined),
})

// Find a student, see what they owe, record a payment, print the receipt.
export default async function FeeCollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getPageContext()
  if (!isFinanceStaff(context)) return <AccessDenied />
  const f = params.parse(await searchParams)
  const [hits, options] = await Promise.all([searchStudents(context, { q: f.q, classId: f.class }), financeOptions(context)])
  let account = null
  if (f.student) {
    try {
      account = await studentAccount(context, f.student)
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
    }
  }
  const keep = (studentId: string) => `?${new URLSearchParams({ ...(f.q && { q: f.q }), ...(f.class && { class: f.class }), student: studentId })}`

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Fee collection" description="Find a student, check what they owe and record their payment." breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Fee collection" }]} />
      <div className="grid items-start gap-4 xl:grid-cols-[22rem_1fr]">
        <Card className="gap-3 p-4">
          <form className="grid gap-2" role="search">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={f.q ?? ""} placeholder="Name, admission no. or phone" aria-label="Search students" className="pl-8" autoFocus={!f.student} />
            </div>
            <div className="flex gap-2">
              <NativeSelect name="class" defaultValue={f.class ?? ""} aria-label="Class" className="min-w-0 flex-1">
                <NativeSelectOption value="">Any class</NativeSelectOption>
                {options.classes.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
              </NativeSelect>
              <Button type="submit" size="sm">Search</Button>
            </div>
          </form>
          {!f.q && !f.class ? (
            <p className="text-sm text-muted-foreground">Search by name, admission number or phone, or pick a class.</p>
          ) : hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students found.</p>
          ) : (
            <ul className="grid max-h-[32rem] gap-1 overflow-y-auto">
              {hits.map((s) => (
                <li key={s.id}>
                  <Link href={keep(s.id)} className={cn("flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/50", f.student === s.id && "bg-primary/5 ring-1 ring-primary/30")}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.admissionNumber}{s.className ? ` · ${s.className}` : ""}</span>
                    </span>
                    <span className={cn("text-xs font-semibold tabular-nums whitespace-nowrap", s.balance > 0 ? "text-destructive" : "text-muted-foreground")}>{s.balance > 0 ? formatRs(s.balance) : "Clear"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {account ? (
          <StudentAccountView account={account} options={options} can={{ create: hasPermission(context, "finance.create"), adjust: hasPermission(context, "finance.adjust"), update: hasPermission(context, "finance.update"), reverse: hasPermission(context, "finance.reverse") }} />
        ) : (
          <EmptyState icon={UsersIcon} title={f.student ? "Student not found" : "Choose a student"} description="Their fees, balance and payments appear here, with the payment form." />
        )}
      </div>
    </div>
  )
}
