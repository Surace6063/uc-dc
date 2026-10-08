import { AccessDenied } from "@/components/shared/access-denied"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

// Guards every page under /dashboard/events on the server.
export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  const context = await getPageContext()
  if (!hasPermission(context, "events.view")) return <AccessDenied />
  return children
}
