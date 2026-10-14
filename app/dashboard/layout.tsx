import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { SessionProvider, type ClientSession } from "@/components/shared/session-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getPageContext } from "@/lib/authorization/page"
import { BreadcrumbProvider } from "@/components/navigation/breadcrumbs"
import { getCurrentAcademicYear, listAcademicYearOptions } from "@/services/academics/structure-service"
import { getGuardianAccountState } from "@/services/guardians/portal-service"
import { resolveNavKind } from "@/services/navigation/navigation-service"
import { listMemberships } from "@/services/organizations/organization-service"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Signed out → /login; no organisation → /onboarding; several and none
  // chosen → /organizations/select. Pages still check their own permissions.
  const context = await getPageContext()
  const [memberships, academicYear, academicYears, guardianState, navigation] = await Promise.all([
    listMemberships(context.user.id),
    getCurrentAcademicYear(context),
    listAcademicYearOptions(context),
    getGuardianAccountState(context),
    resolveNavKind(context),
  ])
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  const session: ClientSession = {
    user: {
      name: context.user.name,
      email: context.user.email,
      avatarUrl: context.user.avatarUrl,
      isPlatformAdmin: context.user.isPlatformAdmin,
    },
    organization: {
      id: context.organization.id,
      name: context.organization.name,
      type: context.organization.type,
      logoUrl: context.organization.logoUrl ?? null,
    },
    role: { name: context.role.name, slug: context.role.slug },
    permissions: context.permissions,
    memberships: memberships.map(({ organizationId, organizationName, roleName }) => ({
      organizationId,
      organizationName,
      roleName,
    })),
    academicYear: academicYear ? { id: academicYear.id, name: academicYear.name } : null,
    academicYears,
    navigation,
    guardianPortal: guardianState !== "none",
  }

  return (
    // Keyed by organisation so client state resets when switching.
    <SessionProvider key={context.organization.id} session={session}>
      <Toaster>
        <TooltipProvider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <BreadcrumbProvider>
              <AppSidebar />
              <SidebarInset className="min-w-0">
                <DashboardHeader />
                <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
              </SidebarInset>
            </BreadcrumbProvider>
          </SidebarProvider>
        </TooltipProvider>
      </Toaster>
    </SessionProvider>
  )
}
