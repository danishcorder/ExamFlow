-- Phase 6: Student Examination Engine
-- Depends on Phase 2, Phase 3, Phase 4, and Phase 5 migrations.
-- Adds exam_attempts, exam_attempt_answers, student eligibility functions,
-- server-authoritative timing triggers, immutable submission guarantees, and RLS.

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.exam_attempt_status AS ENUM (
    'in_progress',
    'submitted',
    'auto_submitted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- 2.1 Exam Attempts (one unique attempt per student per exam, server-timed)
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL,
  exam_version_id uuid NOT NULL,
  student_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  status public.exam_attempt_status NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  submission_reason text CHECK (
    submission_reason IS NULL
    OR submission_reason IN ('manual', 'deadline_auto_submit', 'server_reconcile')
  ),
  submission_idempotency_key text,
  last_saved_at timestamptz,
  question_order_seed text NOT NULL,
  answered_count integer NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  total_questions integer NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (exam_id, institution_id)
    REFERENCES public.exams(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (exam_version_id, institution_id)
    REFERENCES public.exam_versions(id, institution_id) ON DELETE RESTRICT,
  FOREIGN KEY (student_id, institution_id)
    REFERENCES public.student_records(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id, institution_id)
    REFERENCES public.institution_memberships(id, institution_id) ON DELETE RESTRICT,
  UNIQUE (institution_id, exam_id, student_id),
  UNIQUE (institution_id, exam_id, user_id),
  UNIQUE (id, institution_id),
  UNIQUE (id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_student
  ON public.exam_attempts (institution_id, student_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_status
  ON public.exam_attempts (institution_id, exam_id, status);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user
  ON public.exam_attempts (user_id, institution_id, exam_id);

-- 2.2 Exam Attempt Answers (one row per question per attempt, safe atomic upsert)
CREATE TABLE IF NOT EXISTS public.exam_attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  student_id uuid NOT NULL,
  question_id uuid NOT NULL,
  section_id uuid NOT NULL,
  question_type public.question_type NOT NULL,
  selected_option_keys text[] NOT NULL DEFAULT '{}'::text[],
  descriptive_text text,
  is_flagged boolean NOT NULL DEFAULT false,
  client_updated_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  saved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attempt_id, institution_id)
    REFERENCES public.exam_attempts(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id, student_id)
    REFERENCES public.exam_attempts(id, student_id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id, institution_id)
    REFERENCES public.exams(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, institution_id)
    REFERENCES public.student_records(id, institution_id) ON DELETE CASCADE,
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt
  ON public.exam_attempt_answers (attempt_id, saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_inst_exam
  ON public.exam_attempt_answers (institution_id, exam_id, student_id);

-- ============================================================================
-- 3. ELIGIBILITY & SERVER-AUTHORITATIVE SECURITY FUNCTIONS
-- ============================================================================

-- Resolve whether p_user_id is an active student assigned to p_exam_id in p_institution_id
CREATE OR REPLACE FUNCTION public.is_student_eligible_for_exam(
  p_institution_id uuid,
  p_exam_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_institution_id IS NULL OR p_exam_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.institutions inst
      JOIN public.institution_memberships mem
        ON mem.institution_id = inst.id
       AND mem.user_id = p_user_id
       AND mem.role = 'student'
       AND mem.status = 'active'
      JOIN public.student_records sr
        ON sr.institution_id = inst.id
       AND sr.status = 'active'
       AND (
         sr.membership_id = mem.id
         OR (sr.email IS NOT NULL AND lower(sr.email) = public.current_user_email())
       )
      JOIN public.exams ex
        ON ex.id = p_exam_id
       AND ex.institution_id = inst.id
       AND ex.latest_published_version_id IS NOT NULL
       AND ex.status IN ('published', 'closed')
      WHERE inst.id = p_institution_id
        AND inst.status = 'active'
        AND (
          EXISTS (
            SELECT 1
            FROM public.exam_assignments ea
            WHERE ea.institution_id = inst.id
              AND ea.exam_id = ex.id
              AND ea.target_type = 'student'
              AND ea.student_id = sr.id
          )
          OR EXISTS (
            SELECT 1
            FROM public.exam_assignments ea
            JOIN public.student_enrollments se
              ON se.institution_id = inst.id
             AND se.student_id = sr.id
             AND se.class_section_id = ea.class_section_id
             AND se.status = 'enrolled'
            WHERE ea.institution_id = inst.id
              AND ea.exam_id = ex.id
              AND ea.target_type = 'section'
          )
          OR EXISTS (
            SELECT 1
            FROM public.exam_assignments ea
            JOIN public.class_sections cs
              ON cs.institution_id = inst.id
             AND cs.class_id = ea.class_id
            JOIN public.student_enrollments se
              ON se.institution_id = inst.id
             AND se.student_id = sr.id
             AND se.class_section_id = cs.id
             AND se.status = 'enrolled'
            WHERE ea.institution_id = inst.id
              AND ea.exam_id = ex.id
              AND ea.target_type = 'class'
          )
        )
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_student_eligible_for_exam(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_student_eligible_for_exam(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- 4. SERVER-AUTHORITATIVE TRIGGERS (TIMING, IMMUTABILITY & VERSION LOCKING)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_exam_attempts_updated_at ON public.exam_attempts;
CREATE TRIGGER trg_exam_attempts_updated_at
  BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_exam_attempt_answers_updated_at ON public.exam_attempt_answers;
CREATE TRIGGER trg_exam_attempt_answers_updated_at
  BEFORE UPDATE ON public.exam_attempt_answers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enforce server-authoritative start/expires timestamps and protect submitted attempts
CREATE OR REPLACE FUNCTION public.enforce_exam_attempt_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.exams;
  v_ver public.exam_versions;
  v_now timestamptz := now();
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Exam attempts cannot be deleted' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_exam
    FROM public.exams
    WHERE id = NEW.exam_id AND institution_id = NEW.institution_id;

    IF NOT FOUND OR v_exam.status <> 'published' THEN
      RAISE EXCEPTION 'Exam is not published and cannot be started' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_ver
    FROM public.exam_versions
    WHERE id = NEW.exam_version_id
      AND exam_id = NEW.exam_id
      AND institution_id = NEW.institution_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Published exam version not found' USING ERRCODE = '23503';
    END IF;

    IF v_now < v_ver.starts_at THEN
      RAISE EXCEPTION 'Exam availability window has not started yet' USING ERRCODE = '42501';
    END IF;

    IF v_now >= v_ver.ends_at THEN
      RAISE EXCEPTION 'Exam availability window has closed' USING ERRCODE = '42501';
    END IF;

    -- Server-authoritative timestamps & initial status
    NEW.started_at := v_now;
    NEW.expires_at := LEAST(v_now + make_interval(mins => v_ver.duration_minutes), v_ver.ends_at);
    NEW.status := 'in_progress';
    NEW.submitted_at := NULL;
    NEW.submission_reason := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE rules: immutable identity & server timing fields
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
    OR NEW.exam_id IS DISTINCT FROM OLD.exam_id
    OR NEW.exam_version_id IS DISTINCT FROM OLD.exam_version_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.question_order_seed IS DISTINCT FROM OLD.question_order_seed
  THEN
    RAISE EXCEPTION 'Attempt timing and identity metadata are immutable' USING ERRCODE = '42501';
  END IF;

  -- Preserve submitted attempts completely
  IF OLD.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Submitted attempts are immutable and cannot be modified' USING ERRCODE = '42501';
  END IF;

  -- Transitioning from in_progress -> submitted / auto_submitted
  IF NEW.status <> 'in_progress' THEN
    IF v_now > OLD.expires_at THEN
      NEW.status := 'auto_submitted';
      NEW.submitted_at := OLD.expires_at;
      NEW.submission_reason := COALESCE(NEW.submission_reason, 'deadline_auto_submit');
    ELSE
      NEW.submitted_at := COALESCE(NEW.submitted_at, v_now);
      NEW.submission_reason := COALESCE(NEW.submission_reason, 'manual');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_attempts_lifecycle ON public.exam_attempts;
CREATE TRIGGER trg_exam_attempts_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_attempt_lifecycle();

-- Atomically increment exam_versions.attempt_count when a real attempt row is created
CREATE OR REPLACE FUNCTION public.increment_exam_version_attempt_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.exam_versions
  SET attempt_count = attempt_count + 1
  WHERE id = NEW.exam_version_id
    AND institution_id = NEW.institution_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_attempts_increment_version_count ON public.exam_attempts;
CREATE TRIGGER trg_exam_attempts_increment_version_count
  AFTER INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.increment_exam_version_attempt_count();

-- Record immutable attempt start & submission audit events securely without granting student insert on audit logs
CREATE OR REPLACE FUNCTION public.log_exam_attempt_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.institution_audit_logs (
      institution_id, actor_user_id, action, target_type, target_id, metadata
    ) VALUES (
      NEW.institution_id,
      NEW.user_id,
      'exam.attempt_started',
      'exam_attempt',
      NEW.id::text,
      jsonb_build_object(
        'exam_id', NEW.exam_id,
        'exam_version_id', NEW.exam_version_id,
        'student_id', NEW.student_id,
        'expires_at', NEW.expires_at
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'in_progress' AND NEW.status <> 'in_progress' THEN
    INSERT INTO public.institution_audit_logs (
      institution_id, actor_user_id, action, target_type, target_id, metadata
    ) VALUES (
      NEW.institution_id,
      NEW.user_id,
      CASE
        WHEN NEW.status = 'auto_submitted' THEN 'exam.attempt_auto_submitted'
        ELSE 'exam.attempt_submitted'
      END,
      'exam_attempt',
      NEW.id::text,
      jsonb_build_object(
        'exam_id', NEW.exam_id,
        'student_id', NEW.student_id,
        'status', NEW.status,
        'submitted_at', NEW.submitted_at,
        'reason', NEW.submission_reason
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_attempts_audit ON public.exam_attempts;
CREATE TRIGGER trg_exam_attempts_audit
  AFTER INSERT OR UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.log_exam_attempt_audit_event();

-- Enforce answer writes only while attempt is in_progress and before server expires_at
CREATE OR REPLACE FUNCTION public.enforce_attempt_answer_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.exam_attempts;
  v_now timestamptz := now();
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Saved attempt answers cannot be deleted directly' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = NEW.attempt_id AND institution_id = NEW.institution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam attempt not found' USING ERRCODE = '23503';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Attempt has already been submitted and answers are locked' USING ERRCODE = '42501';
  END IF;

  IF v_now > v_attempt.expires_at THEN
    RAISE EXCEPTION 'Attempt deadline has expired' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.question_id IS DISTINCT FROM OLD.question_id
      OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
      OR NEW.student_id IS DISTINCT FROM OLD.student_id
    THEN
      RAISE EXCEPTION 'Answer identity cannot be modified' USING ERRCODE = '42501';
    END IF;
    NEW.revision := OLD.revision + 1;
  END IF;

  NEW.saved_at := v_now;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_attempt_answers_guard ON public.exam_attempt_answers;
CREATE TRIGGER trg_exam_attempt_answers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_attempt_answers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attempt_answer_write();

-- ============================================================================
-- 5. GRANTS & ROW LEVEL SECURITY POLICIES
-- ============================================================================

REVOKE ALL ON public.exam_attempts FROM anon;
REVOKE ALL ON public.exam_attempt_answers FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.exam_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.exam_attempt_answers TO authenticated;

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempt_answers ENABLE ROW LEVEL SECURITY;

-- Allow eligible students to read published/closed exam metadata & student-safe snapshots
-- (Answer keys remain isolated in exam_version_answer_keys with ZERO student access)
DROP POLICY IF EXISTS exams_select_student ON public.exams;
CREATE POLICY exams_select_student ON public.exams
  FOR SELECT TO authenticated
  USING (
    status IN ('published', 'closed')
    AND public.is_student_eligible_for_exam(institution_id, id, auth.uid())
  );

DROP POLICY IF EXISTS exam_assignments_select_student ON public.exam_assignments;
CREATE POLICY exam_assignments_select_student ON public.exam_assignments
  FOR SELECT TO authenticated
  USING (
    (target_type = 'student' AND public.is_own_student_record(student_id, auth.uid()))
    OR (
      target_type = 'section'
      AND EXISTS (
        SELECT 1
        FROM public.student_enrollments se
        WHERE se.institution_id = exam_assignments.institution_id
          AND se.class_section_id = exam_assignments.class_section_id
          AND se.status = 'enrolled'
          AND public.is_own_student_record(se.student_id, auth.uid())
      )
    )
    OR (
      target_type = 'class'
      AND EXISTS (
        SELECT 1
        FROM public.class_sections cs
        JOIN public.student_enrollments se
          ON se.institution_id = cs.institution_id
         AND se.class_section_id = cs.id
         AND se.status = 'enrolled'
        WHERE cs.institution_id = exam_assignments.institution_id
          AND cs.class_id = exam_assignments.class_id
          AND public.is_own_student_record(se.student_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS exam_versions_select_student ON public.exam_versions;
CREATE POLICY exam_versions_select_student ON public.exam_versions
  FOR SELECT TO authenticated
  USING (
    public.is_student_eligible_for_exam(institution_id, exam_id, auth.uid())
  );

-- exam_attempts policies
DROP POLICY IF EXISTS exam_attempts_select_scoped ON public.exam_attempts;
CREATE POLICY exam_attempts_select_scoped ON public.exam_attempts
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher', 'invigilator']::public.institution_role[],
      auth.uid()
    )
    OR (
      user_id = auth.uid()
      AND public.is_own_student_record(student_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS exam_attempts_insert_student ON public.exam_attempts;
CREATE POLICY exam_attempts_insert_student ON public.exam_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_own_student_record(student_id, auth.uid())
    AND public.is_student_eligible_for_exam(institution_id, exam_id, auth.uid())
  );

DROP POLICY IF EXISTS exam_attempts_update_student ON public.exam_attempts;
CREATE POLICY exam_attempts_update_student ON public.exam_attempts
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'in_progress'
    AND public.is_own_student_record(student_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_own_student_record(student_id, auth.uid())
  );

-- exam_attempt_answers policies
DROP POLICY IF EXISTS exam_attempt_answers_select_scoped ON public.exam_attempt_answers;
CREATE POLICY exam_attempt_answers_select_scoped ON public.exam_attempt_answers
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      WHERE ea.id = exam_attempt_answers.attempt_id
        AND ea.user_id = auth.uid()
        AND public.is_own_student_record(ea.student_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS exam_attempt_answers_insert_student ON public.exam_attempt_answers;
CREATE POLICY exam_attempt_answers_insert_student ON public.exam_attempt_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      WHERE ea.id = exam_attempt_answers.attempt_id
        AND ea.institution_id = exam_attempt_answers.institution_id
        AND ea.exam_id = exam_attempt_answers.exam_id
        AND ea.student_id = exam_attempt_answers.student_id
        AND ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
        AND public.is_own_student_record(ea.student_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS exam_attempt_answers_update_student ON public.exam_attempt_answers;
CREATE POLICY exam_attempt_answers_update_student ON public.exam_attempt_answers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      WHERE ea.id = exam_attempt_answers.attempt_id
        AND ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
        AND public.is_own_student_record(ea.student_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exam_attempts ea
      WHERE ea.id = exam_attempt_answers.attempt_id
        AND ea.user_id = auth.uid()
        AND ea.status = 'in_progress'
        AND public.is_own_student_record(ea.student_id, auth.uid())
    )
  );
