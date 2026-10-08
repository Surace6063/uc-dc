import { z } from "zod"

import { OrganizationType } from "@/lib/generated/prisma/enums"

export const organizationTypeLabels: Record<OrganizationType, string> = {
  SCHOOL: "School",
  COLLEGE: "College",
  UNIVERSITY: "University",
  INSTITUTE: "Institute",
  OTHER: "Other",
}

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the organisation's name.").max(100),
  type: z.enum(OrganizationType, "Choose a type."),
  country: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || null),
})

export const switchOrganizationSchema = z.object({
  organizationId: z.uuid(),
})
