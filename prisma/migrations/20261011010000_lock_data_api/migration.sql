-- Lock every application table away from Supabase's public Data API.
--
-- The init migration did this for the auth tables only; the student, teacher
-- and academic-structure tables added since were left readable and writable
-- by the anon/authenticated roles (i.e. by anyone holding the publishable
-- key). The app reaches its data only through Prisma on the server, as the
-- table owner, which RLS does not restrict, so this changes no app behaviour
-- and touches no data.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Tables created by later migrations start locked too, so a new module can't
-- reopen this gap by forgetting the step above.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
