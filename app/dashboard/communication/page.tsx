import type { Metadata } from "next"
import Link from "next/link"
import { MessagesSquareIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"

export const metadata: Metadata = {
  title: "Messages",
}

// Direct messaging isn't built yet (there are no conversation records), so
// this page says so instead of showing sample conversations.
export default async function CommunicationPage() {
  const context = await getPageContext()
  if (!hasPermission(context, "communication.view")) return <AccessDenied />

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Messages" breadcrumbs={[{ label: "Messages" }]} />
      <EmptyState icon={MessagesSquareIcon} title="Messaging isn't available yet" description="Direct messages between staff, students and parents are planned. For now, post a notice to share information with a class or group.">
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/notices" />}>Go to notices</Button>
      </EmptyState>
    </div>
  )
}
