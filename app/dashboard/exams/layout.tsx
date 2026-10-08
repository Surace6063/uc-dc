import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

// Guards every page under /dashboard/exams on the server.
export default async function ExamsLayout({ children }: { children: React.ReactNode }) {
  const context = await getPageContext()
  if (!hasPermission(context, "exams.view")) return <AccessDenied />
  return children
}
