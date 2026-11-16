import type {
  ExamAttemptStatus,
  ExamStatus,
  QuestionDifficulty,
  QuestionType,
} from '@/integrations/supabase/types';
import {
  computeRemainingSeconds,
  isAnswerPopulated,
  seededShuffle,
  type ExamAttemptSessionData,
  type ExamHeartbeatResult,
  type SaveExamAnswerInput,
  type SaveExamAnswerResult,
  type StudentAttemptAnswerRecord,
  type StudentAttemptRecord,
  type StudentExamBucket,
  type StudentExamDashboardData,
  type StudentExamLobbyData,
  type StudentExamSummaryItem,
  type StudentIdentity,
  type StudentSafeExamAttachment,
  type StudentSafeExamOption,
  type StudentSafeExamQuestion,
  type StudentSafeExamSection,
  type SubmitExamAttemptResult,
} from './exam-engine.shared';
import type { ExamSnapshotPayload } from './exams.server';
import {
  AuthorizationError,
  verifyInstitutionAccess,
  type AuthedSupabase,
} from './workspace.server';

export * from './exam-engine.shared';

function sanitizeSnapshotForStudent(
  payload: ExamSnapshotPayload,
  attemptSeed: string,
): StudentSafeExamSection[] {
  const sections = [...(payload.sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return sections.map((sec) => {
    const rawQuestions = [...(sec.questions ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const orderedQuestions =
      payload.shuffleQuestions || sec.shuffle_questions
        ? seededShuffle(rawQuestions, `${attemptSeed}:sec:${sec.id}`)
        : rawQuestions;

    return {
      id: sec.id,
      title: sec.title,
      description: sec.description ?? null,
      section_type: sec.section_type,
      sort_order: sec.sort_order,
      shuffle_questions: sec.shuffle_questions,
      sectionTotalMarks: Number(sec.sectionTotalMarks ?? 0),
      questions: orderedQuestions.map((q) => {
        const qExtra = q as typeof q & {
          topic?: string;
          category?: string;
          difficulty?: QuestionDifficulty;
          attachments?: StudentSafeExamAttachment[];
        };
        const rawOptions = [...(q.options ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        const orderedOptions = payload.shuffleOptions
          ? seededShuffle(rawOptions, `${attemptSeed}:q:${q.id}`)
          : rawOptions;

        return {
          id: q.id,
          question_id: q.id,
          section_question_id: q.section_question_id,
          sort_order: q.sort_order,
          question_type: q.question_type,
          title: q.title,
          prompt: q.prompt,
          topic: qExtra.topic ?? 'General',
          category: qExtra.category ?? 'General',
          difficulty: qExtra.difficulty ?? 'medium',
          expected_word_count: q.expected_word_count ?? null,
          effective_marks: Number(q.effective_marks ?? 0),
          effective_negative_marks: Number(q.effective_negative_marks ?? 0),
          options: orderedOptions.map((opt) => ({
            id: opt.id,
            option_key: opt.option_key,
            option_text: opt.option_text,
            sort_order: opt.sort_order,
          })),
          attachments: (qExtra.attachments ?? []).map((att) => ({
            id: att.id,
            attachment_kind: att.attachment_kind,
            file_name: att.file_name,
            mime_type: att.mime_type,
            byte_size: att.byte_size,
            storage_path: att.storage_path,
            signedUrl: att.signedUrl ?? null,
          })),
        };
      }),
    };
  });
}

function countSnapshotQuestions(payload: ExamSnapshotPayload): number {
  return (payload.sections ?? []).reduce((sum, sec) => sum + (sec.questions?.length ?? 0), 0);
}

function mapAttemptRow(row: {
  id: string;
  institution_id: string;
  exam_id: string;
  exam_version_id: string;
  student_id: string;
  status: ExamAttemptStatus;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  submission_reason: string | null;
  last_saved_at: string | null;
  answered_count: number;
  total_questions: number;
}): StudentAttemptRecord {
  return {
    id: row.id,
    institutionId: row.institution_id,
    examId: row.exam_id,
    examVersionId: row.exam_version_id,
    studentId: row.student_id,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    submissionReason: row.submission_reason,
    lastSavedAt: row.last_saved_at,
    answeredCount: Number(row.answered_count ?? 0),
    totalQuestions: Number(row.total_questions ?? 0),
  };
}

function mapAnswerRow(row: {
  id: string;
  attempt_id: string;
  question_id: string;
  section_id: string;
  question_type: QuestionType;
  selected_option_keys: string[];
  descriptive_text: string | null;
  is_flagged: boolean;
  client_updated_at: string | null;
  revision: number;
  saved_at: string;
}): StudentAttemptAnswerRecord {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    questionId: row.question_id,
    sectionId: row.section_id,
    questionType: row.question_type,
    selectedOptionKeys: row.selected_option_keys ?? [],
    descriptiveText: row.descriptive_text ?? null,
    isFlagged: Boolean(row.is_flagged),
    clientUpdatedAt: row.client_updated_at ?? null,
    revision: Number(row.revision ?? 1),
    savedAt: row.saved_at,
  };
}

export async function resolveStudentIdentity(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
): Promise<StudentIdentity> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(
    supabase,
    userId,
    institutionId,
    ['student'],
  );

  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('A verified student membership is required to access student exams', 403);
  }

  if (!membership || membership.role !== 'student') {
    throw new AuthorizationError('Only students in this institution can access the examination portal', 403);
  }

  const [profileRes, studentsRes] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle(),
    supabase
      .from('student_records')
      .select('id, student_code, full_name, email, membership_id, status')
      .eq('institution_id', institutionId)
      .eq('status', 'active'),
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);
  if (studentsRes.error) throw new Error(studentsRes.error.message);

  const callerEmail = profileRes.data?.email?.toLowerCase() ?? null;
  const studentRecord = (studentsRes.data ?? []).find(
    (sr) =>
      sr.membership_id === membership.id ||
      (callerEmail !== null && sr.email !== null && sr.email.toLowerCase() === callerEmail),
  );

  if (!studentRecord) {
    throw new AuthorizationError(
      'Your account is not linked to an active student roster record in this institution.',
      403,
    );
  }

  const [enrollRes, classSecRes] = await Promise.all([
    supabase
      .from('student_enrollments')
      .select('class_section_id, status')
      .eq('institution_id', institutionId)
      .eq('student_id', studentRecord.id)
      .eq('status', 'enrolled'),
    supabase.from('class_sections').select('id, class_id').eq('institution_id', institutionId),
  ]);

  if (enrollRes.error) throw new Error(enrollRes.error.message);
  if (classSecRes.error) throw new Error(classSecRes.error.message);

  const enrolledSectionIds = (enrollRes.data ?? []).map((e) => e.class_section_id);
  const sectionClassMap = new Map((classSecRes.data ?? []).map((cs) => [cs.id, cs.class_id]));
  const enrolledClassIds = Array.from(
    new Set(
      enrolledSectionIds
        .map((sid) => sectionClassMap.get(sid))
        .filter((cid): cid is string => Boolean(cid)),
    ),
  );

  return {
    userId,
    institutionId,
    membershipId: membership.id,
    studentId: studentRecord.id,
    studentCode: studentRecord.student_code,
    fullName: studentRecord.full_name,
    email: studentRecord.email,
    enrolledSectionIds,
    enrolledClassIds,
  };
}

function getEligibilityReasonForExam(
  identity: StudentIdentity,
  assignments: Array<{
    exam_id: string;
    target_type: string;
    class_id: string | null;
    class_section_id: string | null;
    student_id: string | null;
  }>,
  examId: string,
): 'student' | 'section' | 'class' | null {
  const examAssigns = assignments.filter((a) => a.exam_id === examId);
  for (const a of examAssigns) {
    if (a.target_type === 'student' && a.student_id === identity.studentId) {
      return 'student';
    }
  }
  for (const a of examAssigns) {
    if (
      a.target_type === 'section' &&
      a.class_section_id &&
      identity.enrolledSectionIds.includes(a.class_section_id)
    ) {
      return 'section';
    }
  }
  for (const a of examAssigns) {
    if (a.target_type === 'class' && a.class_id && identity.enrolledClassIds.includes(a.class_id)) {
      return 'class';
    }
  }
  return null;
}

async function computeAuthoritativeAnsweredCount(
  supabase: AuthedSupabase,
  institutionId: string,
  attemptId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('exam_attempt_answers')
    .select('question_type, selected_option_keys, descriptive_text')
    .eq('institution_id', institutionId)
    .eq('attempt_id', attemptId);

  if (error) throw new Error(error.message);

  let count = 0;
  for (const row of data ?? []) {
    if (
      isAnswerPopulated(
        row.question_type,
        row.selected_option_keys ?? [],
        row.descriptive_text ?? null,
      )
    ) {
      count++;
    }
  }
  return count;
}

async function reconcileExpiredAttemptIfNeeded(
  supabase: AuthedSupabase,
  attempt: {
    id: string;
    institution_id: string;
    exam_id: string;
    exam_version_id: string;
    student_id: string;
    user_id: string;
    membership_id: string;
    status: ExamAttemptStatus;
    started_at: string;
    expires_at: string;
    submitted_at: string | null;
    submission_reason: string | null;
    submission_idempotency_key: string | null;
    last_saved_at: string | null;
    question_order_seed: string;
    answered_count: number;
    total_questions: number;
    created_at: string;
    updated_at: string;
  },
  nowMs: number,
) {
  if (attempt.status !== 'in_progress') return attempt;
  const expiresMs = Date.parse(attempt.expires_at);
  if (!Number.isFinite(expiresMs) || nowMs <= expiresMs) return attempt;

  const answeredCount = await computeAuthoritativeAnsweredCount(
    supabase,
    attempt.institution_id,
    attempt.id,
  );

  const { data: updated, error } = await supabase
    .from('exam_attempts')
    .update({
      status: 'auto_submitted',
      submitted_at: attempt.expires_at,
      submission_reason: 'deadline_auto_submit',
      answered_count: answeredCount,
    })
    .eq('id', attempt.id)
    .eq('institution_id', attempt.institution_id)
    .eq('status', 'in_progress')
    .select('*')
    .maybeSingle();

  if (error) {
    // Re-fetch in case concurrent request already committed
    const { data: refetched } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('id', attempt.id)
      .eq('institution_id', attempt.institution_id)
      .maybeSingle();
    if (refetched) return refetched;
    throw new Error(error.message);
  }

  if (updated) return updated;

  const { data: committed, error: refetchErr } = await supabase
    .from('exam_attempts')
    .select('*')
    .eq('id', attempt.id)
    .eq('institution_id', attempt.institution_id)
    .single();
  if (refetchErr || !committed) throw new Error(refetchErr?.message ?? 'Attempt not found');
  return committed;
}

export async function loadStudentExamDashboard(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  nowMs = Date.now(),
): Promise<StudentExamDashboardData> {
  const identity = await resolveStudentIdentity(supabase, userId, institutionId);

  const [examsRes, assignRes, versionsRes, attemptsRes] = await Promise.all([
    supabase
      .from('exams')
      .select('*')
      .eq('institution_id', institutionId)
      .in('status', ['published', 'closed'])
      .order('starts_at', { ascending: true }),
    supabase
      .from('exam_assignments')
      .select('exam_id, target_type, class_id, class_section_id, student_id')
      .eq('institution_id', institutionId),
    supabase
      .from('exam_versions')
      .select('*')
      .eq('institution_id', institutionId)
      .order('version_number', { ascending: false }),
    supabase
      .from('exam_attempts')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('student_id', identity.studentId),
  ]);

  for (const res of [examsRes, assignRes, versionsRes, attemptsRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const versionById = new Map((versionsRes.data ?? []).map((v) => [v.id, v]));
  const rawAttempts = attemptsRes.data ?? [];
  const attemptByExam = new Map<string, (typeof rawAttempts)[number]>();

  for (const att of rawAttempts) {
    const reconciled = await reconcileExpiredAttemptIfNeeded(supabase, att, nowMs);
    attemptByExam.set(reconciled.exam_id, reconciled);
  }

  const items: StudentExamSummaryItem[] = [];
  for (const exam of examsRes.data ?? []) {
    const reason = getEligibilityReasonForExam(identity, assignRes.data ?? [], exam.id);
    if (!reason) continue;

    const existingAttempt = attemptByExam.get(exam.id) ?? null;
    const versionId = existingAttempt?.exam_version_id ?? exam.latest_published_version_id;
    if (!versionId) continue;

    const ver = versionById.get(versionId);
    if (!ver) continue;

    const snapshot = ver.snapshot_payload as unknown as ExamSnapshotPayload;
    const totalQuestions = countSnapshotQuestions(snapshot);
    const sectionCount = snapshot.sections?.length ?? 0;

    const startsMs = Date.parse(ver.starts_at);
    const endsMs = Date.parse(ver.ends_at);

    let bucket: StudentExamBucket;
    if (
      existingAttempt &&
      (existingAttempt.status === 'submitted' || existingAttempt.status === 'auto_submitted')
    ) {
      bucket = 'completed';
    } else if (exam.status === 'closed' || (Number.isFinite(endsMs) && nowMs >= endsMs)) {
      bucket = 'completed';
    } else if (Number.isFinite(startsMs) && nowMs < startsMs) {
      bucket = 'upcoming';
    } else {
      bucket = 'active';
    }

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
      eligibilityReason: reason,
      attempt: existingAttempt
        ? {
            id: existingAttempt.id,
            status: existingAttempt.status,
            startedAt: existingAttempt.started_at,
            expiresAt: existingAttempt.expires_at,
            submittedAt: existingAttempt.submitted_at,
            submissionReason: existingAttempt.submission_reason,
            lastSavedAt: existingAttempt.last_saved_at,
            answeredCount: existingAttempt.answered_count,
            totalQuestions: existingAttempt.total_questions || totalQuestions,
            remainingSeconds:
              existingAttempt.status === 'in_progress'
                ? computeRemainingSeconds(existingAttempt.expires_at, nowMs)
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
    const r = bucketRank[a.bucket] - bucketRank[b.bucket];
    if (r !== 0) return r;
    return Date.parse(a.startsAt) - Date.parse(b.startsAt);
  });

  return {
    serverNow: new Date(nowMs).toISOString(),
    student: {
      studentId: identity.studentId,
      studentCode: identity.studentCode,
      fullName: identity.fullName,
      email: identity.email,
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

async function loadEligibleExamAndVersionForStudent(
  supabase: AuthedSupabase,
  identity: StudentIdentity,
  institutionId: string,
  examId: string,
) {
  const [examRes, assignRes, existingAttRes] = await Promise.all([
    supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    supabase
      .from('exam_assignments')
      .select('exam_id, target_type, class_id, class_section_id, student_id')
      .eq('institution_id', institutionId)
      .eq('exam_id', examId),
    supabase
      .from('exam_attempts')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('exam_id', examId)
      .eq('student_id', identity.studentId)
      .maybeSingle(),
  ]);

  if (examRes.error) throw new Error(examRes.error.message);
  if (assignRes.error) throw new Error(assignRes.error.message);
  if (existingAttRes.error) throw new Error(existingAttRes.error.message);

  const exam = examRes.data;
  if (!exam || (exam.status !== 'published' && exam.status !== 'closed')) {
    throw new AuthorizationError('Exam is not available to students', 403);
  }

  const eligibility = getEligibilityReasonForExam(identity, assignRes.data ?? [], examId);
  if (!eligibility) {
    throw new AuthorizationError('You are not assigned or eligible to take this exam', 403);
  }

  const targetVersionId =
    existingAttRes.data?.exam_version_id ?? exam.latest_published_version_id;
  if (!targetVersionId) {
    throw new AuthorizationError('Exam has no published snapshot version', 403);
  }

  const { data: version, error: verErr } = await supabase
    .from('exam_versions')
    .select('*')
    .eq('id', targetVersionId)
    .eq('exam_id', examId)
    .eq('institution_id', institutionId)
    .maybeSingle();

  if (verErr) throw new Error(verErr.message);
  if (!version) {
    throw new AuthorizationError('Published exam version could not be loaded', 404);
  }

  return {
    exam,
    version,
    existingAttempt: existingAttRes.data ?? null,
    snapshot: version.snapshot_payload as unknown as ExamSnapshotPayload,
  };
}

function buildLobbyExamMeta(
  examStatus: ExamStatus,
  version: {
    id: string;
    exam_id: string;
    version_number: number;
    title: string;
    description: string | null;
    instructions: string | null;
    course_code: string | null;
    course_title: string | null;
    starts_at: string;
    ends_at: string;
    duration_minutes: number;
    total_marks: number;
    passing_marks: number | null;
    passing_percentage: number | null;
    negative_marking_enabled: boolean;
    default_negative_marks: number;
    shuffle_questions: boolean;
    shuffle_options: boolean;
  },
  snapshot: ExamSnapshotPayload,
): StudentExamLobbyData['exam'] {
  return {
    examId: version.exam_id,
    versionId: version.id,
    versionNumber: version.version_number,
    title: version.title,
    description: version.description,
    instructions: version.instructions,
    courseCode: version.course_code,
    courseTitle: version.course_title,
    startsAt: version.starts_at,
    endsAt: version.ends_at,
    durationMinutes: version.duration_minutes,
    totalMarks: Number(version.total_marks),
    passingMarks: version.passing_marks != null ? Number(version.passing_marks) : null,
    passingPercentage: version.passing_percentage != null ? Number(version.passing_percentage) : null,
    negativeMarkingEnabled: version.negative_marking_enabled,
    defaultNegativeMarks: Number(version.default_negative_marks),
    shuffleQuestions: version.shuffle_questions,
    shuffleOptions: version.shuffle_options,
    sectionCount: snapshot.sections?.length ?? 0,
    totalQuestions: countSnapshotQuestions(snapshot),
    examStatus,
  };
}

export async function getStudentExamLobby(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId: string,
  nowMs = Date.now(),
): Promise<StudentExamLobbyData> {
  const identity = await resolveStudentIdentity(supabase, userId, institutionId);
  const { exam, version, existingAttempt, snapshot } = await loadEligibleExamAndVersionForStudent(
    supabase,
    identity,
    institutionId,
    examId,
  );

  const reconciledAttempt = existingAttempt
    ? await reconcileExpiredAttemptIfNeeded(supabase, existingAttempt, nowMs)
    : null;

  const startsMs = Date.parse(version.starts_at);
  const endsMs = Date.parse(version.ends_at);
  const isCompleted = Boolean(
    reconciledAttempt &&
      (reconciledAttempt.status === 'submitted' || reconciledAttempt.status === 'auto_submitted'),
  );
  const canResume = Boolean(reconciledAttempt && reconciledAttempt.status === 'in_progress');

  let canStart = false;
  let blockReason: string | null = null;

  if (isCompleted) {
    blockReason = 'You have already submitted this exam.';
  } else if (canResume) {
    canStart = false;
  } else if (exam.status !== 'published') {
    blockReason = 'This exam is closed and no longer accepts new attempts.';
  } else if (Number.isFinite(startsMs) && nowMs < startsMs) {
    blockReason = `This exam opens on ${new Date(version.starts_at).toLocaleString()}.`;
  } else if (Number.isFinite(endsMs) && nowMs >= endsMs) {
    blockReason = 'The availability window for this exam has ended.';
  } else {
    canStart = true;
  }

  return {
    serverNow: new Date(nowMs).toISOString(),
    exam: buildLobbyExamMeta(exam.status, version, snapshot),
    attempt: reconciledAttempt ? mapAttemptRow(reconciledAttempt) : null,
    canStart,
    canResume,
    isCompleted,
    blockReason,
    remainingSeconds:
      reconciledAttempt && reconciledAttempt.status === 'in_progress'
        ? computeRemainingSeconds(reconciledAttempt.expires_at, nowMs)
        : 0,
  };
}

export async function startOrResumeExamAttempt(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId: string,
  nowMs = Date.now(),
): Promise<ExamAttemptSessionData> {
  const identity = await resolveStudentIdentity(supabase, userId, institutionId);
  const { exam, version, existingAttempt, snapshot } = await loadEligibleExamAndVersionForStudent(
    supabase,
    identity,
    institutionId,
    examId,
  );

  let attemptRow = existingAttempt
    ? await reconcileExpiredAttemptIfNeeded(supabase, existingAttempt, nowMs)
    : null;

  if (!attemptRow) {
    if (exam.status !== 'published') {
      throw new AuthorizationError('Exam is not open for starting attempts', 403);
    }

    const startsMs = Date.parse(version.starts_at);
    const endsMs = Date.parse(version.ends_at);
    if (Number.isFinite(startsMs) && nowMs < startsMs) {
      throw new AuthorizationError('Exam availability window has not started yet', 403);
    }
    if (Number.isFinite(endsMs) && nowMs >= endsMs) {
      throw new AuthorizationError('Exam availability window has closed', 403);
    }

    const totalQuestions = countSnapshotQuestions(snapshot);
    const startedAtIso = new Date(nowMs).toISOString();
    const rawExpiryMs = nowMs + version.duration_minutes * 60_000;
    const boundedExpiryMs = Number.isFinite(endsMs) ? Math.min(rawExpiryMs, endsMs) : rawExpiryMs;
    const expiresAtIso = new Date(boundedExpiryMs).toISOString();
    const orderSeed = `${examId}:${identity.studentId}:${version.id}`;

    const { data: inserted, error: insErr } = await supabase
      .from('exam_attempts')
      .insert({
        institution_id: institutionId,
        exam_id: examId,
        exam_version_id: version.id,
        student_id: identity.studentId,
        user_id: userId,
        membership_id: identity.membershipId,
        status: 'in_progress',
        started_at: startedAtIso,
        expires_at: expiresAtIso,
        question_order_seed: orderSeed,
        answered_count: 0,
        total_questions: totalQuestions,
      })
      .select('*')
      .single();

    if (insErr) {
      // Handle concurrent duplicate-start click safely via unique constraint recovery
      if (insErr.code === '23505' || insErr.message.toLowerCase().includes('duplicate')) {
        const { data: raced, error: raceErr } = await supabase
          .from('exam_attempts')
          .select('*')
          .eq('institution_id', institutionId)
          .eq('exam_id', examId)
          .eq('student_id', identity.studentId)
          .single();
        if (raceErr || !raced) throw new Error(raceErr?.message ?? insErr.message);
        attemptRow = await reconcileExpiredAttemptIfNeeded(supabase, raced, nowMs);
      } else {
        throw new Error(insErr.message);
      }
    } else if (!inserted) {
      throw new Error('Failed to create exam attempt');
    } else {
      attemptRow = inserted;
    }
  }

  const { data: ansRows, error: ansErr } = await supabase
    .from('exam_attempt_answers')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('attempt_id', attemptRow.id);

  if (ansErr) throw new Error(ansErr.message);

  const answersMap: Record<string, StudentAttemptAnswerRecord> = {};
  for (const row of ansRows ?? []) {
    answersMap[row.question_id] = mapAnswerRow(row);
  }

  const sections = sanitizeSnapshotForStudent(snapshot, attemptRow.question_order_seed);

  return {
    serverNow: new Date(nowMs).toISOString(),
    remainingSeconds:
      attemptRow.status === 'in_progress'
        ? computeRemainingSeconds(attemptRow.expires_at, nowMs)
        : 0,
    exam: buildLobbyExamMeta(exam.status, version, snapshot),
    attempt: mapAttemptRow(attemptRow),
    sections,
    answers: answersMap,
  };
}

export async function saveExamAttemptAnswer(
  supabase: AuthedSupabase,
  userId: string,
  input: SaveExamAnswerInput,
  nowMs = Date.now(),
): Promise<SaveExamAnswerResult> {
  const identity = await resolveStudentIdentity(supabase, userId, input.institutionId);

  const { data: attempt, error: attErr } = await supabase
    .from('exam_attempts')
    .select('*')
    .eq('id', input.attemptId)
    .eq('institution_id', input.institutionId)
    .maybeSingle();

  if (attErr) throw new Error(attErr.message);
  if (!attempt || attempt.student_id !== identity.studentId || attempt.user_id !== userId) {
    throw new AuthorizationError('Exam attempt not found or access denied', 403);
  }

  if (attempt.status !== 'in_progress') {
    throw new AuthorizationError('Attempt has already been submitted and answers are locked', 409);
  }

  const expiresMs = Date.parse(attempt.expires_at);
  if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
    const finalized = await reconcileExpiredAttemptIfNeeded(supabase, attempt, nowMs);
    return {
      status: 'expired_auto_submitted',
      serverNow: new Date(nowMs).toISOString(),
      remainingSeconds: 0,
      attempt: mapAttemptRow(finalized),
    };
  }

  const { data: version, error: verErr } = await supabase
    .from('exam_versions')
    .select('id, snapshot_payload')
    .eq('id', attempt.exam_version_id)
    .eq('institution_id', input.institutionId)
    .maybeSingle();

  if (verErr) throw new Error(verErr.message);
  if (!version) throw new AuthorizationError('Published exam snapshot missing', 404);

  const snapshot = version.snapshot_payload as unknown as ExamSnapshotPayload;
  let targetSectionId: string | null = null;
  let targetQuestion:
    | {
        id: string;
        question_type: QuestionType;
        options?: Array<{ option_key: string }>;
      }
    | null = null;

  for (const sec of snapshot.sections ?? []) {
    const found = (sec.questions ?? []).find((q) => q.id === input.questionId);
    if (found) {
      targetSectionId = sec.id;
      targetQuestion = found;
      break;
    }
  }

  if (!targetQuestion || !targetSectionId) {
    throw new AuthorizationError('Question does not belong to this exam attempt', 400);
  }

  // Validate response payload strictly against question type & valid options
  let cleanOptionKeys: string[] = [];
  let cleanDescriptiveText: string | null = null;

  if (
    targetQuestion.question_type === 'mcq_single' ||
    targetQuestion.question_type === 'mcq_multi'
  ) {
    const validKeys = new Set((targetQuestion.options ?? []).map((o) => o.option_key));
    const deduped = Array.from(new Set(input.selectedOptionKeys ?? [])).filter((k) =>
      validKeys.has(k),
    );
    if (deduped.length !== new Set(input.selectedOptionKeys ?? []).size) {
      throw new AuthorizationError('Invalid option selection submitted for question', 400);
    }
    if (targetQuestion.question_type === 'mcq_single' && deduped.length > 1) {
      throw new AuthorizationError('Single-choice question accepts at most one selected option', 400);
    }
    cleanOptionKeys = deduped;
  } else {
    const raw = input.descriptiveText ?? null;
    if (raw !== null && raw.length > 50000) {
      throw new AuthorizationError('Descriptive answer exceeds 50,000 character limit', 400);
    }
    cleanDescriptiveText = raw;
  }

  const { data: existingAnswer, error: exAnsErr } = await supabase
    .from('exam_attempt_answers')
    .select('*')
    .eq('institution_id', input.institutionId)
    .eq('attempt_id', attempt.id)
    .eq('question_id', input.questionId)
    .maybeSingle();

  if (exAnsErr) throw new Error(exAnsErr.message);

  // Protect against stale out-of-order concurrent requests overwriting newer edits
  if (existingAnswer && input.clientUpdatedAt && existingAnswer.client_updated_at) {
    const incomingClientMs = Date.parse(input.clientUpdatedAt);
    const existingClientMs = Date.parse(existingAnswer.client_updated_at);
    if (
      Number.isFinite(incomingClientMs) &&
      Number.isFinite(existingClientMs) &&
      existingClientMs > incomingClientMs
    ) {
      return {
        status: 'saved',
        serverNow: new Date(nowMs).toISOString(),
        remainingSeconds: computeRemainingSeconds(attempt.expires_at, nowMs),
        answeredCount: attempt.answered_count,
        staleIgnored: true,
        answer: mapAnswerRow(existingAnswer),
      };
    }
  }

  const savedAtIso = new Date(nowMs).toISOString();
  const nextFlagged =
    input.isFlagged !== undefined ? input.isFlagged : existingAnswer?.is_flagged ?? false;

  const { data: savedRow, error: saveErr } = await supabase
    .from('exam_attempt_answers')
    .upsert(
      {
        institution_id: input.institutionId,
        attempt_id: attempt.id,
        exam_id: attempt.exam_id,
        student_id: identity.studentId,
        question_id: input.questionId,
        section_id: targetSectionId,
        question_type: targetQuestion.question_type,
        selected_option_keys: cleanOptionKeys,
        descriptive_text: cleanDescriptiveText,
        is_flagged: nextFlagged,
        client_updated_at: input.clientUpdatedAt ?? savedAtIso,
        revision: existingAnswer ? existingAnswer.revision + 1 : 1,
        saved_at: savedAtIso,
      },
      { onConflict: 'attempt_id,question_id' },
    )
    .select('*')
    .single();

  if (saveErr || !savedRow) {
    throw new Error(saveErr?.message ?? 'Failed to save exam answer');
  }

  const answeredCount = await computeAuthoritativeAnsweredCount(
    supabase,
    input.institutionId,
    attempt.id,
  );

  // Best-effort update of answered_count / last_saved_at (ignored if attempt closed concurrently)
  await supabase
    .from('exam_attempts')
    .update({
      last_saved_at: savedAtIso,
      answered_count: answeredCount,
    })
    .eq('id', attempt.id)
    .eq('institution_id', input.institutionId)
    .eq('status', 'in_progress');

  return {
    status: 'saved',
    serverNow: savedAtIso,
    remainingSeconds: computeRemainingSeconds(attempt.expires_at, nowMs),
    answeredCount,
    staleIgnored: false,
    answer: mapAnswerRow(savedRow),
  };
}

export async function submitExamAttempt(
  supabase: AuthedSupabase,
  userId: string,
  input: {
    institutionId: string;
    attemptId: string;
    reason?: 'manual' | 'deadline_auto_submit' | undefined;
    idempotencyKey?: string | undefined;
  },
  nowMs = Date.now(),
): Promise<SubmitExamAttemptResult> {
  const identity = await resolveStudentIdentity(supabase, userId, input.institutionId);

  const { data: attempt, error: attErr } = await supabase
    .from('exam_attempts')
    .select('*')
    .eq('id', input.attemptId)
    .eq('institution_id', input.institutionId)
    .maybeSingle();

  if (attErr) throw new Error(attErr.message);
  if (!attempt || attempt.student_id !== identity.studentId || attempt.user_id !== userId) {
    throw new AuthorizationError('Exam attempt not found or access denied', 403);
  }

  // Idempotent return when already submitted
  if (attempt.status !== 'in_progress') {
    return {
      serverNow: new Date(nowMs).toISOString(),
      alreadySubmitted: true,
      attempt: mapAttemptRow(attempt),
    };
  }

  const answeredCount = await computeAuthoritativeAnsweredCount(
    supabase,
    input.institutionId,
    attempt.id,
  );

  const expiresMs = Date.parse(attempt.expires_at);
  const pastDeadline = Number.isFinite(expiresMs) && nowMs > expiresMs;
  const finalStatus: ExamAttemptStatus =
    pastDeadline || input.reason === 'deadline_auto_submit' ? 'auto_submitted' : 'submitted';
  const submittedAt = pastDeadline ? attempt.expires_at : new Date(nowMs).toISOString();
  const reason = pastDeadline
    ? 'deadline_auto_submit'
    : (input.reason ?? 'manual');

  const { data: committed, error: updErr } = await supabase
    .from('exam_attempts')
    .update({
      status: finalStatus,
      submitted_at: submittedAt,
      submission_reason: reason,
      submission_idempotency_key: input.idempotencyKey ?? null,
      answered_count: answeredCount,
    })
    .eq('id', attempt.id)
    .eq('institution_id', input.institutionId)
    .eq('status', 'in_progress')
    .select('*')
    .maybeSingle();

  if (updErr) {
    // Handle concurrent submit race cleanly
    const { data: raced } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('id', attempt.id)
      .eq('institution_id', input.institutionId)
      .maybeSingle();
    if (raced && raced.status !== 'in_progress') {
      return {
        serverNow: new Date(nowMs).toISOString(),
        alreadySubmitted: true,
        attempt: mapAttemptRow(raced),
      };
    }
    throw new Error(updErr.message);
  }

  if (!committed) {
    const { data: raced, error: raceErr } = await supabase
      .from('exam_attempts')
      .select('*')
      .eq('id', attempt.id)
      .eq('institution_id', input.institutionId)
      .single();
    if (raceErr || !raced) throw new Error(raceErr?.message ?? 'Attempt not found');
    return {
      serverNow: new Date(nowMs).toISOString(),
      alreadySubmitted: true,
      attempt: mapAttemptRow(raced),
    };
  }

  return {
    serverNow: new Date(nowMs).toISOString(),
    alreadySubmitted: false,
    attempt: mapAttemptRow(committed),
  };
}

export async function heartbeatExamAttempt(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  attemptId: string,
  nowMs = Date.now(),
): Promise<ExamHeartbeatResult> {
  const identity = await resolveStudentIdentity(supabase, userId, institutionId);

  const { data: attempt, error } = await supabase
    .from('exam_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('institution_id', institutionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!attempt || attempt.student_id !== identity.studentId || attempt.user_id !== userId) {
    throw new AuthorizationError('Exam attempt not found or access denied', 403);
  }

  const reconciled = await reconcileExpiredAttemptIfNeeded(supabase, attempt, nowMs);

  return {
    serverNow: new Date(nowMs).toISOString(),
    remainingSeconds:
      reconciled.status === 'in_progress'
        ? computeRemainingSeconds(reconciled.expires_at, nowMs)
        : 0,
    attempt: mapAttemptRow(reconciled),
  };
}
