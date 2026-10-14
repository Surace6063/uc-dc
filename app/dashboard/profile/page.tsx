import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { UserRoundIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { getPageContext } from "@/lib/authorization/page"
import { myProfileHref } from "@/services/navigation/navigation-service"

export const metadata: Metadata = { title: "My profile" }

// Sends the member to their own teacher or staff profile (those pages let
// people see themselves without list permissions).
export default async function MyProfilePage() {
  const context = await getPageContext()
  const href = await myProfileHref(context)
  if (href) redirect(href)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="My profile" breadcrumbs={[{ label: "My profile" }]} />
      <EmptyState icon={UserRoundIcon} title="No profile linked to your account" description={`You're signed in as ${context.user.email}. Ask the office to link your login to your teacher or staff profile.`} />
    </div>
  )
}
