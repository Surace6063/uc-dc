import type { Metadata } from "next"

import { organizationTypeLabels } from "@/features/organizations/schemas"
import { AccessDenied } from "@/components/shared/access-denied"
import { getPlatformPageUser } from "@/lib/authorization/page"
import { listAllOrganizations } from "@/services/platform/platform-service"

export const metadata: Metadata = { title: "Organizations · Platform" }

export default async function PlatformOrganizationsPage() {
  if (!(await getPlatformPageUser())) return <AccessDenied />
  const organizations = await listAllOrganizations()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Slug</th>
              <th className="px-4 py-2.5 text-right font-medium">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {organizations.map((org) => (
              <tr key={org.id}>
                <td className="px-4 py-2.5 font-medium">{org.name}</td>
                <td className="px-4 py-2.5">{organizationTypeLabels[org.type]}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{org.slug}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{org._count.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
