import type { AuthedSupabase } from './workspace.server';
import { verifyInstitutionAccess, AuthorizationError } from './workspace.server';
import type {
  AttemptReviewStatus,
  InvigilatorDashboardAttemptRow,
  ProctoringEventItem,
  ProctoringEventType,
  ProctoringSeverity,
} from './proctoring.shared';

export * from './proctoring.shared';

export async function recordProctoringEvent(
  supabase: AuthedSupabase,
  institutionId: string,
  attemptId: string,
  studentId: string,
  eventType: ProctoringEventType,
  severity: ProctoringSeverity,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await (supabase as any).from('exam_proctoring_events').insert({
    institution_id: institutionId,
    attempt_id: attemptId,
    student_id: studentId,
    event_type: eventType,
    severity,
    details,
  });

  if (error) {
    console.error('Failed to record proctoring event:', error.message);
  }
}

export async function loadInvigilatorDashboard(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId?: string,
): Promise<{ attempts: InvigilatorDashboardAttemptRow[] }> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
    'invigilator',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Invigilator access required', 403);
  }

  let query = supabase
    .from('exam_attempts')
    .select('id, exam_id, student_id, status, started_at, submitted_at')
    .eq('institution_id', institutionId);

  if (examId) {
    query = query.eq('exam_id', examId);
  }

  const { data: attempts, error: attErr } = await query;
  if (attErr) throw new Error(attErr.message);

  const attemptList = attempts ?? [];
  if (attemptList.length === 0) {
    return { attempts: [] };
  }

  const attemptIds = attemptList.map((a) => a.id);
  const examIds = Array.from(new Set(attemptList.map((a) => a.exam_id)));
  const studentIds = Array.from(new Set(attemptList.map((a) => a.student_id)));

  const [examsRes, studentsRes, eventsRes, reviewsRes] = await Promise.all([
    supabase.from('exams').select('id, title').in('id', examIds).eq('institution_id', institutionId),
    supabase.from('student_records').select('id, student_code, full_name').in('id', studentIds),
    (supabase as any)
      .from('exam_proctoring_events')
      .select('id, attempt_id, student_id, event_type, severity, details, created_at')
      .in('attempt_id', attemptIds)
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('exam_attempt_reviews')
      .select('id, attempt_id, reviewer_id, review_status, review_notes, updated_at')
      .in('attempt_id', attemptIds)
      .eq('institution_id', institutionId),
  ]);

  const examMap = new Map((examsRes.data ?? []).map((e) => [e.id, e.title]));
  const studentMap = new Map((studentsRes.data ?? []).map((s) => [s.id, s]));
  
  const eventsMap = new Map<string, ProctoringEventItem[]>();
  for (const ev of (eventsRes.data ?? []) as any[]) {
    const list = eventsMap.get(ev.attempt_id) ?? [];
    list.push({
      id: ev.id,
      attemptId: ev.attempt_id,
      studentId: ev.student_id,
      eventType: ev.event_type as ProctoringEventType,
      severity: ev.severity as ProctoringSeverity,
      details: (ev.details ?? {}) as Record<string, string>,
      createdAt: ev.created_at,
    });
    eventsMap.set(ev.attempt_id, list);
  }

  const reviewMap = new Map((reviewsRes.data ?? []).map((r: any) => [r.attempt_id, r]));

  const rows: InvigilatorDashboardAttemptRow[] = attemptList.map((att) => {
    const student = studentMap.get(att.student_id);
    const evs = eventsMap.get(att.id) ?? [];
    const rev = reviewMap.get(att.id) as any;
    const criticalCount = evs.filter((e) => e.severity === 'critical' || e.severity === 'warning').length;

    return {
      attemptId: att.id,
      examId: att.exam_id,
      examTitle: examMap.get(att.exam_id) ?? 'Exam',
      studentId: att.student_id,
      studentCode: student?.student_code ?? 'STU-???',
      studentFullName: student?.full_name ?? 'Student',
      status: att.status,
      startedAt: att.started_at,
      submittedAt: att.submitted_at,
      eventCount: evs.length,
      criticalEventCount: criticalCount,
      reviewStatus: (rev?.review_status as AttemptReviewStatus) ?? (criticalCount > 0 ? 'flagged' : 'cleared'),
      reviewNotes: rev?.review_notes ?? null,
      events: evs,
    };
  });

  rows.sort((a, b) => b.criticalEventCount - a.criticalEventCount);

  return { attempts: rows };
}

export async function saveAttemptReview(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  data: {
    attemptId: string;
    reviewStatus: AttemptReviewStatus;
    reviewNotes?: string | null;
  },
): Promise<void> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
    'invigilator',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Invigilator access required to review attempts', 403);
  }

  const { error } = await (supabase as any).from('exam_attempt_reviews').upsert(
    {
      institution_id: institutionId,
      attempt_id: data.attemptId,
      reviewer_id: userId,
      review_status: data.reviewStatus,
      review_notes: data.reviewNotes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'institution_id,attempt_id' },
  );

  if (error) throw new Error(error.message);
}
