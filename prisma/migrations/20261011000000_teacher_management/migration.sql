-- CreateEnum
CREATE TYPE "DocumentAudience" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "TeacherEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'VISITING', 'OTHER');

-- CreateEnum
CREATE TYPE "TeacherEmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'CONTRACT_EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QualificationLevel" AS ENUM ('SECONDARY', 'HIGHER_SECONDARY', 'DIPLOMA', 'BACHELOR', 'MASTER', 'MPHIL', 'DOCTORATE', 'PROFESSIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TeacherDocumentCategory" AS ENUM ('CV', 'ACADEMIC_CERTIFICATE', 'TRAINING_CERTIFICATE', 'APPOINTMENT_LETTER', 'CONTRACT', 'EXPERIENCE_LETTER', 'IDENTITY', 'OTHER');

-- CreateEnum
CREATE TYPE "TeachingRole" AS ENUM ('SUBJECT_TEACHER', 'CLASS_TEACHER', 'CO_TEACHER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- DropIndex
DROP INDEX "document_requirements_organization_id_name_key";

-- AlterTable
ALTER TABLE "document_requirements" ADD COLUMN     "audience" "DocumentAudience" NOT NULL DEFAULT 'STUDENT';

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "education_level_id" UUID,
    "program_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credit_hours" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_settings" (
    "organization_id" UUID NOT NULL,
    "employee_id_mode" "NumberingMode" NOT NULL DEFAULT 'AUTOMATIC',
    "employee_id_prefix" TEXT NOT NULL DEFAULT 'EMP-',
    "employee_id_padding" INTEGER NOT NULL DEFAULT 4,
    "next_employee_sequence" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "employee_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "name_nepali" TEXT,
    "date_of_birth" DATE,
    "gender" "Gender",
    "nationality" TEXT,
    "profile_image_path" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "alternate_phone" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "emergency_contact_relationship" TEXT,
    "date_of_joining" DATE NOT NULL,
    "employment_type" "TeacherEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "employment_status" "TeacherEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "designation_id" UUID,
    "department_id" UUID,
    "reporting_to_id" UUID,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "on_probation" BOOLEAN NOT NULL DEFAULT false,
    "probation_end_date" DATE,
    "employment_notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_addresses" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "type" "AddressType" NOT NULL,
    "province" INTEGER,
    "district" TEXT,
    "municipality" TEXT,
    "ward_number" INTEGER,
    "tole" TEXT,
    "street" TEXT,
    "postal_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_employment_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "employment_type" "TeacherEmploymentType" NOT NULL,
    "employment_status" "TeacherEmploymentStatus" NOT NULL,
    "designation_name" TEXT,
    "department_name" TEXT,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "on_probation" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_employment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_qualifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "level" "QualificationLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "specialization" TEXT,
    "institution_name" TEXT,
    "awarding_body" TEXT,
    "country" TEXT,
    "completion_year" INTEGER,
    "result" TEXT,
    "document_id" UUID,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_certifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuing_organization" TEXT,
    "issue_date" DATE,
    "expiry_date" DATE,
    "reference" TEXT,
    "document_id" UUID,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "category" "TeacherDocumentCategory" NOT NULL,
    "requirement_id" UUID,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "education_level_id" UUID,
    "program_id" UUID,
    "class_id" UUID,
    "section_id" UUID,
    "subject_id" UUID,
    "batch_id" UUID,
    "role" "TeachingRole" NOT NULL DEFAULT 'SUBJECT_TEACHER',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "weekly_periods" INTEGER,
    "notes" TEXT,
    "end_reason" TEXT,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subjects_organization_id_education_level_id_program_id_idx" ON "subjects"("organization_id", "education_level_id", "program_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_organization_id_code_key" ON "subjects"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_id_organization_id_key" ON "subjects"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_organization_id_name_key" ON "designations"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "designations_id_organization_id_key" ON "designations"("id", "organization_id");

-- CreateIndex
CREATE INDEX "teachers_organization_id_employment_status_archived_at_idx" ON "teachers"("organization_id", "employment_status", "archived_at");

-- CreateIndex
CREATE INDEX "teachers_organization_id_last_name_first_name_idx" ON "teachers"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "teachers_organization_id_date_of_joining_idx" ON "teachers"("organization_id", "date_of_joining");

-- CreateIndex
CREATE INDEX "teachers_organization_id_department_id_idx" ON "teachers"("organization_id", "department_id");

-- CreateIndex
CREATE INDEX "teachers_organization_id_designation_id_idx" ON "teachers"("organization_id", "designation_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_organization_id_employee_id_key" ON "teachers"("organization_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_id_organization_id_key" ON "teachers"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_organization_id_user_id_key" ON "teachers"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_addresses_teacher_id_type_key" ON "teacher_addresses"("teacher_id", "type");

-- CreateIndex
CREATE INDEX "teacher_employment_records_teacher_id_effective_date_idx" ON "teacher_employment_records"("teacher_id", "effective_date");

-- CreateIndex
CREATE INDEX "teacher_qualifications_organization_id_level_idx" ON "teacher_qualifications"("organization_id", "level");

-- CreateIndex
CREATE INDEX "teacher_qualifications_teacher_id_idx" ON "teacher_qualifications"("teacher_id");

-- CreateIndex
CREATE INDEX "teacher_certifications_teacher_id_idx" ON "teacher_certifications"("teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_documents_storage_path_key" ON "teacher_documents"("storage_path");

-- CreateIndex
CREATE INDEX "teacher_documents_organization_id_teacher_id_idx" ON "teacher_documents"("organization_id", "teacher_id");

-- CreateIndex
CREATE INDEX "teacher_documents_requirement_id_idx" ON "teacher_documents"("requirement_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_organization_id_academic_year_id_status_idx" ON "teacher_assignments"("organization_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "teacher_assignments_teacher_id_status_idx" ON "teacher_assignments"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "teacher_assignments_organization_id_class_id_section_id_idx" ON "teacher_assignments"("organization_id", "class_id", "section_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_organization_id_subject_id_idx" ON "teacher_assignments"("organization_id", "subject_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_organization_id_program_id_idx" ON "teacher_assignments"("organization_id", "program_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_class_teacher_key" ON "teacher_assignments"("academic_year_id", "class_id", "section_id") WHERE (status = 'ACTIVE' AND role = 'CLASS_TEACHER' AND section_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_class_teacher_no_section_key" ON "teacher_assignments"("academic_year_id", "class_id") WHERE (status = 'ACTIVE' AND role = 'CLASS_TEACHER' AND section_id IS NULL AND class_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_organization_id_audience_name_key" ON "document_requirements"("organization_id", "audience", "name");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_settings" ADD CONSTRAINT "staff_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_designation_id_organization_id_fkey" FOREIGN KEY ("designation_id", "organization_id") REFERENCES "designations"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "faculties"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_reporting_to_id_fkey" FOREIGN KEY ("reporting_to_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_addresses" ADD CONSTRAINT "teacher_addresses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_employment_records" ADD CONSTRAINT "teacher_employment_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_employment_records" ADD CONSTRAINT "teacher_employment_records_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_qualifications" ADD CONSTRAINT "teacher_qualifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_qualifications" ADD CONSTRAINT "teacher_qualifications_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_qualifications" ADD CONSTRAINT "teacher_qualifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "teacher_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_certifications" ADD CONSTRAINT "teacher_certifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_certifications" ADD CONSTRAINT "teacher_certifications_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_certifications" ADD CONSTRAINT "teacher_certifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "teacher_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "document_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teachers"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_subject_id_organization_id_fkey" FOREIGN KEY ("subject_id", "organization_id") REFERENCES "subjects"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_batch_id_organization_id_fkey" FOREIGN KEY ("batch_id", "organization_id") REFERENCES "batches"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Data: register the new teacher permission keys and grant them to the
-- existing system Owner and Admin roles. Additive only.
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'teachers.archive', 'Archive and restore teachers', now()),
  (gen_random_uuid(), 'teachers.employment.view', 'View contracts, probation and employment history', now()),
  (gen_random_uuid(), 'teachers.employment.manage', 'Change employment details (type, status, designation, contract)', now()),
  (gen_random_uuid(), 'teachers.assignments.manage', 'Assign teachers to classes, subjects and programs', now()),
  (gen_random_uuid(), 'teachers.assignments.manage_department', 'Manage teaching assignments within one''s own department', now()),
  (gen_random_uuid(), 'teachers.documents.view', 'View and download teacher documents', now()),
  (gen_random_uuid(), 'teachers.documents.manage', 'Upload and delete teacher documents', now()),
  (gen_random_uuid(), 'teachers.verify', 'Verify teacher qualifications, certifications and documents', now()),
  (gen_random_uuid(), 'teachers.sensitive.view', 'View teachers'' date of birth, home addresses and emergency contacts', now()),
  (gen_random_uuid(), 'teachers.import', 'Import teachers from a file', now()),
  (gen_random_uuid(), 'teachers.export', 'Export teacher lists', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."slug" IN ('owner', 'admin')
  AND p."key" IN (
    'teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete',
    'teachers.archive', 'teachers.employment.view', 'teachers.employment.manage',
    'teachers.assignments.manage', 'teachers.assignments.manage_department',
    'teachers.documents.view', 'teachers.documents.manage', 'teachers.verify',
    'teachers.sensitive.view', 'teachers.import', 'teachers.export'
  )
ON CONFLICT DO NOTHING;
