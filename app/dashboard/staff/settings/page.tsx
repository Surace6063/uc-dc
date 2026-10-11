import type { Metadata } from "next"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DepartmentsTab,
  DesignationsTab,
  DocumentTypesTab,
  EmployeeIdTab,
} from "@/features/staff/components/settings-tabs"
import { hasPermission } from "@/lib/authorization/context"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { getStaffSettings } from "@/services/academics/structure-service"
import { getStaffConfiguration } from "@/services/staff/config-service"

export const metadata: Metadata = {
  title: "Staff settings",
}

const TABS = ["departments", "designations", "documents", "numbering"] as const

export default async function StaffSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const context = await getPageContext()
  const canManage = hasPermission(context, "staff.configure")
  if (!canManage && !hasPermission(context, "staff.view")) return <AccessDenied />

  const [config, settings] = await Promise.all([getStaffConfiguration(context), getStaffSettings(prisma, context.organization.id)])
  const requested = (await searchParams).tab
  const defaultTab = TABS.find((t) => t === requested) ?? "departments"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff settings"
        description={
          canManage
            ? "Departments, designations, document types and employee ID numbering for your staff."
            : "How staff are organised. Ask an administrator to make changes."
        }
        breadcrumbs={[{ label: "Staff", href: "/dashboard/staff" }, { label: "Settings" }]}
      />
      <Tabs defaultValue={defaultTab} className="gap-5">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="designations">Designations</TabsTrigger>
            <TabsTrigger value="documents">Document types</TabsTrigger>
            <TabsTrigger value="numbering">Employee IDs</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="departments">
          <DepartmentsTab config={config} canManage={canManage} />
        </TabsContent>
        <TabsContent value="designations">
          <DesignationsTab config={config} canManage={canManage} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentTypesTab config={config} canManage={canManage} />
        </TabsContent>
        <TabsContent value="numbering">
          <EmployeeIdTab settings={settings} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
