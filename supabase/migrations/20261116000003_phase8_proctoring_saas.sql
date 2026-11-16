-- Phase 8 & 9: Advanced Proctoring, Incident Timeline, Invigilator Review, and Commercial SaaS Subscriptions

CREATE TABLE IF NOT EXISTS exam_proctoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proctoring_events_attempt ON exam_proctoring_events(institution_id, attempt_id);

CREATE TABLE IF NOT EXISTS exam_attempt_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id),
  review_status TEXT NOT NULL DEFAULT 'flagged',
  review_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_attempt_review UNIQUE (institution_id, attempt_id)
);

CREATE TABLE IF NOT EXISTS institution_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  max_active_exams INT DEFAULT 5,
  max_students INT DEFAULT 100,
  max_teachers INT DEFAULT 10,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE exam_proctoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proctoring events institution tenant isolation" ON exam_proctoring_events
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM institution_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "Attempt reviews institution tenant isolation" ON exam_attempt_reviews
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM institution_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

CREATE POLICY "Institution subscriptions tenant isolation" ON institution_subscriptions
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM institution_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );
