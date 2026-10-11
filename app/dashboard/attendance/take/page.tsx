import type { Metadata } from "next"
import Link from "next/link"
import { ClipboardCheckIcon } from "lucide-react"

import { AccessDenied } from "@/components/shared/access-denied"
import { PageHeader } from "@/components/shared/page-header"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { AttendanceNav } from "@/features/attendance/components/attendance-nav"
import { RegisterForm } from "@/features/attendance/components/register-form"
import { MyRegisters, RegisterPicker, type PickerData } from "@/features/attendance/components/register-picker"
import { localDate } from "@/features/attendance/constants"
import { parseRegisterParams } from "@/features/attendance/filters"
import { hasPermission } from "@/lib/authorization/context"
import { AppError, ValidationError } from "@/lib/authorization/errors"
import { getPageContext } from "@/lib/authorization/page"
import { prisma } from "@/lib/prisma"
import { signedUrls } from "@/lib/supabase/storage"
import { myAssignments } from "@/services/attendance/access-service"
import { getPolicy } from "@/services/attendance/policy-service"
import { myRegistersToday } from "@/services/attendance/report-service"
import { getRegister } from "@/services/attendance/session-service"
import { resolveAcademicYear } from "@/services/classes/class-service"

export const metadata: Metadata = {
  title: "Take attendance",
}

function Notice({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <Empty className="rounded-xl border border-dashed py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export default async function TakeAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getPageContext()
  const canManage = hasPermission(context, "attendance.manage")
  if (!canManage && !hasPermission(context, "attendance.create")) return <AccessDenied />

  const params = parseRegisterParams(await searchParams)
  const organizationId = context.organization.id
  const today = localDate()
  const date = params.date && params.date <= today ? params.date : today
  const [policy, { years, yearId }] = await Promise.all([getPolicy(context), resolveAcademicYear(context, params.year)])
  const type = params.type === "PERIOD" && policy.periodEnabled ? "PERIOD" : policy.dailyEnabled ? "DAILY" : "PERIOD"

  const [levels, programs, classes, sections, offerings, assignments, mine] = await Promise.all([
    prisma.educationLevel.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, usesPrograms: true } }),
    prisma.program.findMany({ where: { organizationId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, educationLevelId: true } }),
    prisma.academicClass.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ educationLevel: { sortOrder: "asc" } }, { sequence: "asc" }, { name: "asc" }],
      select: { id: true, name: true, educationLevelId: true, programId: true },
    }),
    params.class
      ? prisma.section.findMany({ where: { organizationId, classId: params.class, archivedAt: null, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, classId: true } })
      : [],
    params.class && yearId && type === "PERIOD"
      ? prisma.subjectOffering.findMany({
          where: { organizationId, academicYearId: yearId, classId: params.class, status: "ACTIVE" },
          orderBy: { subject: { name: "asc" } },
          select: { id: true, subject: { select: { id: true, name: true, code: true } }, sections: { select: { sectionId: true } } },
        })
      : [],
    canManage || !yearId ? null : myAssignments(context, prisma, yearId),
    myRegistersToday(context, date),
  ])

  // Teachers pick from the classes (and subjects) they teach.
  const limitedTo = assignments ? [...new Set(assignments.map((a) => a.classId!))] : null
  const teachableSubjects = assignments ? new Set(assignments.filter((a) => a.classId === params.class && a.subjectId).map((a) => a.subjectId!)) : null
  const pickerData: PickerData = {
    years: years.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent })),
    yearId,
    date,
    today,
    type,
    levels,
    programs,
    classes,
    sections,
    offerings: offerings
      .filter((o) => !teachableSubjects || teachableSubjects.has(o.subject.id))
      .map((o) => ({ id: o.id, name: o.subject.name, code: o.subject.code, sectionIds: o.sections.map((s) => s.sectionId) })),
    policy: { dailyEnabled: policy.dailyEnabled, periodEnabled: policy.periodEnabled, dailySlots: policy.dailySlots, maxPeriodsPerDay: policy.maxPeriodsPerDay },
    limitedTo,
  }

  // A register is opened once the selection is complete.
  const sectionChosen = params.section !== undefined || (params.class && sections.length === 0)
  const ready = yearId && params.class && sectionChosen && (type === "DAILY" || params.offering)
  let register: Awaited<ReturnType<typeof getRegister>> | null = null
  let problem: string | null = null
  if (ready) {
    try {
      register = await getRegister(context, {
        academicYearId: yearId,
        date,
        classId: params.class,
        sectionId: params.section && params.section !== "all" ? params.section : null,
        sessionType: type,
        subjectOfferingId: type === "PERIOD" ? params.offering : null,
        slot: params.slot ?? 1,
      })
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      problem = error instanceof ValidationError ? (Object.values(error.fieldErrors).flat().find(Boolean) ?? error.message) : error.message
    }
  }
  const photos = register
    ? Object.fromEntries(
        [...(await signedUrls(register.students.map((s) => s.profileImagePath).filter((p): p is string => !!p), 600))].filter(
          (entry): entry is [string, string] => !!entry[1]
        )
      )
    : {}

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Take attendance"
        description="Choose a register, mark each student, then save a draft or submit."
        breadcrumbs={[{ label: "Attendance", href: "/dashboard/attendance" }, { label: "Take attendance" }]}
      />
      <AttendanceNav />
      {years.length === 0 ? (
        <Notice
          title="No academic year yet"
          description={<>Add an academic year under <Link href="/dashboard/academics?tab=years" className="underline underline-offset-2">Education structure</Link> first.</>}
        />
      ) : (
        <>
          <MyRegisters items={mine.items} yearId={mine.yearId} date={date} />
          <RegisterPicker data={pickerData} params={params} />
          {problem ? (
            <Notice title="This register can't be opened" description={problem} />
          ) : register ? (
            <RegisterForm key={`${register.session?.id ?? "new"}:${register.session?.updatedAt ?? ""}:${date}`} data={register} photos={photos} />
          ) : (
            <Notice
              title="Choose a register"
              description={
                limitedTo && limitedTo.length === 0
                  ? "You don't have any teaching assignments for this academic year, so there are no registers for you to take."
                  : type === "PERIOD"
                    ? "Pick the class, section and subject to load the student list."
                    : "Pick the class and section to load the student list."
              }
            />
          )}
        </>
      )}
    </div>
  )
}
