-- Attendance management: per-organisation policy, holidays, attendance
-- sessions with one record per marked student, teacher and staff attendance,
-- correction history with approval, and shortage-alert de-duplication.

-- CreateEnum
CREATE TYPE "AttendanceSessionType" AS ENUM ('DAILY', 'PERIOD');

-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'EXCUSED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "ExcusedTreatment" AS ENUM ('EXCLUDE', 'COUNT_AS_ABSENT', 'COUNT_AS_PRESENT');

-- CreateEnum
CREATE TYPE "AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeType" AS ENUM ('TEACHER', 'STAFF');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'SELF_SERVICE', 'IMPORT', 'DEVICE');

-- CreateEnum
CREATE TYPE "HolidayAudience" AS ENUM ('ALL', 'STUDENTS', 'EMPLOYEES');

-- CreateEnum
CREATE TYPE "AttendanceAlertKind" AS ENUM ('BELOW_THRESHOLD', 'APPROACHING_THRESHOLD');

-- CreateTable
CREATE TABLE "attendance_policies" (
    "organization_id" UUID NOT NULL,
    "daily_enabled" BOOLEAN NOT NULL DEFAULT true,
    "period_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_slots" INTEGER NOT NULL DEFAULT 1,
    "max_periods_per_day" INTEGER NOT NULL DEFAULT 8,
    "default_status" "AttendanceStatus" DEFAULT 'PRESENT',
    "half_day_enabled" BOOLEAN NOT NULL DEFAULT false,
    "late_counts_as_present" BOOLEAN NOT NULL DEFAULT true,
    "excused_treatment" "ExcusedTreatment" NOT NULL DEFAULT 'EXCLUDE',
    "minimum_percentage" INTEGER NOT NULL DEFAULT 75,
    "warning_margin_percentage" INTEGER NOT NULL DEFAULT 5,
    "corrections_require_approval" BOOLEAN NOT NULL DEFAULT true,
    "lock_after_days" INTEGER,
    "weekly_off_days" INTEGER[] DEFAULT ARRAY[6]::INTEGER[],
    "allow_on_non_working_days" BOOLEAN NOT NULL DEFAULT false,
    "notify_guardians_on_absence" BOOLEAN NOT NULL DEFAULT false,
    "notify_guardians_on_late" BOOLEAN NOT NULL DEFAULT false,
    "employee_attendance_enabled" BOOLEAN NOT NULL DEFAULT true,
    "employee_self_check_in" BOOLEAN NOT NULL DEFAULT false,
    "workday_start_time" TEXT NOT NULL DEFAULT '10:00',
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "applies_to" "HolidayAudience" NOT NULL DEFAULT 'ALL',
    "education_level_id" UUID,
    "description" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "session_type" "AttendanceSessionType" NOT NULL,
    "date" DATE NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "scope_key" TEXT NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_offering_id" UUID,
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "taken_by_id" UUID,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_attendance" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_offering_id" UUID,
    "session_type" "AttendanceSessionType" NOT NULL,
    "date" DATE NOT NULL,
    "scope_key" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "late_minutes" INTEGER,
    "reason" TEXT,
    "remarks" TEXT,
    "marked_by_id" UUID,
    "corrected_by_id" UUID,
    "corrected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_attendance" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_type" "EmployeeType" NOT NULL,
    "teacher_id" UUID,
    "staff_id" UUID,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "late_minutes" INTEGER,
    "reason" TEXT,
    "remarks" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "marked_by_id" UUID,
    "corrected_by_id" UUID,
    "corrected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_attendance_id" UUID,
    "employee_attendance_id" UUID,
    "from_status" "AttendanceStatus" NOT NULL,
    "to_status" "AttendanceStatus" NOT NULL,
    "from_late_minutes" INTEGER,
    "to_late_minutes" INTEGER,
    "from_reason" TEXT,
    "to_reason" TEXT,
    "justification" TEXT NOT NULL,
    "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "kind" "AttendanceAlertKind" NOT NULL,
    "period" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "guardians_notified" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_organization_id_start_date_end_date_idx" ON "holidays"("organization_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "attendance_sessions_organization_id_date_status_idx" ON "attendance_sessions"("organization_id", "date", "status");

-- CreateIndex
CREATE INDEX "attendance_sessions_organization_id_academic_year_id_class__idx" ON "attendance_sessions"("organization_id", "academic_year_id", "class_id", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_organization_id_subject_offering_id_dat_idx" ON "attendance_sessions"("organization_id", "subject_offering_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_id_organization_id_key" ON "attendance_sessions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_class_scope_key" ON "attendance_sessions"("class_id", "date", "scope_key") WHERE (section_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_section_scope_key" ON "attendance_sessions"("section_id", "date", "scope_key") WHERE (section_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "student_attendance_organization_id_date_status_idx" ON "student_attendance"("organization_id", "date", "status");

-- CreateIndex
CREATE INDEX "student_attendance_organization_id_academic_year_id_class_i_idx" ON "student_attendance"("organization_id", "academic_year_id", "class_id", "section_id", "date");

-- CreateIndex
CREATE INDEX "student_attendance_organization_id_subject_offering_id_date_idx" ON "student_attendance"("organization_id", "subject_offering_id", "date");

-- CreateIndex
CREATE INDEX "student_attendance_student_id_academic_year_id_date_idx" ON "student_attendance"("student_id", "academic_year_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_session_id_student_id_key" ON "student_attendance"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_id_organization_id_key" ON "student_attendance"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_student_id_date_scope_key_key" ON "student_attendance"("student_id", "date", "scope_key");

-- CreateIndex
CREATE INDEX "employee_attendance_organization_id_date_status_idx" ON "employee_attendance"("organization_id", "date", "status");

-- CreateIndex
CREATE INDEX "employee_attendance_organization_id_employee_type_date_idx" ON "employee_attendance"("organization_id", "employee_type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_attendance_teacher_id_date_key" ON "employee_attendance"("teacher_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_attendance_staff_id_date_key" ON "employee_attendance"("staff_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_attendance_id_organization_id_key" ON "employee_attendance"("id", "organization_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_organization_id_status_created_at_idx" ON "attendance_corrections"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "attendance_corrections_student_attendance_id_idx" ON "attendance_corrections"("student_attendance_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_employee_attendance_id_idx" ON "attendance_corrections"("employee_attendance_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_one_pending_student_key" ON "attendance_corrections"("student_attendance_id") WHERE (status = 'PENDING');

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_one_pending_employee_key" ON "attendance_corrections"("employee_attendance_id") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "attendance_alerts_organization_id_created_at_idx" ON "attendance_alerts"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_alerts_student_id_academic_year_id_scope_kind_pe_key" ON "attendance_alerts"("student_id", "academic_year_id", "scope", "kind", "period");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_id_student_id_key" ON "enrollments"("id", "student_id");

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_subject_offering_id_class_id_fkey" FOREIGN KEY ("subject_offering_id", "class_id") REFERENCES "subject_offerings"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_taken_by_id_fkey" FOREIGN KEY ("taken_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_session_id_organization_id_fkey" FOREIGN KEY ("session_id", "organization_id") REFERENCES "attendance_sessions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_enrollment_id_student_id_fkey" FOREIGN KEY ("enrollment_id", "student_id") REFERENCES "enrollments"("id", "student_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_staff_id_organization_id_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "staff"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_student_attendance_id_organization__fkey" FOREIGN KEY ("student_attendance_id", "organization_id") REFERENCES "student_attendance"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_attendance_id_organization_fkey" FOREIGN KEY ("employee_attendance_id", "organization_id") REFERENCES "employee_attendance"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_alerts" ADD CONSTRAINT "attendance_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_alerts" ADD CONSTRAINT "attendance_alerts_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Daily registers never name a subject; period registers always do.
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_subject_matches_type"
  CHECK (("session_type" = 'DAILY') = ("subject_offering_id" IS NULL));
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_slot_range" CHECK ("slot" BETWEEN 1 AND 20);

ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_late_minutes" CHECK ("late_minutes" IS NULL OR "late_minutes" BETWEEN 0 AND 1440);
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_times" CHECK ("check_out_at" IS NULL OR "check_in_at" IS NULL OR "check_out_at" >= "check_in_at");

-- An employee record points at exactly the profile its type names.
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_one_profile" CHECK (
  ("employee_type" = 'TEACHER' AND "teacher_id" IS NOT NULL AND "staff_id" IS NULL) OR
  ("employee_type" = 'STAFF' AND "staff_id" IS NOT NULL AND "teacher_id" IS NULL)
);
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_late_minutes" CHECK ("late_minutes" IS NULL OR "late_minutes" BETWEEN 0 AND 1440);
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_times" CHECK ("check_out_at" IS NULL OR "check_in_at" IS NULL OR "check_out_at" >= "check_in_at");

ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_one_record"
  CHECK (num_nonnulls("student_attendance_id", "employee_attendance_id") = 1);

ALTER TABLE "holidays" ADD CONSTRAINT "holidays_dates" CHECK ("end_date" >= "start_date");

ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_values" CHECK (
  "daily_slots" BETWEEN 1 AND 2 AND
  "max_periods_per_day" BETWEEN 1 AND 20 AND
  "minimum_percentage" BETWEEN 0 AND 100 AND
  "warning_margin_percentage" BETWEEN 0 AND 50 AND
  ("lock_after_days" IS NULL OR "lock_after_days" >= 0) AND
  "late_grace_minutes" BETWEEN 0 AND 600 AND
  "workday_start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  "weekly_off_days" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
);

-- Keep the new tables away from Supabase's public Data API, like the rest
-- (the app reaches them only through Prisma on the server).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_policies', 'holidays', 'attendance_sessions', 'student_attendance', 'employee_attendance', 'attendance_corrections', 'attendance_alerts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Permissions (kept in sync with lib/authorization/permissions.ts).
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'attendance.view_all', 'View every class''s student attendance, sessions and reports', now()),
  (gen_random_uuid(), 'attendance.manage', 'Take and edit attendance for any class, section or subject', now()),
  (gen_random_uuid(), 'attendance.approve', 'Approve attendance corrections, lock and reopen registers', now()),
  (gen_random_uuid(), 'attendance.configure', 'Configure the attendance policy and holidays', now()),
  (gen_random_uuid(), 'attendance.staff.view', 'View teacher and staff attendance', now()),
  (gen_random_uuid(), 'attendance.staff.manage', 'Record and correct teacher and staff attendance', now()),
  (gen_random_uuid(), 'attendance.export', 'Export and import attendance', now())
ON CONFLICT ("key") DO NOTHING;

-- Two new default roles for every existing organisation.
INSERT INTO "roles" ("id", "organization_id", "name", "slug", "description", "is_system", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", v.name, v.slug, v.description, true, now(), now()
FROM "organizations" o
CROSS JOIN (VALUES
  ('Attendance Officer', 'attendance_officer', 'Takes and maintains attendance for every class and section.'),
  ('Academic Coordinator', 'academic_coordinator', 'Oversees classes, subjects and attendance; reviews corrections and reports.')
) AS v(name, slug, description)
ON CONFLICT ("organization_id", "slug") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON (
  (r."slug" IN ('owner', 'admin') AND p."key" IN ('attendance.view_all', 'attendance.manage', 'attendance.approve', 'attendance.configure', 'attendance.staff.view', 'attendance.staff.manage', 'attendance.export'))
  OR (r."slug" = 'principal' AND p."key" IN ('attendance.view_all', 'attendance.approve', 'attendance.configure', 'attendance.staff.view', 'attendance.export'))
  OR (r."slug" = 'hr' AND p."key" IN ('attendance.view', 'attendance.staff.view', 'attendance.staff.manage', 'attendance.export'))
  OR (r."slug" = 'attendance_officer' AND p."key" IN (
    'dashboard.view', 'students.view', 'academics.view', 'classes.view', 'subjects.view', 'notifications.view',
    'attendance.view', 'attendance.view_all', 'attendance.create', 'attendance.update', 'attendance.manage', 'attendance.export'))
  OR (r."slug" = 'academic_coordinator' AND p."key" IN (
    'dashboard.view', 'students.view', 'teachers.view', 'academics.view', 'classes.view', 'subjects.view', 'exams.view',
    'results.view', 'reports.view', 'events.view', 'notifications.view',
    'attendance.view', 'attendance.view_all', 'attendance.update', 'attendance.approve', 'attendance.staff.view', 'attendance.export'))
)
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;
