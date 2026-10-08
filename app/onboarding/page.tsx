import type { Metadata } from "next"
import Link from "next/link"

import { CenteredShell } from "@/components/layout/centered-shell"
import { Card } from "@/components/ui/card"
import { CreateOrganizationForm } from "@/features/organizations/components/create-organization-form"
import { getPageUser } from "@/lib/authorization/page"
import { listMemberships } from "@/services/organizations/organization-service"

export const metadata: Metadata = {
  title: "Set up your organisation",
}

export default async function OnboardingPage() {
  const user = await getPageUser()
  const memberships = await listMemberships(user.id)

  return (
    <CenteredShell user={user}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {memberships.length ? "Create another organisation" : `Welcome, ${user.name}`}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create your school, college or institute. You&apos;ll be its owner and can
        invite staff, teachers, students and parents afterwards.
      </p>

      <Card className="mt-8 p-6">
        <CreateOrganizationForm />
      </Card>

      {memberships.length > 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/organizations/select" className="font-medium text-foreground hover:underline">
            Back to my organisations
          </Link>
        </p>
      )}
      {memberships.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Joining an existing organisation? Ask its administrator to add you.
        </p>
      )}
    </CenteredShell>
  )
}
