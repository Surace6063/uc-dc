-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('PHONE', 'SMS', 'VIBER', 'WHATSAPP', 'EMAIL', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "GuardianPortalStatus" AS ENUM ('NONE', 'INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "GuardianInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- AlterTable
ALTER TABLE "student_settings" ADD COLUMN     "guardian_code_prefix" TEXT NOT NULL DEFAULT 'GRD-',
ADD COLUMN     "next_guardian_sequence" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_id" UUID,
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "guardian_code" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "portal_status" "GuardianPortalStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "preferred_contact_method" "ContactMethod",
ADD COLUMN     "preferred_language" TEXT,
ADD COLUMN     "profile_image_path" TEXT,
ADD COLUMN     "workplace" TEXT;

-- AlterTable
ALTER TABLE "student_guardians" ADD COLUMN     "can_access_student_portal_data" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "can_pickup_student" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "receives_attendance_notifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "receives_general_announcements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "guardian_addresses" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
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

    CONSTRAINT "guardian_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "GuardianInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invited_by_id" UUID,
    "accepted_at" TIMESTAMP(3),
    "accepted_user_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardian_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_addresses_guardian_id_type_key" ON "guardian_addresses"("guardian_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_invitations_token_hash_key" ON "guardian_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "guardian_invitations_organization_id_status_expires_at_idx" ON "guardian_invitations"("organization_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_invitations_one_pending_key" ON "guardian_invitations"("guardian_id") WHERE (status = 'PENDING');

-- CreateIndex
CREATE INDEX "guardians_organization_id_archived_at_idx" ON "guardians"("organization_id", "archived_at");

-- CreateIndex
CREATE INDEX "guardians_organization_id_portal_status_idx" ON "guardians"("organization_id", "portal_status");

-- CreateIndex
CREATE INDEX "guardians_organization_id_created_at_idx" ON "guardians"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_organization_id_guardian_code_key" ON "guardians"("organization_id", "guardian_code");

-- AddForeignKey
ALTER TABLE "guardian_addresses" ADD CONSTRAINT "guardian_addresses_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_guardian_id_organization_id_fkey" FOREIGN KEY ("guardian_id", "organization_id") REFERENCES "guardians"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: give every existing guardian an ID (GRD-00001, ...) in creation
-- order, per organisation, and continue the sequence after them.
INSERT INTO "student_settings" ("organization_id", "updated_at")
SELECT DISTINCT "organization_id", now() FROM "guardians"
ON CONFLICT ("organization_id") DO NOTHING;

WITH numbered AS (
  SELECT g."id", g."organization_id",
         row_number() OVER (PARTITION BY g."organization_id" ORDER BY g."created_at", g."id") AS n
  FROM "guardians" g
)
UPDATE "guardians" g
SET "guardian_code" = s."guardian_code_prefix" || lpad(numbered.n::text, greatest(s."admission_number_padding", length(numbered.n::text)), '0')
FROM numbered
JOIN "student_settings" s ON s."organization_id" = numbered."organization_id"
WHERE g."id" = numbered."id";

UPDATE "student_settings" s
SET "next_guardian_sequence" = c.total + 1
FROM (SELECT "organization_id", count(*) AS total FROM "guardians" GROUP BY "organization_id") c
WHERE c."organization_id" = s."organization_id";

-- Guardians already linked to an account could see their children before
-- this change; keep that access explicit rather than silently removing it.
UPDATE "guardians" SET "portal_status" = 'ACTIVE' WHERE "user_id" IS NOT NULL;
UPDATE "student_guardians" sg SET "can_access_student_portal_data" = true
FROM "guardians" g
WHERE g."id" = sg."guardian_id" AND g."user_id" IS NOT NULL;

-- Keep the new tables away from Supabase's public Data API, like the rest
-- (the app reaches them only through Prisma on the server).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['guardian_addresses', 'guardian_invitations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Data: register the new guardian permission keys and grant them to the
-- existing system roles as in DEFAULT_ROLES. Additive only.
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'parents.create', 'Add parents and guardians', now()),
  (gen_random_uuid(), 'parents.update', 'Edit guardians and their links to students', now()),
  (gen_random_uuid(), 'parents.archive', 'Archive and restore guardians', now()),
  (gen_random_uuid(), 'parents.delete', 'Permanently delete guardians with no links or account', now()),
  (gen_random_uuid(), 'parents.portal.manage', 'Invite guardians and manage their parent-portal access', now()),
  (gen_random_uuid(), 'parents.sensitive.view', 'View guardians'' date of birth and home addresses', now()),
  (gen_random_uuid(), 'parents.import', 'Import guardians from a file', now()),
  (gen_random_uuid(), 'parents.export', 'Export guardian lists', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON (
  (r."slug" IN ('owner', 'admin') AND p."key" LIKE 'parents.%')
  OR (r."slug" = 'registrar' AND p."key" IN ('parents.view', 'parents.create', 'parents.update', 'parents.archive', 'parents.sensitive.view', 'parents.import', 'parents.export'))
  OR (r."slug" = 'principal' AND p."key" IN ('parents.view', 'parents.sensitive.view', 'parents.export'))
)
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;
