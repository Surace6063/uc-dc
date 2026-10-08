import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2Icon, ChevronRightIcon, PlusIcon } from "lucide-react"

import { CenteredShell } from "@/components/layout/centered-shell"
import { organizationTypeLabels } from "@/features/organizations/schemas"
import { switchOrganization } from "@/features/organizations/actions"
import { getPageUser } from "@/lib/authorization/page"
import { listMemberships } from "@/services/organizations/organization-service"

export const metadata: Metadata = {
  title: "Choose an organisation",
}

export default async function SelectOrganizationPage() {
  const user = await getPageUser()
  const memberships = await listMemberships(user.id)
  if (memberships.length === 0) redirect(user.isPlatformAdmin ? "/platform" : "/onboarding")

  return (
    <CenteredShell user={user}>
      <h1 className="text-2xl font-semibold tracking-tight">Choose an organisation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You belong to {memberships.length} organisations. Pick the one to work in;
        you can switch any time.
      </p>

      <ul className="mt-8 space-y-3">
        {memberships.map((m) => (
          <li key={m.organizationId}>
            {/* The server re-checks membership before switching. */}
            <form action={switchOrganization}>
              <input type="hidden" name="organizationId" value={m.organizationId} />
              <button
                type="submit"
                className="group flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.organizationName}</span>
                  <span className="block text-sm text-muted-foreground">
                    {organizationTypeLabels[m.organizationType]} · {m.roleName}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </form>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        <Link href="/onboarding" className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
          <PlusIcon className="size-4" />
          Create a new organisation
        </Link>
        {user.isPlatformAdmin && (
          <Link href="/platform" className="font-medium text-muted-foreground hover:text-foreground">
            Platform console
          </Link>
        )}
      </div>
    </CenteredShell>
  )
}
