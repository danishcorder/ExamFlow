-- Phase 7: Grading and Results
-- Adds exam_attempt_grades, exam_question_grades, moderation workflows,
-- result publication, audit trails, and strict student RLS policies.

DO $$ BEGIN
  CREATE TYPE public.exam_grade_status AS ENUM (
    'draft',
    'moderated',
    'published'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1. Exam Attempt Grades (overall result per attempt)
CREATE TABLE IF NOT EXISTS public.exam_attempt_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL,
  exam_version_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status public.exam_grade_status NOT NULL DEFAULT 'draft',
  total_awarded_marks numeric(10, 2) NOT NULL DEFAULT 0,
  max_possible_marks numeric(10, 2) NOT NULL DEFAULT 0,
  percentage numeric(5, 2) NOT NULL DEFAULT 0,
  is_passing boolean NOT NULL DEFAULT false,
  teacher_notes text,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  moderated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, exam_id) REFERENCES public.exams(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id, institution_id) REFERENCES public.exam_attempts(id, institution_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, institution_id) REFERENCES public.student_records(id, institution_id) ON DELETE CASCADE,
  UNIQUE (institution_id, attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_grades_exam_status
  ON public.exam_attempt_grades (institution_id, exam_id, status);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_grades_student
  ON public.exam_attempt_grades (institution_id, student_id, status);

-- 2. Exam Question Grades (per-question grade breakdown, rubrics & feedback)
CREATE TABLE IF NOT EXISTS public.exam_question_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  max_marks numeric(10, 2) NOT NULL DEFAULT 0,
  awarded_marks numeric(10, 2) NOT NULL DEFAULT 0,
  negative_deduction numeric(10, 2) NOT NULL DEFAULT 0,
  is_correct boolean,
  teacher_feedback text,
  rubric_breakdown jsonb DEFAULT '{}'::jsonb,
  graded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, attempt_id) REFERENCES public.exam_attempts(id, institution_id) ON DELETE CASCADE,
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_question_grades_attempt
  ON public.exam_question_grades (attempt_id);

-- 3. Audit trigger for grade changes
CREATE OR REPLACE FUNCTION public.log_exam_grade_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_inst_id uuid;
  v_exam_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_inst_id := NEW.institution_id;
    v_exam_id := NEW.exam_id;
    v_action := 'exam.grade_created';
  ELSIF TG_OP = 'UPDATE' THEN
    v_inst_id := NEW.institution_id;
    v_exam_id := NEW.exam_id;
    v_action := CASE 
      WHEN NEW.status = 'published' AND OLD.status <> 'published' THEN 'exam.results_published'
      WHEN NEW.status = 'moderated' THEN 'exam.grade_moderated'
      ELSE 'exam.grade_updated'
    END;
  ELSE
    RETURN OLD;
  END IF;

  INSERT INTO public.institution_audit_logs (
    institution_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_inst_id,
    v_actor,
    v_action,
    'exam_attempt_grades',
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object(
      'exam_id', v_exam_id,
      'attempt_id', COALESCE(NEW.attempt_id, OLD.attempt_id),
      'status', COALESCE(NEW.status, OLD.status),
      'total_awarded_marks', COALESCE(NEW.total_awarded_marks, OLD.total_awarded_marks)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exam_attempt_grades_audit ON public.exam_attempt_grades;
CREATE TRIGGER trg_exam_attempt_grades_audit
  AFTER INSERT OR UPDATE ON public.exam_attempt_grades
  FOR EACH ROW EXECUTE FUNCTION public.log_exam_grade_audit_event();

-- 4. RLS & Grants
REVOKE ALL ON public.exam_attempt_grades FROM anon;
REVOKE ALL ON public.exam_question_grades FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempt_grades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_question_grades TO authenticated;

ALTER TABLE public.exam_attempt_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_question_grades ENABLE ROW LEVEL SECURITY;

-- Teachers & Admins can manage all grade records in their institution
DROP POLICY IF EXISTS exam_attempt_grades_educator ON public.exam_attempt_grades;
CREATE POLICY exam_attempt_grades_educator ON public.exam_attempt_grades
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  );

-- Students can read attempt grades ONLY when status = 'published'
DROP POLICY IF EXISTS exam_attempt_grades_student ON public.exam_attempt_grades;
CREATE POLICY exam_attempt_grades_student ON public.exam_attempt_grades
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = exam_attempt_grades.attempt_id
        AND ea.user_id = auth.uid()
        AND public.is_own_student_record(ea.student_id, auth.uid())
    )
  );

-- Teachers & Admins can manage question grades
DROP POLICY IF EXISTS exam_question_grades_educator ON public.exam_question_grades;
CREATE POLICY exam_question_grades_educator ON public.exam_question_grades
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  );

-- Students can read question grades ONLY when the parent attempt grade status = 'published'
DROP POLICY IF EXISTS exam_question_grades_student ON public.exam_question_grades;
CREATE POLICY exam_question_grades_student ON public.exam_question_grades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_attempt_grades eag
      JOIN public.exam_attempts ea ON ea.id = eag.attempt_id
      WHERE eag.attempt_id = exam_question_grades.attempt_id
        And eag.status = 'published'
        AND ea.user_id = auth.uid()
        AND public.is_own_student_record(ea.student_id, auth.uid())
    )
  );
