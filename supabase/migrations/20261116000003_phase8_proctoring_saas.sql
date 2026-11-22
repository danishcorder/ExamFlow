-- Phase 8 & 9: Proctoring events, invigilator reviews and SaaS subscriptions.
--
-- Corrected 2026-11 audit:
--   * The original policies referenced a non-existent table (institution_members), so this
--     migration failed and the three tables below were never created.
--   * The original FOR ALL policies would also have let ANY member (including students) update
--     their institution's plan tier directly through PostgREST, and edit/delete proctoring
--     incidents and invigilator reviews. Policies are now split per command and per role.
--   * Composite foreign keys keep every row inside the attempt's own institution.
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_proctoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  student_id uuid NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_attempt_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_status text NOT NULL DEFAULT 'flagged',
  review_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institution_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  plan_tier text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  max_active_exams integer NOT NULL DEFAULT 5,
  max_students integer NOT NULL DEFAULT 100,
  max_teachers integer NOT NULL DEFAULT 10,
  current_period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. CONSTRAINTS (added idempotently so a partially created table is repaired)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_proctoring_events_attempt_same_inst_fk') THEN
    ALTER TABLE public.exam_proctoring_events
      ADD CONSTRAINT exam_proctoring_events_attempt_same_inst_fk
      FOREIGN KEY (attempt_id, institution_id) REFERENCES public.exam_attempts(id, institution_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_proctoring_events_student_same_inst_fk') THEN
    ALTER TABLE public.exam_proctoring_events
      ADD CONSTRAINT exam_proctoring_events_student_same_inst_fk
      FOREIGN KEY (student_id, institution_id) REFERENCES public.student_records(id, institution_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_proctoring_events_event_type_check') THEN
    ALTER TABLE public.exam_proctoring_events
      ADD CONSTRAINT exam_proctoring_events_event_type_check
      CHECK (event_type IN ('fullscreen_exit', 'tab_visibility_hidden', 'window_blur', 'camera_disconnected',
                            'mic_disconnected', 'face_missing', 'multiple_faces'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_proctoring_events_severity_check') THEN
    ALTER TABLE public.exam_proctoring_events
      ADD CONSTRAINT exam_proctoring_events_severity_check
      CHECK (severity IN ('info', 'warning', 'critical'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_attempt_review') THEN
    ALTER TABLE public.exam_attempt_reviews
      ADD CONSTRAINT unique_attempt_review UNIQUE (institution_id, attempt_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_attempt_reviews_attempt_same_inst_fk') THEN
    ALTER TABLE public.exam_attempt_reviews
      ADD CONSTRAINT exam_attempt_reviews_attempt_same_inst_fk
      FOREIGN KEY (attempt_id, institution_id) REFERENCES public.exam_attempts(id, institution_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_attempt_reviews_status_check') THEN
    ALTER TABLE public.exam_attempt_reviews
      ADD CONSTRAINT exam_attempt_reviews_status_check
      CHECK (review_status IN ('flagged', 'cleared', 'penalized', 'under_review'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_attempt_reviews_notes_length_check') THEN
    ALTER TABLE public.exam_attempt_reviews
      ADD CONSTRAINT exam_attempt_reviews_notes_length_check
      CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_subscriptions_institution_id_key') THEN
    ALTER TABLE public.institution_subscriptions
      ADD CONSTRAINT institution_subscriptions_institution_id_key UNIQUE (institution_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_subscriptions_plan_tier_check') THEN
    ALTER TABLE public.institution_subscriptions
      ADD CONSTRAINT institution_subscriptions_plan_tier_check
      CHECK (plan_tier IN ('free', 'starter', 'professional', 'enterprise'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_subscriptions_limits_check') THEN
    ALTER TABLE public.institution_subscriptions
      ADD CONSTRAINT institution_subscriptions_limits_check
      CHECK (max_active_exams >= 0 AND max_students >= 0 AND max_teachers >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proctoring_events_attempt
  ON public.exam_proctoring_events (institution_id, attempt_id, created_at DESC);

-- ============================================================================
-- 3. DEFAULT FREE PLAN FOR EVERY INSTITUTION
--    (previously created on first read with the viewer's session, which needed client write access)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_institution_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.institution_subscriptions (institution_id, current_period_end)
  VALUES (NEW.id, now() + interval '30 days')
  ON CONFLICT (institution_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_institutions_default_subscription ON public.institutions;
CREATE TRIGGER trg_institutions_default_subscription
  AFTER INSERT ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_institution_subscription();

INSERT INTO public.institution_subscriptions (institution_id, current_period_end)
SELECT i.id, now() + interval '30 days'
FROM public.institutions i
ON CONFLICT (institution_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_institution_subscriptions_updated_at ON public.institution_subscriptions;
CREATE TRIGGER trg_institution_subscriptions_updated_at
  BEFORE UPDATE ON public.institution_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 4. GRANTS
-- ============================================================================

REVOKE ALL ON public.exam_proctoring_events FROM anon;
REVOKE ALL ON public.exam_attempt_reviews FROM anon;
REVOKE ALL ON public.institution_subscriptions FROM anon;
REVOKE ALL ON public.exam_proctoring_events FROM authenticated;
REVOKE ALL ON public.exam_attempt_reviews FROM authenticated;
REVOKE ALL ON public.institution_subscriptions FROM authenticated;

-- Proctoring events are append-only for clients: no UPDATE or DELETE grant at all.
GRANT SELECT, INSERT ON public.exam_proctoring_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempt_reviews TO authenticated;
-- Plan changes must come from a verified billing webhook (service role) or a platform admin.
GRANT SELECT, UPDATE ON public.institution_subscriptions TO authenticated;

ALTER TABLE public.exam_proctoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

DROP POLICY IF EXISTS "Proctoring events institution tenant isolation" ON public.exam_proctoring_events;
DROP POLICY IF EXISTS "Attempt reviews institution tenant isolation" ON public.exam_attempt_reviews;
DROP POLICY IF EXISTS "Institution subscriptions tenant isolation" ON public.institution_subscriptions;

-- 5.1 Proctoring events
DROP POLICY IF EXISTS proctoring_events_select_staff ON public.exam_proctoring_events;
CREATE POLICY proctoring_events_select_staff ON public.exam_proctoring_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher', 'invigilator']::public.institution_role[],
      auth.uid()
    )
  );

-- A student may only log events for their own attempt while it is in progress.
DROP POLICY IF EXISTS proctoring_events_insert_own_attempt ON public.exam_proctoring_events;
CREATE POLICY proctoring_events_insert_own_attempt ON public.exam_proctoring_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_institution_member(institution_id, auth.uid())
    AND public.is_own_student_record(student_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = exam_proctoring_events.attempt_id
        AND ea.institution_id = exam_proctoring_events.institution_id
        AND ea.student_id = exam_proctoring_events.student_id
        AND ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
    )
  );

-- 5.2 Invigilator reviews
DROP POLICY IF EXISTS attempt_reviews_select_staff ON public.exam_attempt_reviews;
CREATE POLICY attempt_reviews_select_staff ON public.exam_attempt_reviews
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher', 'invigilator']::public.institution_role[],
      auth.uid()
    )
  );

DROP POLICY IF EXISTS attempt_reviews_insert_staff ON public.exam_attempt_reviews;
CREATE POLICY attempt_reviews_insert_staff ON public.exam_attempt_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher', 'invigilator']::public.institution_role[],
      auth.uid()
    )
  );

DROP POLICY IF EXISTS attempt_reviews_update_staff ON public.exam_attempt_reviews;
CREATE POLICY attempt_reviews_update_staff ON public.exam_attempt_reviews
  FOR UPDATE TO authenticated
  USING (
    public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher', 'invigilator']::public.institution_role[],
      auth.uid()
    )
  )
  WITH CHECK (
    reviewer_id = auth.uid()
    AND public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher', 'invigilator']::public.institution_role[],
      auth.uid()
    )
  );

DROP POLICY IF EXISTS attempt_reviews_delete_admin ON public.exam_attempt_reviews;
CREATE POLICY attempt_reviews_delete_admin ON public.exam_attempt_reviews
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(institution_id, ARRAY['institution_admin']::public.institution_role[], auth.uid())
  );

-- 5.3 Subscriptions: staff can read; only platform admins can change (no INSERT/DELETE policy).
DROP POLICY IF EXISTS institution_subscriptions_select_staff ON public.institution_subscriptions;
CREATE POLICY institution_subscriptions_select_staff ON public.institution_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  );

DROP POLICY IF EXISTS institution_subscriptions_update_platform_admin ON public.institution_subscriptions;
CREATE POLICY institution_subscriptions_update_platform_admin ON public.institution_subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
