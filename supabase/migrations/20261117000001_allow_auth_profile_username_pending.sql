BEGIN;

-- Supabase Auth may fire the profile trigger before the trusted server writes the
-- managed username. Existing accounts were backfilled in the preceding migration;
-- managed-account creation sets this field immediately after Auth user creation.
ALTER TABLE public.profiles
  ALTER COLUMN username DROP NOT NULL;

COMMIT;
