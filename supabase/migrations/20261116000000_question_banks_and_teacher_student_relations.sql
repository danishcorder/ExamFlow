-- Migration 5: QuestionBanks Container + Explicit Teacher & Student Foreign Keys
-- Depends on Phase 2, Phase 3, Phase 4, and Phase 5 migrations.
-- Completes explicit relational links between QuestionBanks, Questions, Exams,
-- Sections (exam_sections + class_sections), ExamAssignments, Teachers, and Students.

-- ============================================================================
-- 1. COMPOSITE TENANT KEY ON TEACHER ASSIGNMENTS
-- ============================================================================

ALTER TABLE public.teacher_assignments
  DROP CONSTRAINT IF EXISTS uq_teacher_assignments_id_inst;
ALTER TABLE public.teacher_assignments
  ADD CONSTRAINT uq_teacher_assignments_id_inst UNIQUE (id, institution_id);

-- ============================================================================
-- 2. QUESTION BANKS TABLE (Institution-Scoped Question Bank Collections)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.question_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  teacher_membership_id uuid REFERENCES public.institution_memberships(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 150),
  description text,
  is_shared boolean NOT NULL DEFAULT true,
  status public.question_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, title),
  UNIQUE (id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_question_banks_inst_course
  ON public.question_banks (institution_id, status, course_id);

CREATE INDEX IF NOT EXISTS idx_question_banks_teacher
  ON public.question_banks (institution_id, teacher_membership_id);

DROP TRIGGER IF EXISTS trg_question_banks_updated_at ON public.question_banks;
CREATE TRIGGER trg_question_banks_updated_at
  BEFORE UPDATE ON public.question_banks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 3. ADDITIVE FOREIGN KEYS ON QUESTIONS, EXAMS & EXAM_ASSIGNMENTS
-- ============================================================================

-- 3.1 Questions -> QuestionBank + Teacher Membership
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_bank_id uuid REFERENCES public.question_banks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_membership_id uuid REFERENCES public.institution_memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_question_bank
  ON public.questions (institution_id, question_bank_id, status);

CREATE INDEX IF NOT EXISTS idx_questions_teacher_membership
  ON public.questions (institution_id, teacher_membership_id);

-- 3.2 Exams -> Teacher Membership + Teacher Assignment
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS teacher_membership_id uuid REFERENCES public.institution_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_assignment_id uuid REFERENCES public.teacher_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exams_teacher_membership
  ON public.exams (institution_id, teacher_membership_id);

-- 3.3 ExamAssignments -> Teacher Membership + Student/Class/Section lookup indexes
ALTER TABLE public.exam_assignments
  ADD COLUMN IF NOT EXISTS assigned_by_membership_id uuid REFERENCES public.institution_memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exam_assignments_class
  ON public.exam_assignments (institution_id, class_id)
  WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_assignments_section
  ON public.exam_assignments (institution_id, class_section_id)
  WHERE class_section_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_assignments_student
  ON public.exam_assignments (institution_id, student_id)
  WHERE student_id IS NOT NULL;

-- ============================================================================
-- 4. CROSS-TENANT INTEGRITY TRIGGERS FOR NEW RELATIONSHIPS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_question_bank_and_teacher_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'question_banks' THEN
    IF NEW.course_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = NEW.course_id AND c.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Question bank course must belong to the same institution' USING ERRCODE = '23503';
    END IF;

    IF NEW.department_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id = NEW.department_id AND d.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Question bank department must belong to the same institution' USING ERRCODE = '23503';
    END IF;

    IF NEW.teacher_membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.institution_memberships m
      WHERE m.id = NEW.teacher_membership_id
        AND m.institution_id = NEW.institution_id
        AND m.role IN ('teacher', 'institution_admin')
    ) THEN
      RAISE EXCEPTION 'Question bank teacher must belong to the same institution' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'questions' THEN
    IF NEW.question_bank_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.question_banks qb
      WHERE qb.id = NEW.question_bank_id AND qb.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Question bank must belong to the same institution' USING ERRCODE = '23503';
    END IF;

    IF NEW.teacher_membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.institution_memberships m
      WHERE m.id = NEW.teacher_membership_id
        AND m.institution_id = NEW.institution_id
        AND m.role IN ('teacher', 'institution_admin')
    ) THEN
      RAISE EXCEPTION 'Question teacher must belong to the same institution' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'exams' THEN
    IF NEW.teacher_membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.institution_memberships m
      WHERE m.id = NEW.teacher_membership_id
        AND m.institution_id = NEW.institution_id
        AND m.role IN ('teacher', 'institution_admin')
    ) THEN
      RAISE EXCEPTION 'Exam teacher must belong to the same institution' USING ERRCODE = '23503';
    END IF;

    IF NEW.teacher_assignment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.teacher_assignments ta
      WHERE ta.id = NEW.teacher_assignment_id AND ta.institution_id = NEW.institution_id
    ) THEN
      RAISE EXCEPTION 'Exam teacher assignment must belong to the same institution' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'exam_assignments' THEN
    IF NEW.assigned_by_membership_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.institution_memberships m
      WHERE m.id = NEW.assigned_by_membership_id
        AND m.institution_id = NEW.institution_id
        AND m.role IN ('teacher', 'institution_admin')
    ) THEN
      RAISE EXCEPTION 'Assigning teacher membership must belong to the same institution' USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_banks_same_inst ON public.question_banks;
CREATE TRIGGER trg_question_banks_same_inst
  BEFORE INSERT OR UPDATE ON public.question_banks
  FOR EACH ROW EXECUTE FUNCTION public.verify_question_bank_and_teacher_refs();

DROP TRIGGER IF EXISTS trg_questions_bank_teacher_same_inst ON public.questions;
CREATE TRIGGER trg_questions_bank_teacher_same_inst
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.verify_question_bank_and_teacher_refs();

DROP TRIGGER IF EXISTS trg_exams_teacher_same_inst ON public.exams;
CREATE TRIGGER trg_exams_teacher_same_inst
  BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.verify_question_bank_and_teacher_refs();

DROP TRIGGER IF EXISTS trg_exam_assignments_teacher_same_inst ON public.exam_assignments;
CREATE TRIGGER trg_exam_assignments_teacher_same_inst
  BEFORE INSERT OR UPDATE ON public.exam_assignments
  FOR EACH ROW EXECUTE FUNCTION public.verify_question_bank_and_teacher_refs();

-- ============================================================================
-- 5. GRANTS & ROW LEVEL SECURITY FOR QUESTION_BANKS
-- ============================================================================

REVOKE ALL ON public.question_banks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_banks TO authenticated;
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_banks_select_educator ON public.question_banks;
CREATE POLICY question_banks_select_educator ON public.question_banks
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  );

DROP POLICY IF EXISTS question_banks_insert_educator ON public.question_banks;
CREATE POLICY question_banks_insert_educator ON public.question_banks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  );

DROP POLICY IF EXISTS question_banks_update_educator ON public.question_banks;
CREATE POLICY question_banks_update_educator ON public.question_banks
  FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS question_banks_delete_educator ON public.question_banks;
CREATE POLICY question_banks_delete_educator ON public.question_banks
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_institution_role(
      institution_id,
      ARRAY['institution_admin', 'teacher']::public.institution_role[],
      auth.uid()
    )
  );
