import type { Metadata } from "next"
import { z } from "zod"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { TimetableView } from "@/features/teaching/components/timetable-view"
import { hasPermission } from "@/lib/authorization/context"
import { NotFoundError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { teachingOptions } from "@/services/teaching/options-service"
import { myTeacher, overseesTeaching, resolveYear } from "@/services/teaching/scope-service"
import { canManageTimetable, classSchedule, mySchedule, timetableManagerOptions } from "@/services/teaching/timetable-service"

export const metadata: Metadata = { title: "Timetable" }

const uuid = z.uuid()

// The weekly timetable: a teacher's own week by default, or one class's
// (?class=…&section=…) for coordinators and the class's teachers.
export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ year?: string; class?: string; section?: string }> }) {
  const context = await getPageContext()
  if (!hasPermission(context, "classes.view")) return <AccessDenied />
  const sp = await searchParams
  const yearId = await resolveYear(context, sp.year)
  const manage = canManageTimetable(context)
  const [teacher, options, managerOptions] = await Promise.all([
    myTeacher(context),
    teachingOptions(context),
    manage ? timetableManagerOptions(context) : null,
  ])

  const classId = uuid.safeParse(sp.class).success ? sp.class! : null
  const sectionId = classId && uuid.safeParse(sp.section).success ? sp.section! : null
  // Without a class, teachers see their week and coordinators pick a class.
  let mode: "mine" | "class" | "pick" = classId ? "class" : teacher ? "mine" : "pick"
  let slots: Awaited<ReturnType<typeof mySchedule>> = []
  let notFound = false
  if (yearId && mode === "class") {
    try {
      slots = await classSchedule(context, { academicYearId: yearId, classId: classId!, sectionId })
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
      notFound = true
      mode = teacher ? "mine" : "pick"
    }
  }
  if (yearId && mode === "mine") slots = await mySchedule(context, yearId)

  // Classes the viewer may open: every class for coordinators and heads,
  // otherwise the ones they teach this year.
  const classChoices = managerOptions?.classes ?? (overseesTeaching(context) ? options.classes : options.classes.filter((c) => options.places.some((p) => p.classId === c.id && p.academicYearId === yearId)))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Timetable" description="Weekly periods. Times are local (Nepal) time." breadcrumbs={[{ label: "Timetable" }]} />
      <TimetableView
        yearId={yearId}
        mode={mode}
        classId={mode === "class" ? classId : null}
        sectionId={mode === "class" ? sectionId : null}
        slots={slots}
        options={options}
        managerOptions={managerOptions}
        classChoices={classChoices}
        myTeacherId={teacher?.id ?? null}
        canManage={manage}
        notFound={notFound}
      />
    </div>
  )
}
