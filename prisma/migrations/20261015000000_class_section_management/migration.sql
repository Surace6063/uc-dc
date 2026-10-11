-- Class & section management: class codes, capacity and archiving, section
-- codes and archiving, an optional capacity limit, and two permissions.

-- AlterTable
ALTER TABLE "academic_classes" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "student_settings" ADD COLUMN     "enforce_section_capacity" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_code_key" ON "academic_classes"("organization_id", "code") WHERE (code IS NOT NULL);

-- Permissions (kept in sync with lib/authorization/permissions.ts).
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'classes.manage', 'Create, edit and archive classes and sections', now()),
  (gen_random_uuid(), 'classes.export', 'Export class lists, section lists and rosters', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON (
  (r."slug" IN ('owner', 'admin', 'principal') AND p."key" IN ('classes.manage', 'classes.export'))
  OR (r."slug" = 'registrar' AND p."key" = 'classes.export')
)
WHERE r."is_system" = true
ON CONFLICT DO NOTHING;
