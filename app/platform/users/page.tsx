import type { Metadata } from "next"

import { Badge } from "@/components/ui/badge"
import { AccessDenied } from "@/components/shared/access-denied"
import { getPlatformPageUser } from "@/lib/authorization/page"
import { listAllUsers } from "@/services/platform/platform-service"

export const metadata: Metadata = { title: "Users · Platform" }

export default async function PlatformUsersPage() {
  if (!(await getPlatformPageUser())) return <AccessDenied />
  const users = await listAllUsers()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 text-right font-medium">Organizations</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2.5 font-medium">
                  {user.name ?? "—"}{" "}
                  {user.platformAdmin && <Badge variant="outline">Platform admin</Badge>}
                </td>
                <td className="px-4 py-2.5">{user.email}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{user._count.memberships}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
