import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ExamAttemptStatus, ExamStatus } from '@/integrations/supabase/types';
import {
  computeRemainingSeconds,
  type StudentExamBucket,
  type StudentExamDashboardData,
  type StudentExamSummaryItem,
} from './exam-engine.shared';

type SnapshotSectionSummary = {
  questions?: Array<unknown>;
};

type SnapshotPayloadSummary = {
  sections?: SnapshotSectionSummary[];
};

export function classifyStudentExamBucket(params: {
  examStatus: ExamStatus;
  startsAt: string;
  endsAt: string;
  attemptStatus: ExamAttemptStatus | null;
  attemptExpiresAt: string | null;
  nowMs?: number;
}): StudentExamBucket {
  const nowMs = params.nowMs ?? Date.now();
  if (params.attemptStatus === 'submitted' || params.attemptStatus === 'auto_submitted') {
    return 'completed';
  }
  if (
    params.attemptStatus === 'in_progress' &&
    params.attemptExpiresAt &&
    Number.isFinite(Date.parse(params.attemptExpiresAt)) &&
    nowMs > Date.parse(params.attemptExpiresAt)
  ) {
    return 'completed';
  }

  const startsMs = Date.parse(params.startsAt);
  const endsMs = Date.parse(params.endsAt);

  if (params.examStatus === 'closed' || (Number.isFinite(endsMs) && nowMs >= endsMs)) {
    return 'completed';
  }
  if (Number.isFinite(startsMs) && nowMs < startsMs) {
    return 'upcoming';
  }
  return 'active';
}

export async function fetchStudentAssignedExamsFromSupabase(
  client: SupabaseClient<Database>,
  params: {
    institutionId: string;
    userId: string;
    userEmail?: string | null | undefined;
    nowMs?: number | undefined;
  },
): Promise<StudentExamDashboardData> {
  const { institutionId, userId, userEmail } = params;
  const nowMs = params.nowMs ?? Date.now();

  const [membershipRes, studentsRes] = await Promise.all([
    client
      .from('institution_memberships')
      .select('id, role, status')
      .eq('institution_id', institutionId)
      .eq('user_id', userId)
      .eq('role', 'student')
      .eq('status', 'active')
      .maybeSingle(),
    client
      .from('student_records')
      .select('id, student_code, full_name, email, membership_id, status')
      .eq('institution_id', institutionId)
      .eq('status', 'active'),
  ]);

  if (membershipRes.error) {
    throw new Error(membershipRes.error.message);
  }
  if (!membershipRes.data) {
    throw new Error('Active student membership is required to view assigned exams.');
  }
  const membershipData = membershipRes.data;
  if (studentsRes.error) {
    throw new Error(studentsRes.error.message);
  }

  const normalizedEmail = userEmail?.trim().toLowerCase() ?? null;
  const studentRecord = (studentsRes.data ?? []).find(
    (sr) =>
      sr.membership_id === membershipData.id ||
      (normalizedEmail !== null &&
        sr.email !== null &&
        sr.email.trim().toLowerCase() === normalizedEmail),
  );

  if (!studentRecord) {
    throw new Error(
      'Your account is not linked to an active student record in this institution.',
    );
  }

  const [enrollRes, classSecRes, examsRes, assignRes, versionsRes, attemptsRes] =
    await Promise.all([
      client
        .from('student_enrollments')
        .select('class_section_id, status')
        .eq('institution_id', institutionId)
        .eq('student_id', studentRecord.id)
        .eq('status', 'enrolled'),
      client.from('class_sections').select('id, class_id').eq('institution_id', institutionId),
      client
        .from('exams')
        .select('id, status, latest_published_version_id, starts_at')
        .eq('institution_id', institutionId)
        .in('status', ['published', 'closed'])
        .order('starts_at', { ascending: true }),
      client
        .from('exam_assignments')
        .select('exam_id, target_type, class_id, class_section_id, student_id')
        .eq('institution_id', institutionId),
      client
        .from('exam_versions')
        .select(
          'id, exam_id, version_number, title, description, course_id, course_code, course_title, starts_at, ends_at, duration_minutes, total_marks, passing_marks, passing_percentage, negative_marking_enabled, default_negative_marks, snapshot_payload',
        )
        .eq('institution_id', institutionId)
        .order('version_number', { ascending: false }),
      client
        .from('exam_attempts')
        .select(
          'id, exam_id, exam_version_id, status, started_at, expires_at, submitted_at, submission_reason, last_saved_at, answered_count, total_questions',
        )
        .eq('institution_id', institutionId)
        .eq('student_id', studentRecord.id),
    ]);

  for (const res of [
    enrollRes,
    classSecRes,
    examsRes,
    assignRes,
    versionsRes,
    attemptsRes,
  ]) {
    if (res.error) {
      throw new Error(res.error.message);
    }
  }

  const enrolledSectionIds = (enrollRes.data ?? []).map((e) => e.class_section_id);
  const sectionToClass = new Map((classSecRes.data ?? []).map((cs) => [cs.id, cs.class_id]));
  const enrolledClassIds = Array.from(
    new Set(
      enrolledSectionIds
        .map((sid) => sectionToClass.get(sid))
        .filter((cid): cid is string => Boolean(cid)),
    ),
  );

  const assignments = assignRes.data ?? [];
  const versionById = new Map((versionsRes.data ?? []).map((v) => [v.id, v]));
  const attemptByExam = new Map((attemptsRes.data ?? []).map((a) => [a.exam_id, a]));

  const resolveEligibility = (examId: string): 'student' | 'section' | 'class' | null => {
    const forExam = assignments.filter((a) => a.exam_id === examId);
    for (const a of forExam) {
      if (a.target_type === 'student' && a.student_id === studentRecord.id) {
        return 'student';
      }
    }
    for (const a of forExam) {
      if (
        a.target_type === 'section' &&
        a.class_section_id &&
        enrolledSectionIds.includes(a.class_section_id)
      ) {
        return 'section';
      }
    }
    for (const a of forExam) {
      if (a.target_type === 'class' && a.class_id && enrolledClassIds.includes(a.class_id)) {
        return 'class';
      }
    }
    return null;
  };

  const items: StudentExamSummaryItem[] = [];

  for (const exam of examsRes.data ?? []) {
    const eligibilityReason = resolveEligibility(exam.id);
    if (!eligibilityReason) continue;

    const att = attemptByExam.get(exam.id) ?? null;
    const versionId = att?.exam_version_id ?? exam.latest_published_version_id;
    if (!versionId) continue;

    const ver = versionById.get(versionId);
    if (!ver) continue;

    const snapshot = (ver.snapshot_payload ?? {}) as SnapshotPayloadSummary;
    const sectionCount = snapshot.sections?.length ?? 0;
    const totalQuestions = (snapshot.sections ?? []).reduce(
      (sum, sec) => sum + (sec.questions?.length ?? 0),
      0,
    );

    const isExpiredInProgress =
      att?.status === 'in_progress' &&
      Number.isFinite(Date.parse(att.expires_at)) &&
      nowMs > Date.parse(att.expires_at);

    const effectiveStatus: ExamAttemptStatus | null = att
      ? isExpiredInProgress
        ? 'auto_submitted'
        : att.status
      : null;

    const bucket = classifyStudentExamBucket({
      examStatus: exam.status,
      startsAt: ver.starts_at,
      endsAt: ver.ends_at,
      attemptStatus: att?.status ?? null,
      attemptExpiresAt: att?.expires_at ?? null,
      nowMs,
    });

    items.push({
      examId: exam.id,
      versionId: ver.id,
      versionNumber: ver.version_number,
      title: ver.title,
      description: ver.description,
      courseId: ver.course_id,
      courseCode: ver.course_code,
      courseTitle: ver.course_title,
      startsAt: ver.starts_at,
      endsAt: ver.ends_at,
      durationMinutes: ver.duration_minutes,
      totalMarks: Number(ver.total_marks),
      passingMarks: ver.passing_marks != null ? Number(ver.passing_marks) : null,
      passingPercentage: ver.passing_percentage != null ? Number(ver.passing_percentage) : null,
      negativeMarkingEnabled: ver.negative_marking_enabled,
      defaultNegativeMarks: Number(ver.default_negative_marks),
      totalQuestions,
      sectionCount,
      examStatus: exam.status,
      bucket,
      eligibilityReason,
      attempt:
        att && effectiveStatus
          ? {
              id: att.id,
              status: effectiveStatus,
              startedAt: att.started_at,
              expiresAt: att.expires_at,
              submittedAt:
                att.submitted_at ?? (isExpiredInProgress ? att.expires_at : null),
              submissionReason:
                att.submission_reason ??
                (isExpiredInProgress ? 'deadline_auto_submit' : null),
              lastSavedAt: att.last_saved_at,
              answeredCount: Number(att.answered_count ?? 0),
              totalQuestions: Number(att.total_questions || totalQuestions),
              remainingSeconds:
                effectiveStatus === 'in_progress'
                  ? computeRemainingSeconds(att.expires_at, nowMs)
                  : 0,
            }
          : null,
    });
  }

  const bucketRank: Record<StudentExamBucket, number> = {
    active: 0,
    upcoming: 1,
    completed: 2,
  };

  items.sort((a, b) => {
    const rankDiff = bucketRank[a.bucket] - bucketRank[b.bucket];
    if (rankDiff !== 0) return rankDiff;
    return Date.parse(a.startsAt) - Date.parse(b.startsAt);
  });

  return {
    serverNow: new Date(nowMs).toISOString(),
    student: {
      studentId: studentRecord.id,
      studentCode: studentRecord.student_code,
      fullName: studentRecord.full_name,
      email: studentRecord.email,
    },
    summary: {
      eligibleCount: items.length,
      activeCount: items.filter((i) => i.bucket === 'active').length,
      inProgressCount: items.filter((i) => i.attempt?.status === 'in_progress').length,
      upcomingCount: items.filter((i) => i.bucket === 'upcoming').length,
      completedCount: items.filter((i) => i.bucket === 'completed').length,
    },
    exams: items,
  };
}
