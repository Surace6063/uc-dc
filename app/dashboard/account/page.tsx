import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { AccountSettings } from "@/features/account/components/account-settings"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = { title: "Account settings" }

// Personal settings for the signed-in member (organisation settings are at
// /dashboard/settings, for administrators).
export default async function AccountPage() {
  const context = await getPageContext()
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Settings" description="Your account, appearance and password." breadcrumbs={[{ label: "Settings" }]} />
      <AccountSettings
        user={{ name: context.user.name, email: context.user.email }}
        organization={context.organization.name}
        role={context.role.name}
      />
    </div>
  )
}
