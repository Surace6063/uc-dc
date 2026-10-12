import { z } from "zod"

import { entries } from "@/features/exams/filters"
import { TeacherEmploymentType } from "@/lib/generated/prisma/enums"

// Institutional dashboard filters, kept in the URL so a filtered view can be
// shared or refreshed. `faculty` is the academic faculty/school (Program.
// facultyId), not teaching staff; `class` is a class or semester. `exam`
// narrows the examination charts (pass vs fail, GPA) to one examination.
// `from`/`to` narrow date-based figures (new admissions, recent activity);
// everything else follows the academic year. `dept` (a teacher's
// department/faculty) and `emp` (employment type) narrow only the faculty
// profile charts (designation, qualification), not headcounts or ratios.
const uuid = z.uuid().optional().catch(undefined)
const day = z.iso.date().optional().catch(undefined)

export const dashboardFiltersSchema = z.object({
  year: uuid,
  faculty: uuid,
  program: uuid,
  class: uuid,
  exam: uuid,
  dept: uuid,
  emp: z.enum(TeacherEmploymentType).optional().catch(undefined),
  from: day,
  to: day,
})

export type DashboardFilters = z.output<typeof dashboardFiltersSchema>

export const parseDashboardFilters = (source: Record<string, string | string[] | undefined>): DashboardFilters =>
  dashboardFiltersSchema.parse(entries(source))

// A changed parent clears filters that may no longer apply.
export const DASHBOARD_DEPENDENTS = { year: ["exam", "from", "to"], faculty: ["program", "class"], program: ["class"] } as const

// How many academic years the trend charts look back over.
export const TREND_YEARS = 5
