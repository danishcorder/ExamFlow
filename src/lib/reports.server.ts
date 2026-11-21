import { fetchAllPages } from './grading.analytics';
import { buildReportsOverview, type ReportsInput, type ReportsOverview } from './reports.shared';
import { verifyInstitutionAccess, type AuthedSupabase } from './workspace.server';

/**
 * Institution/teacher reporting overview built from existing tables only.
 * Admins see every exam in the institution; teachers see only exams they own.
 */
export async function loadReportsOverview(
  supabase: AuthedSupabase,
  userId: string,
  input: ReportsInput,
): Promise<ReportsOverview> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, input.institutionId, [
    'institution_admin',
    'teacher',
  ]);
  const isAdmin = isSuperAdmin || membership?.role === 'institution_admin';
  const db = supabase as any;

  const exams = await fetchAllPages<any>((from, to) => {
    let q = db
      .from('exams')
      .select('id, title, status, starts_at, created_at, total_marks, course_id, created_by, teacher_membership_id')
      .eq('institution_id', input.institutionId)
      .neq('status', 'draft')
      .order('id')
      .range(from, to);
    if (!isAdmin) {
      q = membership
        ? q.or(`created_by.eq.${userId},teacher_membership_id.eq.${membership.id}`)
        : q.eq('created_by', userId);
    }
    return q;
  });

  const courseIds = Array.from(new Set(exams.map((e) => e.course_id).filter((v: string | null): v is string => !!v)));
  const courseLabel = new Map<string, string>();
  for (let i = 0; i < courseIds.length; i += 100) {
    const { data, error } = await db
      .from('courses')
      .select('id, code, title')
      .in('id', courseIds.slice(i, i + 100))
      .eq('institution_id', input.institutionId);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) courseLabel.set(c.id, `${c.code} — ${c.title}`);
  }

  const examIds = exams.map((e) => e.id as string);
  const attempts: { exam_id: string; attempt_id: string; status: string }[] = [];
  const grades: any[] = [];
  for (let i = 0; i < examIds.length; i += 50) {
    const ids = examIds.slice(i, i + 50);
    const a = await fetchAllPages<any>((from, to) =>
      db.from('exam_attempts').select('id, exam_id, status').in('exam_id', ids)
        .eq('institution_id', input.institutionId).order('id').range(from, to),
    );
    for (const r of a) attempts.push({ exam_id: r.exam_id, attempt_id: r.id, status: r.status });
    const g = await fetchAllPages<any>((from, to) =>
      db.from('exam_attempt_grades').select('exam_id, attempt_id, status, percentage, is_passing').in('exam_id', ids)
        .eq('institution_id', input.institutionId).order('attempt_id').range(from, to),
    );
    grades.push(...g);
  }

  return buildReportsOverview(
    exams.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      starts_at: e.starts_at,
      created_at: e.created_at,
      total_marks: Number(e.total_marks),
      course_label: e.course_id ? (courseLabel.get(e.course_id) ?? null) : null,
    })),
    attempts,
    grades,
    { from: input.from, to: input.to },
  );
}
