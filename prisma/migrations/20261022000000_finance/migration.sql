-- CreateEnum
CREATE TYPE "FinanceCategoryKind" AS ENUM ('FEE', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "StudentFeeStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConcessionKind" AS ENUM ('DISCOUNT', 'SCHOLARSHIP', 'WAIVER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ESEWA', 'KHALTI', 'FONEPAY', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentVerification" AS ENUM ('VERIFIED', 'PENDING');

-- CreateEnum
CREATE TYPE "FinanceEntryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceEntryStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "finance_settings" (
    "organization_id" UUID NOT NULL,
    "receipt_prefix" TEXT NOT NULL DEFAULT 'RC-',
    "receipt_padding" INTEGER NOT NULL DEFAULT 6,
    "next_receipt_sequence" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "FinanceCategoryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "education_level_id" UUID,
    "program_id" UUID,
    "class_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_installments" (
    "id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "fee_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fees" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "fee_structure_id" UUID,
    "installment_sequence" INTEGER,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "due_date" DATE,
    "status" "StudentFeeStatus" NOT NULL DEFAULT 'UNPAID',
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,

    CONSTRAINT "student_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_concessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_fee_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" "ConcessionKind" NOT NULL,
    "scholarship_category" "ScholarshipCategory",
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "approved_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "fee_concessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "received_on" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "payer_name" TEXT,
    "note" TEXT,
    "verification_status" "PaymentVerification" NOT NULL DEFAULT 'VERIFIED',
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" UUID,
    "reversal_reason" TEXT,
    "received_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "student_fee_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "FinanceEntryKind" NOT NULL,
    "category_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "party" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "status" "FinanceEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "voided_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_organization_id_kind_name_key" ON "finance_categories"("organization_id", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_id_organization_id_key" ON "finance_categories"("id", "organization_id");

-- CreateIndex
CREATE INDEX "fee_structures_organization_id_academic_year_id_idx" ON "fee_structures"("organization_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_id_organization_id_key" ON "fee_structures"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_installments_fee_structure_id_sequence_key" ON "fee_installments"("fee_structure_id", "sequence");

-- CreateIndex
CREATE INDEX "student_fees_organization_id_status_idx" ON "student_fees"("organization_id", "status");

-- CreateIndex
CREATE INDEX "student_fees_organization_id_academic_year_id_idx" ON "student_fees"("organization_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "student_fees_organization_id_due_date_idx" ON "student_fees"("organization_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_fees_student_id_fee_structure_id_installment_sequen_key" ON "student_fees"("student_id", "fee_structure_id", "installment_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "student_fees_id_organization_id_key" ON "student_fees"("id", "organization_id");

-- CreateIndex
CREATE INDEX "fee_concessions_organization_id_kind_idx" ON "fee_concessions"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "fee_concessions_student_fee_id_idx" ON "fee_concessions"("student_fee_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_received_on_idx" ON "payments"("organization_id", "received_on");

-- CreateIndex
CREATE INDEX "payments_organization_id_status_verification_status_idx" ON "payments"("organization_id", "status", "verification_status");

-- CreateIndex
CREATE INDEX "payments_student_id_idx" ON "payments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_receipt_number_key" ON "payments"("organization_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_organization_id_key" ON "payments"("id", "organization_id");

-- CreateIndex
CREATE INDEX "payment_allocations_student_fee_id_idx" ON "payment_allocations"("student_fee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_student_fee_id_key" ON "payment_allocations"("payment_id", "student_fee_id");

-- CreateIndex
CREATE INDEX "finance_entries_organization_id_kind_entry_date_idx" ON "finance_entries"("organization_id", "kind", "entry_date");

-- AddForeignKey
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_category_id_organization_id_fkey" FOREIGN KEY ("category_id", "organization_id") REFERENCES "finance_categories"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_education_level_id_organization_id_fkey" FOREIGN KEY ("education_level_id", "organization_id") REFERENCES "education_levels"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_program_id_organization_id_fkey" FOREIGN KEY ("program_id", "organization_id") REFERENCES "programs"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_organization_id_fkey" FOREIGN KEY ("class_id", "organization_id") REFERENCES "academic_classes"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_academic_year_id_organization_id_fkey" FOREIGN KEY ("academic_year_id", "organization_id") REFERENCES "academic_years"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_category_id_organization_id_fkey" FOREIGN KEY ("category_id", "organization_id") REFERENCES "finance_categories"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_fee_structure_id_organization_id_fkey" FOREIGN KEY ("fee_structure_id", "organization_id") REFERENCES "fee_structures"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_student_fee_id_organization_id_fkey" FOREIGN KEY ("student_fee_id", "organization_id") REFERENCES "student_fees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "students"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_organization_id_fkey" FOREIGN KEY ("payment_id", "organization_id") REFERENCES "payments"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_student_fee_id_organization_id_fkey" FOREIGN KEY ("student_fee_id", "organization_id") REFERENCES "student_fees"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_organization_id_fkey" FOREIGN KEY ("category_id", "organization_id") REFERENCES "finance_categories"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Rules the application also enforces, kept in the database too.
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_amount_check" CHECK ("amount" > 0);
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_amount_check" CHECK ("amount" > 0 AND "sequence" >= 1);
ALTER TABLE "student_fees" ADD CONSTRAINT "student_fees_amounts_check" CHECK ("amount" > 0 AND "discount_amount" >= 0 AND "paid_amount" >= 0 AND "discount_amount" + "paid_amount" <= "amount");
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_amount_check" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversal_check" CHECK (("status" = 'REVERSED') = ("reversed_at" IS NOT NULL));
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_check" CHECK ("amount" > 0);
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_amount_check" CHECK ("amount" > 0);
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_void_check" CHECK (("status" = 'VOIDED') = ("voided_at" IS NOT NULL));

-- New permissions for restricted finance actions, granted to existing
-- organisations' default roles (new organisations get them from the code):
--   finance.adjust   discounts, scholarships, waivers, cancelling fees
--   finance.reverse  reversing payments and voiding income/expense entries
--   finance.reports  finance reports and exports
INSERT INTO "permissions" ("id", "key", "description", "created_at") VALUES
  (gen_random_uuid(), 'finance.adjust', 'Give discounts, scholarships and waivers, and cancel fees', now()),
  (gen_random_uuid(), 'finance.reverse', 'Reverse payments and void income or expense entries', now()),
  (gen_random_uuid(), 'finance.reports', 'View and export finance reports', now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "permissions" p ON
     (p."key" = 'finance.adjust' AND r."slug" IN ('owner', 'admin', 'principal'))
  OR (p."key" = 'finance.reverse' AND r."slug" IN ('owner', 'admin'))
  OR (p."key" = 'finance.reports' AND r."slug" IN ('owner', 'admin', 'principal', 'accountant'))
ON CONFLICT DO NOTHING;
