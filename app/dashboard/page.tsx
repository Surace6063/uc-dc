import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { organizationTypeLabels } from "@/features/organizations/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Dashboard",
}

// Deliberately minimal: proves who is signed in, in which organisation, with
// which role and permissions. Real widgets come with the modules.
export default async function DashboardPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "dashboard.view")) return <AccessDenied />

  const { user, organization, role, permissions } = context
  const groups = Object.entries(
    Object.groupBy(permissions, (key) => key.split(".")[0])
  )

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-1 p-5">
          <p className="text-sm text-muted-foreground">Organisation</p>
          <p className="text-lg font-semibold">{organization.name}</p>
          <p className="text-sm text-muted-foreground">{organizationTypeLabels[organization.type]}</p>
        </Card>
        <Card className="gap-1 p-5">
          <p className="text-sm text-muted-foreground">Role</p>
          <p className="text-lg font-semibold">{role.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </Card>
      </div>

      <Card className="gap-4 p-5">
        <div>
          <p className="font-semibold">Permissions</p>
          <p className="text-sm text-muted-foreground">
            {permissions.length} granted by the {role.name} role in {organization.name}.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(([area, keys]) => (
            <div key={area}>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{area}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {keys?.map((key) => (
                  <Badge key={key} variant="outline" className="font-mono">
                    {key.split(".")[1]}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  )
}
