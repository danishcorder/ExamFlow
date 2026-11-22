BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Give existing accounts deterministic, unique usernames without changing passwords.
WITH bases AS (
  SELECT
    p.id,
    coalesce(
      nullif(
        trim(both '._-' FROM regexp_replace(lower(split_part(p.email, '@', 1)), '[^a-z0-9._-]+', '-', 'g')),
        ''
      ),
      'user'
    ) AS base
  FROM public.profiles p
  WHERE p.username IS NULL OR trim(p.username) = ''
), counts AS (
  SELECT base, count(*) AS base_count
  FROM bases
  GROUP BY base
)
UPDATE public.profiles p
SET username = CASE
  WHEN c.base_count > 1 OR char_length(b.base) < 3
    THEN left(b.base, 20) || '-' || substr(replace(p.id::text, '-', ''), 1, 8)
  ELSE left(b.base, 32)
END
FROM bases b
JOIN counts c ON c.base = b.base
WHERE p.id = b.id;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format
      CHECK (username = lower(username) AND username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (lower(username));

-- This account is global, not one-per-institution. Stop and resolve any legacy
-- multiple-admin state explicitly rather than silently choosing an administrator.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.platform_admins) > 1 THEN
    RAISE EXCEPTION 'Multiple platform administrators exist; retain the designated administrator before applying this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_singleton
  ON public.platform_admins ((true));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted_service_role boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, must_change_password)
  VALUES (
    NEW.id,
    lower(coalesce(NEW.email, '')),
    coalesce(NEW.raw_user_meta_data ->> 'full_name', ''),
    CASE WHEN v_trusted_service_role THEN lower(nullif(NEW.raw_user_meta_data ->> 'username', '')) ELSE NULL END,
    CASE WHEN v_trusted_service_role THEN coalesce(NEW.raw_user_meta_data ->> 'must_change_password', 'false') = 'true' ELSE false END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        username = coalesce(EXCLUDED.username, public.profiles.username),
        must_change_password = CASE
          WHEN v_trusted_service_role THEN EXCLUDED.must_change_password
          ELSE public.profiles.must_change_password
        END,
        full_name = CASE
          WHEN public.profiles.full_name = '' THEN EXCLUDED.full_name
          ELSE public.profiles.full_name
        END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_trusted_service_role boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF NOT v_trusted_service_role THEN
    NEW.username := OLD.username;
    NEW.must_change_password := OLD.must_change_password;
  END IF;
  RETURN NEW;
END;
$$;

-- A direct profile insert must not allow an authenticated user to claim a username
-- or bypass the forced-password-change flag.
CREATE OR REPLACE FUNCTION public.guard_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    NEW.username := NULL;
    NEW.must_change_password := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_insert ON public.profiles;
CREATE TRIGGER trg_profiles_guard_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert();

-- Restrict the legacy self-service institution-creation RPC.
CREATE OR REPLACE FUNCTION public.create_institution_with_owner(
  p_name text,
  p_slug text,
  p_institution_type text DEFAULT 'university'
)
RETURNS public.institutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean_name text := trim(coalesce(p_name, ''));
  v_clean_slug text := lower(trim(coalesce(p_slug, '')));
  v_inst public.institutions;
BEGIN
  IF v_uid IS NULL OR NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Only the Platform Super Admin can create institutions' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_clean_name) < 2 OR char_length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'Institution name must be between 2 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_clean_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length(v_clean_slug) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid institution slug' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.institutions (name, slug, institution_type, created_by)
  VALUES (v_clean_name, v_clean_slug, coalesce(p_institution_type, 'university'), v_uid)
  RETURNING * INTO v_inst;

  INSERT INTO public.institution_memberships (institution_id, user_id, role, status, invited_by)
  VALUES (v_inst.id, v_uid, 'institution_admin', 'active', v_uid);

  INSERT INTO public.institution_audit_logs (institution_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (v_inst.id, v_uid, 'institution.created', 'institution', v_inst.id::text,
          jsonb_build_object('name', v_inst.name, 'slug', v_inst.slug));

  RETURN v_inst;
END;
$$;

COMMIT;
