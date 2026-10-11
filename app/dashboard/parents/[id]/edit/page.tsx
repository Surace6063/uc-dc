import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { emptyProfile } from "@/features/guardians/components/form-sections"
import { EditGuardianForm } from "@/features/guardians/components/guardian-form"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { fromDate } from "@/lib/validation"
import { getGuardianProfile } from "@/services/guardians/guardian-service"

export const metadata: Metadata = {
  title: "Edit guardian",
}

type Address = NonNullable<Awaited<ReturnType<typeof getGuardianProfile>>["sensitive"]>["addresses"][number]

const addressValues = (a: Address | undefined) => ({
  province: a?.province ? String(a.province) : "",
  district: a?.district ?? "",
  municipality: a?.municipality ?? "",
  wardNumber: a?.wardNumber ? String(a.wardNumber) : "",
  tole: a?.tole ?? "",
  street: a?.street ?? "",
  postalCode: a?.postalCode ?? "",
})

export default async function EditGuardianPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "parents.update")) return <AccessDenied />
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  const guardian = await getGuardianProfile(context, id.data).catch((error) => {
    if (error instanceof NotFoundError) notFound()
    throw error
  })
  if (guardian.archivedAt) {
    return <AccessDenied title="Restore this guardian before editing" />
  }

  const permanent = guardian.sensitive?.addresses.find((a) => a.type === "PERMANENT")
  const temporary = guardian.sensitive?.addresses.find((a) => a.type === "TEMPORARY")
  const same = !temporary || JSON.stringify(addressValues(permanent)) === JSON.stringify(addressValues(temporary))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Edit ${guardian.fullName}`}
        breadcrumbs={[
          { label: "Parents", href: "/dashboard/parents" },
          { label: guardian.fullName, href: `/dashboard/parents/${guardian.id}` },
          { label: "Edit" },
        ]}
      />
      <EditGuardianForm
        guardianId={guardian.id}
        permissions={{ sensitive: guardian.sensitive !== null }}
        initial={{
          profile: {
            ...emptyProfile,
            guardianCode: guardian.guardianCode ?? "",
            fullName: guardian.fullName,
            gender: guardian.gender ?? "",
            dateOfBirth: fromDate(guardian.sensitive?.dateOfBirth),
            nationality: guardian.nationality ?? "",
            phone: guardian.phone ?? "",
            alternatePhone: guardian.alternatePhone ?? "",
            email: guardian.email ?? "",
            preferredContactMethod: guardian.preferredContactMethod ?? "",
            preferredLanguage: guardian.preferredLanguage ?? "",
            occupation: guardian.occupation ?? "",
            workplace: guardian.workplace ?? "",
            address: guardian.address ?? "",
            permanentAddress: addressValues(permanent),
            sameAsPermanent: same,
            temporaryAddress: addressValues(temporary),
          },
        }}
      />
    </div>
  )
}
