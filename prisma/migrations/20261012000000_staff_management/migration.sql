-- CreateEnum
CREATE TYPE "DesignationScope" AS ENUM ('ALL', 'TEACHING', 'NON_TEACHING');

-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('ADMINISTRATION', 'FINANCE', 'FRONT_OFFICE', 'LIBRARY', 'LABORATORY', 'IT', 'STUDENT_SERVICES', 'EXAMINATION', 'TRANSPORT', 'HOSTEL', 'HEALTH', 'SECURITY', 'FACILITIES', 'TEACHING', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'CASUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffEmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'CONTRACT_EXPIRED');

-- CreateEnum
CREATE TYPE "StaffQualificationKind" AS ENUM ('ACADEMIC', 'CERTIFICATION', 'TRAINING');

-- CreateEnum
CREATE TYPE "StaffDocumentCategory" AS ENUM ('CV', 'ACADEMIC_CERTIFICATE', 'PROFESSIONAL_CERTIFICATE', 'TRAINING_CERTIFICATE', 'APPOINTMENT_LETTER', 'CONTRACT', 'EXPERIENCE_LETTER', 'IDENTITY', 'OTHER');

-- AlterEnum
ALTER TYPE "DocumentAudience" ADD VALUE 'STAFF';

-- AlterTable
ALTER TABLE "designations" ADD COLUMN     "category" "JobCategory",
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "scope" "DesignationScope" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
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
    "employment_type" "StaffEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "employment_status" "StaffEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "designation_id" UUID,
    "department_id" UUID,
    "reporting_to_id" UUID,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "on_probation" BOOLEAN NOT NULL DEFAULT false,
    "probation_start_date" DATE,
    "probation_end_date" DATE,
    "resignation_date" DATE,
    "last_working_date" DATE,
    "termination_date" DATE,
    "leaving_reason" TEXT,
    "employment_notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_addresses" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
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

    CONSTRAINT "staff_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_employment_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "employment_type" "StaffEmploymentType" NOT NULL,
    "employment_status" "StaffEmploymentStatus" NOT NULL,
    "designation_name" TEXT,
    "department_name" TEXT,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "on_probation" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "changed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_employment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_qualifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "kind" "StaffQualificationKind" NOT NULL DEFAULT 'ACADEMIC',
    "level" "QualificationLevel",
    "title" TEXT NOT NULL,
    "specialization" TEXT,
    "institution_name" TEXT,
    "awarding_body" TEXT,
    "country" TEXT,
    "completion_year" INTEGER,
    "expiry_date" DATE,
    "result" TEXT,
    "document_id" UUID,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "category" "StaffDocumentCategory" NOT NULL,
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

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "department_id" UUID,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "end_reason" TEXT,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_name_key" ON "departments"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_id_organization_id_key" ON "departments"("id", "organization_id");

-- CreateIndex
CREATE INDEX "staff_organization_id_employment_status_archived_at_idx" ON "staff"("organization_id", "employment_status", "archived_at");

-- CreateIndex
CREATE INDEX "staff_organization_id_last_name_first_name_idx" ON "staff"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "staff_organization_id_date_of_joining_idx" ON "staff"("organization_id", "date_of_joining");

-- CreateIndex
CREATE INDEX "staff_organization_id_contract_end_date_idx" ON "staff"("organization_id", "contract_end_date");

-- CreateIndex
CREATE INDEX "staff_organization_id_department_id_idx" ON "staff"("organization_id", "department_id");

-- CreateIndex
CREATE INDEX "staff_organization_id_designation_id_idx" ON "staff"("organization_id", "designation_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_organization_id_employee_id_key" ON "staff"("organization_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_id_organization_id_key" ON "staff"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_organization_id_user_id_key" ON "staff"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_addresses_staff_id_type_key" ON "staff_addresses"("staff_id", "type");

-- CreateIndex
CREATE INDEX "staff_employment_records_staff_id_effective_date_idx" ON "staff_employment_records"("staff_id", "effective_date");

-- CreateIndex
CREATE INDEX "staff_qualifications_organization_id_kind_level_idx" ON "staff_qualifications"("organization_id", "kind", "level");

-- CreateIndex
CREATE INDEX "staff_qualifications_staff_id_idx" ON "staff_qualifications"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_documents_storage_path_key" ON "staff_documents"("storage_path");

-- CreateIndex
CREATE INDEX "staff_documents_organization_id_staff_id_idx" ON "staff_documents"("organization_id", "staff_id");

-- CreateIndex
CREATE INDEX "staff_documents_requirement_id_idx" ON "staff_documents"("requirement_id");

-- CreateIndex
CREATE INDEX "staff_assignments_organization_id_status_idx" ON "staff_assignments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "staff_assignments_staff_id_status_idx" ON "staff_assignments"("staff_id", "status");

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_designation_id_organization_id_fkey" FOREIGN KEY ("designation_id", "organization_id") REFERENCES "designations"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_reporting_to_id_fkey" FOREIGN KEY ("reporting_to_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_addresses" ADD CONSTRAINT "staff_addresses_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_employment_records" ADD CONSTRAINT "staff_employment_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_employment_records" ADD CONSTRAINT "staff_employment_records_staff_id_organization_id_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "staff"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_qualifications" ADD CONSTRAINT "staff_qualifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_qualifications" ADD CONSTRAINT "staff_qualifications_staff_id_organization_id_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "staff"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_qualifications" ADD CONSTRAINT "staff_qualifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "staff_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_organization_id_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "staff"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "document_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staff_id_organization_id_fkey" FOREIGN KEY ("staff_id", "organization_id") REFERENCES "staff"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Employee IDs are unique per organisation across teachers AND staff (one
-- shared sequence, one namespace). Each table's own unique index covers its
-- rows; this trigger covers the other table. The advisory lock serialises
-- concurrent writers of the same organisation + ID, so two transactions
-- can't both pass the check. Comparison is case-insensitive, like the app.
CREATE OR REPLACE FUNCTION enforce_shared_employee_id() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  clash boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || '/' || lower(NEW.employee_id), 0));
  IF TG_TABLE_NAME = 'staff' THEN
    SELECT EXISTS (
      SELECT 1 FROM teachers WHERE organization_id = NEW.organization_id AND lower(employee_id) = lower(NEW.employee_id)
    ) INTO clash;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM staff WHERE organization_id = NEW.organization_id AND lower(employee_id) = lower(NEW.employee_id)
    ) INTO clash;
  END IF;
  IF clash THEN
    RAISE EXCEPTION 'Employee ID % is already used in this organisation.', NEW.employee_id
      USING ERRCODE = 'unique_violation',
            CONSTRAINT = 'shared_employee_id_key',
            DETAIL = format('Key (organization_id, employee_id)=(%s, %s) already exists.', NEW.organization_id, NEW.employee_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_shared_employee_id
  BEFORE INSERT OR UPDATE OF employee_id, organization_id ON "staff"
  FOR EACH ROW EXECUTE FUNCTION enforce_shared_employee_id();

CREATE TRIGGER teachers_shared_employee_id
  BEFORE INSERT OR UPDATE OF employee_id, organization_id ON "teachers"
  FOR EACH ROW EXECUTE FUNCTION enforce_shared_employee_id();

-- Keep the new tables away from Supabase's public Data API, like the rest
-- (the app reaches them only through Prisma on the server).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['departments', 'staff', 'staff_addresses', 'staff_employment_records', 'staff_qualifications', 'staff_documents', 'staff_assignments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Data: register the new staff permission keys and grant them to the
-- existing system roles as in DEFAULT_ROLES. Additive only.
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'staff.view', 'View non-teaching staff', now()),
  (gen_random_uuid(), 'staff.view_department', 'View staff in one''s own department', now()),
  (gen_random_uuid(), 'staff.create', 'Add staff', now()),
  (gen_random_uuid(), 'staff.update', 'Edit staff', now()),
  (gen_random_uuid(), 'staff.delete', 'Permanently delete eligible archived staff', now()),
  (gen_random_uuid(), 'staff.archive', 'Archive and restore staff', now()),
  (gen_random_uuid(), 'staff.employment.view', 'View staff contracts, probation, leaving details and employment history', now()),
  (gen_random_uuid(), 'staff.employment.manage', 'Change staff employment (type, status, department, designation, contract)', now()),
  (gen_random_uuid(), 'staff.assignments.manage', 'Assign additional responsibilities to staff', now()),
  (gen_random_uuid(), 'staff.documents.view', 'View and download staff documents', now()),
  (gen_random_uuid(), 'staff.documents.manage', 'Upload and delete staff documents', now()),
  (gen_random_uuid(), 'staff.verify', 'Verify staff qualifications and documents', now()),
  (gen_random_uuid(), 'staff.sensitive.view', 'View staff date of birth, home addresses and emergency contacts', now()),
  (gen_random_uuid(), 'staff.import', 'Import staff from a file', now()),
  (gen_random_uuid(), 'staff.export', 'Export staff lists', now()),
  (gen_random_uuid(), 'staff.configure', 'Configure departments, designations, staff document types and employee IDs', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON (
  (r."slug" IN ('owner', 'admin') AND p."key" LIKE 'staff.%')
  OR (r."slug" = 'hr' AND p."key" LIKE 'staff.%' AND p."key" NOT IN ('staff.delete', 'staff.view_department'))
  OR (r."slug" = 'principal' AND p."key" IN ('staff.view', 'staff.employment.view', 'staff.documents.view', 'staff.verify', 'staff.export'))
  OR (r."slug" = 'accountant' AND p."key" IN ('staff.view', 'staff.employment.view'))
  OR (r."slug" = 'department_head' AND p."key" = 'staff.view_department')
)
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;
