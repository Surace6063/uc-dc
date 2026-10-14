-- Payments: an idempotency key from the payment form, so a double-click or a
-- retried request returns the first receipt instead of a second payment.
ALTER TABLE "payments" ADD COLUMN     "request_id" UUID;

CREATE UNIQUE INDEX "payments_organization_id_request_id_key" ON "payments"("organization_id", "request_id");

-- Teaching workspace and finance tables, locked like every other table:
-- the app reaches them only through Prisma on the server (as the table
-- owner, which RLS does not restrict). With RLS on, no policies and grants
-- revoked, Supabase's anon/authenticated API roles can read or write nothing.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'timetable_slots', 'lesson_plans', 'teaching_materials', 'class_assignments', 'assignment_submissions', 'notices',
    'finance_settings', 'finance_categories', 'fee_structures', 'fee_installments', 'student_fees', 'fee_concessions',
    'payments', 'payment_allocations', 'finance_entries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
