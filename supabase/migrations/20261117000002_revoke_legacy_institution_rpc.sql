BEGIN;

-- Institution creation now goes through the authenticated server-side workflow,
-- which also provisions the first Institution Admin. Keep the legacy RPC closed.
REVOKE EXECUTE ON FUNCTION public.create_institution_with_owner(text, text, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
