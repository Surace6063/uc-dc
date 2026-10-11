import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { EditStaffForm } from "@/features/staff/components/edit-staff-form"
import { staffName } from "@/features/staff/constants"
import type { UpdateStaffInput } from "@/features/staff/schemas"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { fromDate } from "@/lib/validation"
import { getStaffProfile } from "@/services/staff/staff-service"

export const metadata: Metadata = {
  title: "Edit staff member",
}

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "staff.update")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()
  const staff = await getStaffProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  if (staff.archivedAt) return <AccessDenied title="Archived staff can't be edited. Restore the profile first." />

  const sensitive = staff.sensitive
  const address = (type: "PERMANENT" | "TEMPORARY") => {
    const a = sensitive?.addresses.find((x) => x.type === type)
    return {
      province: a?.province ? String(a.province) : "", district: a?.district ?? "", municipality: a?.municipality ?? "",
      wardNumber: a?.wardNumber ? String(a.wardNumber) : "", tole: a?.tole ?? "", street: a?.street ?? "", postalCode: a?.postalCode ?? "",
    }
  }
  const permanent = address("PERMANENT")
  const temporary = address("TEMPORARY")
  const initial: UpdateStaffInput = {
    employeeId: staff.employeeId,
    personal: {
      firstName: staff.firstName, middleName: staff.middleName ?? "", lastName: staff.lastName,
      nameNepali: staff.nameNepali ?? "", dateOfBirth: fromDate(sensitive?.dateOfBirth), gender: staff.gender ?? "",
      nationality: staff.nationality ?? "",
    },
    contact: {
      email: staff.email ?? "", phone: staff.phone ?? "", alternatePhone: staff.alternatePhone ?? "",
      emergencyContactName: sensitive?.emergencyContactName ?? "", emergencyContactPhone: sensitive?.emergencyContactPhone ?? "",
      emergencyContactRelationship: sensitive?.emergencyContactRelationship ?? "",
    },
    permanentAddress: permanent,
    sameAsPermanent: JSON.stringify(permanent) === JSON.stringify(temporary),
    temporaryAddress: temporary,
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title={`Edit ${staffName(staff)}`}
        description={`Employee ID ${staff.employeeId}. Employment, qualifications and documents are changed from the profile so their history is kept.`}
        breadcrumbs={[
          { label: "Staff", href: "/dashboard/staff" },
          { label: staffName(staff), href: `/dashboard/staff/${staff.id}` },
          { label: "Edit" },
        ]}
      />
      <EditStaffForm staffId={staff.id} initial={initial} showSensitive={hasPermission(context, "staff.sensitive.view")} />
    </div>
  )
}
