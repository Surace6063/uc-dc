"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  createOrganizationSchema,
  switchOrganizationSchema,
} from "@/features/organizations/schemas"
import { requireAuth } from "@/lib/auth/session"
import { actionError, formValues, type ActionState } from "@/lib/authorization/action"
import { MembershipNotFoundError } from "@/lib/authorization/errors"
import { writeCurrentOrganizationId } from "@/lib/organizations/current-organization"
import {
  createOrganization as createOrganizationRecord,
  findMembership,
} from "@/services/organizations/organization-service"

type OrganizationValues = { name: string; type: string; country: string }

export async function createOrganization(
  _prev: ActionState<OrganizationValues>,
  formData: FormData
): Promise<ActionState<OrganizationValues>> {
  const values = formValues(formData, ["name", "type", "country"]) as OrganizationValues

  try {
    // The owner is always the signed-in user, never a value from the form.
    const user = await requireAuth()
    const input = createOrganizationSchema.parse(Object.fromEntries(formData))
    const organization = await createOrganizationRecord(input, { ownerUserId: user.id })
    await writeCurrentOrganizationId(organization.id)
  } catch (error) {
    return actionError(error, values)
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function switchOrganization(formData: FormData) {
  const user = await requireAuth()
  const { organizationId } = switchOrganizationSchema.parse({
    organizationId: formData.get("organizationId"),
  })

  // The ID comes from the browser, so it's only accepted if this user is
  // actually a member of that organisation.
  const membership = await findMembership(user.id, organizationId)
  if (!membership) throw new MembershipNotFoundError()

  await writeCurrentOrganizationId(organizationId)
  revalidatePath("/", "layout")
  redirect("/dashboard")
}

// Same as switchOrganization, but returns errors for use with useActionState.
export async function switchOrganizationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await switchOrganization(formData)
  } catch (error) {
    return actionError(error)
  }
}
