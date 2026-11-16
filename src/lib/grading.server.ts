import type { QuestionType } from '@/integrations/supabase/types';
import type { ExamSnapshotPayload } from './exams.server';
import {
  AuthorizationError,
  verifyInstitutionAccess,
  type AuthedSupabase,
} from './workspace.server';
import type {
  ExamAnalyticsData,
  ExamGradeStatus,
  StudentResultDetailItem,
  StudentResultReport,
  TeacherAttemptGradingRow,
  TeacherExamGradingDashboardData,
  TeacherAttemptGradingDetail,
  TeacherAttemptQuestionDetail,
} from './grading.shared';

export * from './grading.shared';

type AnswerKeyPayload = {
  questions?: Record<
    string,
    {
      correct_option_keys?: string[];
      sample_answer?: string | null;
      grading_rubric?: string | null;
    }
  >;
};

export async function calculateAttemptGrades(
  supabase: AuthedSupabase,
  institutionId: string,
  attemptId: string,
): Promise<{ totalAwarded: number; maxPossible: number; percentage: number; isPassing: boolean }> {
  const [attemptRes, answersRes] = await Promise.all([
    (supabase as any)
      .from('exam_attempts')
      .select('id, exam_id, exam_version_id, student_id')
      .eq('id', attemptId)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    (supabase as any)
      .from('exam_attempt_answers')
      .select('question_id, question_type, selected_option_keys, descriptive_text')
      .eq('attempt_id', attemptId)
      .eq('institution_id', institutionId),
  ]);

  if (attemptRes.error || !attemptRes.data) {
    throw new Error(attemptRes.error?.message ?? 'Attempt not found for grading');
  }
  if (answersRes.error) {
    throw new Error(answersRes.error.message);
  }

  const attempt = attemptRes.data as any;
  const answers = (answersRes.data ?? []) as any[];

  const [versionRes, examRes, existingGradesRes, answerKeysRes] = await Promise.all([
    (supabase as any)
      .from('exam_versions')
      .select('snapshot_passing_marks, snapshot_passing_percentage, snapshot_payload')
      .eq('id', attempt.exam_version_id)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    (supabase as any)
      .from('exams')
      .select('passing_marks, passing_percentage')
      .eq('id', attempt.exam_id)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    (supabase as any)
      .from('exam_question_grades')
      .select('question_id, awarded_marks, negative_deduction, is_correct, teacher_feedback, rubric_breakdown, graded_by')
      .eq('attempt_id', attemptId)
      .eq('institution_id', institutionId),
    (supabase as any)
      .from('exam_version_answer_keys')
      .select('keys_payload')
      .eq('version_id', attempt.exam_version_id)
      .eq('institution_id', institutionId)
      .maybeSingle(),
  ]);

  const versionData = versionRes.data as any;
  const examData = examRes.data as any;
  const existingQGradesMap = new Map((existingGradesRes.data ?? []).map((q: any) => [q.question_id, q]));
  const explicitKeys = (answerKeysRes.data?.keys_payload ?? {}) as AnswerKeyPayload;

  const snapshot = versionData?.snapshot_payload as unknown as ExamSnapshotPayload;
  if (!snapshot || !snapshot.sections) {
    throw new Error('Exam snapshot payload is missing or invalid for grading');
  }

  let totalAwarded = 0;
  let maxPossible = 0;

  const qGradesUpsert: Array<any> = [];

  for (const sec of snapshot.sections) {
    for (const q of sec.questions ?? []) {
      const qId = q.id;
      const qMarks = Number(q.effective_marks ?? 1);
      const qNegMarks = Number(q.effective_negative_marks ?? 0);
      maxPossible += qMarks;

      const studentAns = answers.find((a: any) => a.question_id === qId);
      const existing = existingQGradesMap.get(qId) as any;

      let awarded = existing?.awarded_marks != null ? Number(existing.awarded_marks) : 0;
      let negDeduction = existing?.negative_deduction != null ? Number(existing.negative_deduction) : 0;
      let isCorrect: boolean | null = existing?.is_correct ?? null;

      const isMcq = q.question_type === 'mcq_single' || q.question_type === 'mcq_multi';

      if (isMcq) {
        const correctKeys = explicitKeys.questions?.[qId]?.correct_option_keys ?? [];
        const studentKeys = studentAns?.selected_option_keys ?? studentAns?.selectedOptionKeys ?? [];

        const isExactMatch =
          correctKeys.length > 0 &&
          correctKeys.length === studentKeys.length &&
          correctKeys.every((k) => studentKeys.includes(k));

        if (isExactMatch) {
          awarded = qMarks;
          negDeduction = 0;
          isCorrect = true;
        } else {
          isCorrect = false;
          if (studentKeys.length > 0 && qNegMarks > 0) {
            negDeduction = qNegMarks;
            awarded = Math.max(0, -qNegMarks);
          } else {
            awarded = 0;
            negDeduction = 0;
          }
        }
      } else {
        if (!existing) {
          awarded = 0;
          isCorrect = null;
        }
      }

      totalAwarded += awarded;

      qGradesUpsert.push({
        institution_id: institutionId,
        attempt_id: attemptId,
        question_id: qId,
        max_marks: qMarks,
        awarded_marks: awarded,
        negative_deduction: negDeduction,
        is_correct: isCorrect,
        teacher_feedback: existing?.teacher_feedback ?? null,
        rubric_breakdown: (existing?.rubric_breakdown ?? {}) as Record<string, unknown>,
      });
    }
  }

  const percentage = maxPossible > 0 ? Number(((totalAwarded / maxPossible) * 100).toFixed(2)) : 0;
  const passingMarks = versionData?.snapshot_passing_marks ?? examData?.passing_marks ?? null;
  const passingPercentage = versionData?.snapshot_passing_percentage ?? examData?.passing_percentage ?? null;

  let isPassing = false;
  if (passingMarks != null) {
    isPassing = totalAwarded >= Number(passingMarks);
  } else if (passingPercentage != null) {
    isPassing = percentage >= Number(passingPercentage);
  } else {
    isPassing = percentage >= 50;
  }

  for (const qg of qGradesUpsert) {
    await (supabase as any).from('exam_question_grades').upsert(qg, { onConflict: 'attempt_id,question_id' });
  }

  await (supabase as any).from('exam_attempt_grades').upsert(
    {
      institution_id: institutionId,
      exam_id: attempt.exam_id,
      exam_version_id: attempt.exam_version_id,
      attempt_id: attemptId,
      student_id: attempt.student_id,
      total_awarded_marks: totalAwarded,
      max_possible_marks: maxPossible,
      percentage,
      is_passing: isPassing,
    },
    { onConflict: 'institution_id,attempt_id' },
  );

  return { totalAwarded, maxPossible, percentage, isPassing };
}

export async function loadTeacherExamGradingDashboard(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId: string,
): Promise<TeacherExamGradingDashboardData> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Educator access required to grade exams', 403);
  }

  const [examRes, attemptsRes, gradesRes, versionRes] = await Promise.all([
    (supabase as any).from('exams').select('*').eq('id', examId).eq('institution_id', institutionId).maybeSingle(),
    (supabase as any)
      .from('exam_attempts')
      .select('id, student_id, status, started_at, submitted_at, total_questions')
      .eq('exam_id', examId)
      .eq('institution_id', institutionId),
    (supabase as any)
      .from('exam_attempt_grades')
      .select('attempt_id, status, total_awarded_marks, max_possible_marks, percentage, is_passing')
      .eq('exam_id', examId)
      .eq('institution_id', institutionId),
    (supabase as any)
      .from('exam_versions')
      .select('id, title, course_code, course_title, total_marks, passing_marks, passing_percentage, negative_marking_enabled, default_negative_marks')
      .eq('exam_id', examId)
      .eq('institution_id', institutionId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (examRes.error || !examRes.data) throw new Error('Exam not found');
  if (attemptsRes.error) throw new Error(attemptsRes.error.message);
  if (gradesRes.error) throw new Error(gradesRes.error.message);

  const exam = examRes.data as any;
  const attempts = (attemptsRes.data ?? []) as any[];
  const gradesMap = new Map((gradesRes.data ?? []).map((g: any) => [g.attempt_id, g]));
  const version = versionRes.data as any;

  const studentIds = attempts.map((a) => a.student_id);
  const studentsRes = studentIds.length > 0
    ? await (supabase as any)
        .from('student_records')
        .select('id, student_code, full_name, email')
        .in('id', studentIds)
    : { data: [] };

  const studentMap = new Map((studentsRes.data ?? []).map((s: any) => [s.id, s]));

  for (const att of attempts) {
    if ((att.status === 'submitted' || att.status === 'auto_submitted') && !gradesMap.has(att.id)) {
      try {
        await calculateAttemptGrades(supabase, institutionId, att.id);
      } catch {
        // Ignore
      }
    }
  }

  const refreshedGradesRes = await (supabase as any)
    .from('exam_attempt_grades')
    .select('attempt_id, status, total_awarded_marks, max_possible_marks, percentage, is_passing')
    .eq('exam_id', examId)
    .eq('institution_id', institutionId);

  const freshGradesMap = new Map((refreshedGradesRes.data ?? []).map((g: any) => [g.attempt_id, g]));

  const attemptRows: TeacherAttemptGradingRow[] = [];
  let sumPercentage = 0;
  let gradedCount = 0;
  let publishedCount = 0;

  for (const att of attempts) {
    const student = studentMap.get(att.student_id) as any;
    const grade = freshGradesMap.get(att.id) as any;

    if (grade) {
      if (grade.status === 'published') publishedCount++;
      if (grade.status === 'moderated' || grade.status === 'published') gradedCount++;
      sumPercentage += Number(grade.percentage ?? 0);
    }

    attemptRows.push({
      attemptId: att.id,
      studentId: att.student_id,
      studentCode: student?.student_code ?? 'STU-???',
      studentFullName: student?.full_name ?? 'Unknown Student',
      studentEmail: student?.email ?? null,
      status: att.status,
      startedAt: att.started_at,
      submittedAt: att.submitted_at,
      gradeStatus: (grade?.status as ExamGradeStatus) ?? null,
      totalAwardedMarks: Number(grade?.total_awarded_marks ?? 0),
      maxPossibleMarks: Number(grade?.max_possible_marks ?? exam.total_marks),
      percentage: Number(grade?.percentage ?? 0),
      isPassing: Boolean(grade?.is_passing),
      gradedQuestionsCount: att.total_questions || 0,
      totalQuestions: att.total_questions || 0,
    });
  }

  const submittedCount = attempts.filter((a) => a.status === 'submitted' || a.status === 'auto_submitted').length;
  const avgPercentage = submittedCount > 0 ? Number((sumPercentage / submittedCount).toFixed(1)) : 0;

  return {
    exam: {
      examId: exam.id,
      title: version?.title ?? exam.title,
      courseCode: version?.course_code ?? null,
      courseTitle: version?.course_title ?? null,
      totalMarks: Number(version?.total_marks ?? exam.total_marks),
      passingMarks: version?.passing_marks != null ? Number(version.passing_marks) : null,
      passingPercentage: version?.passing_percentage != null ? Number(version.passing_percentage) : null,
      negativeMarkingEnabled: version?.negative_marking_enabled ?? exam.negative_marking_enabled,
      defaultNegativeMarks: Number(version?.default_negative_marks ?? exam.default_negative_marks),
    },
    summary: {
      totalAttempts: attempts.length,
      submittedCount,
      gradedCount,
      publishedCount,
      averageScore: Number(((avgPercentage / 100) * Number(version?.total_marks ?? exam.total_marks)).toFixed(1)),
      averagePercentage: avgPercentage,
    },
    attempts: attemptRows,
  };
}

export async function saveManualAttemptQuestionGrade(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  data: {
    attemptId: string;
    questionId: string;
    awardedMarks: number;
    teacherFeedback?: string | null;
    rubricBreakdown?: Record<string, unknown>;
  },
): Promise<void> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Educator access required to grade descriptive answers', 403);
  }

  const { data: attemptRes, error: attErr } = await (supabase as any)
    .from('exam_attempts')
    .select('exam_version_id, institution_id')
    .eq('id', data.attemptId)
    .eq('institution_id', institutionId)
    .maybeSingle();

  if (attErr || !attemptRes) throw new Error('Attempt not found');

  const { data: versionRes, error: verErr } = await (supabase as any)
    .from('exam_versions')
    .select('snapshot_payload')
    .eq('id', attemptRes.exam_version_id)
    .eq('institution_id', institutionId)
    .maybeSingle();

  if (verErr || !versionRes) throw new Error('Exam version snapshot not found');

  const snapshot = (versionRes as any).snapshot_payload as unknown as ExamSnapshotPayload;
  let maxMarks = 10;
  for (const sec of snapshot.sections ?? []) {
    for (const q of sec.questions ?? []) {
      if (q.id === data.questionId) {
        maxMarks = Number(q.effective_marks ?? 10);
      }
    }
  }

  const awarded = Math.max(0, Math.min(maxMarks, data.awardedMarks));

  const { error: upsertErr } = await (supabase as any).from('exam_question_grades').upsert(
    {
      institution_id: institutionId,
      attempt_id: data.attemptId,
      question_id: data.questionId,
      max_marks: maxMarks,
      awarded_marks: awarded,
      negative_deduction: 0,
      teacher_feedback: data.teacherFeedback ?? null,
      rubric_breakdown: data.rubricBreakdown ?? {},
      graded_by: userId,
      graded_at: new Date().toISOString(),
    },
    { onConflict: 'attempt_id,question_id' },
  );

  if (upsertErr) throw new Error(upsertErr.message);

  await calculateAttemptGrades(supabase, institutionId, data.attemptId);
}

export async function publishExamResults(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId: string,
  attemptIds?: string[],
): Promise<number> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Educator access required to publish results', 403);
  }

  let query = (supabase as any)
    .from('exam_attempt_grades')
    .update({
      status: 'published',
      published_by: userId,
      published_at: new Date().toISOString(),
    })
    .eq('institution_id', institutionId)
    .eq('exam_id', examId);

  if (attemptIds && attemptIds.length > 0) {
    query = query.in('attempt_id', attemptIds);
  }

  const { data, error } = await query.select('id');
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function loadTeacherAttemptGradingDetail(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  attemptId: string,
): Promise<TeacherAttemptGradingDetail> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Educator access required to grade attempts', 403);
  }

  const { data: attempt, error: attErr } = await (supabase as any)
    .from('exam_attempts')
    .select('id, exam_id, exam_version_id, student_id, status, started_at, submitted_at')
    .eq('id', attemptId)
    .eq('institution_id', institutionId)
    .maybeSingle();

  if (attErr || !attempt) throw new Error('Attempt not found');

  const [studentRes, versionRes, answerKeysRes, answersRes, qGradesRes, gradeRes] = await Promise.all([
    (supabase as any)
      .from('student_records')
      .select('id, student_code, full_name')
      .eq('id', attempt.student_id)
      .maybeSingle(),
    (supabase as any)
      .from('exam_versions')
      .select('title, course_code, course_title, snapshot_payload')
      .eq('id', attempt.exam_version_id)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    (supabase as any)
      .from('exam_version_answer_keys')
      .select('keys_payload')
      .eq('version_id', attempt.exam_version_id)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    (supabase as any)
      .from('exam_attempt_answers')
      .select('question_id, selected_option_keys, descriptive_text')
      .eq('attempt_id', attemptId)
      .eq('institution_id', institutionId),
    (supabase as any)
      .from('exam_question_grades')
      .select('question_id, max_marks, awarded_marks, negative_deduction, is_correct, teacher_feedback, rubric_breakdown')
      .eq('attempt_id', attemptId)
      .eq('institution_id', institutionId),
    (supabase as any)
      .from('exam_attempt_grades')
      .select('status, total_awarded_marks, max_possible_marks, percentage, is_passing, teacher_notes')
      .eq('attempt_id', attemptId)
      .eq('institution_id', institutionId)
      .maybeSingle(),
  ]);

  const student = studentRes.data as any;
  const version = versionRes.data as any;
  const explicitKeys = (answerKeysRes.data?.keys_payload ?? {}) as AnswerKeyPayload;
  const answersMap = new Map(((answersRes.data ?? []) as any[]).map((a) => [a.question_id, a]));
  const qGradesMap = new Map(((qGradesRes.data ?? []) as any[]).map((q) => [q.question_id, q]));
  const grade = gradeRes.data as any;

  const snapshot = version?.snapshot_payload as unknown as ExamSnapshotPayload;
  const questions: TeacherAttemptQuestionDetail[] = [];

  for (const sec of snapshot?.sections ?? []) {
    for (const q of sec.questions ?? []) {
      const qg = qGradesMap.get(q.id) as any;
      const ans = answersMap.get(q.id) as any;
      const keyInfo = explicitKeys.questions?.[q.id];

      const rawOptions = (q.options ?? []).map((opt: any) => ({
        optionKey: opt.option_key ?? opt.optionKey ?? '',
        optionText: opt.option_text ?? opt.optionText ?? '',
      }));

      questions.push({
        questionId: q.id,
        sectionTitle: sec.title,
        questionTitle: q.title,
        prompt: q.prompt,
        questionType: q.question_type,
        maxMarks: Number(qg?.max_marks ?? q.effective_marks ?? 10),
        awardedMarks: Number(qg?.awarded_marks ?? 0),
        negativeDeduction: Number(qg?.negative_deduction ?? 0),
        isCorrect: qg?.is_correct ?? null,
        options: rawOptions,
        selectedOptionKeys: ans?.selected_option_keys ?? ans?.selectedOptionKeys ?? [],
        correctOptionKeys: keyInfo?.correct_option_keys ?? [],
        descriptiveText: ans?.descriptive_text ?? ans?.descriptiveText ?? null,
        sampleAnswer: keyInfo?.sample_answer ?? null,
        gradingRubric: keyInfo?.grading_rubric ?? null,
        teacherFeedback: qg?.teacher_feedback ?? null,
        rubricBreakdown: (qg?.rubric_breakdown ?? {}) as Record<string, string>,
      });
    }
  }

  return {
    attemptId: attempt.id,
    examId: attempt.exam_id,
    examTitle: version?.title ?? 'Exam',
    studentId: attempt.student_id,
    studentCode: student?.student_code ?? 'STU-???',
    studentFullName: student?.full_name ?? 'Unknown Student',
    status: attempt.status,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    totalAwardedMarks: Number(grade?.total_awarded_marks ?? 0),
    maxPossibleMarks: Number(grade?.max_possible_marks ?? 0),
    percentage: Number(grade?.percentage ?? 0),
    isPassing: Boolean(grade?.is_passing),
    gradeStatus: (grade?.status as ExamGradeStatus) ?? null,
    teacherNotes: grade?.teacher_notes ?? null,
    questions,
  };
}

export async function loadStudentResultReport(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId: string,
): Promise<StudentResultReport | null> {
  const { data: attempts, error: attErr } = await (supabase as any)
    .from('exam_attempts')
    .select('id, exam_version_id, status, started_at, submitted_at, student_id')
    .eq('institution_id', institutionId)
    .eq('exam_id', examId)
    .eq('user_id', userId);

  if (attErr) throw new Error(attErr.message);
  if (!attempts || attempts.length === 0) return null;

  const attempt = attempts[0]! as any;

  const { data: gradeRec, error: gradeErr } = await (supabase as any)
    .from('exam_attempt_grades')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('attempt_id', attempt.id)
    .maybeSingle();

  if (gradeErr) throw new Error(gradeErr.message);
  if (!gradeRec || (gradeRec as any).status !== 'published') {
    return null;
  }

  const [versionRes, qGradesRes, studentAnswersRes] = await Promise.all([
    (supabase as any)
      .from('exam_versions')
      .select('title, course_code, course_title, version_number, snapshot_passing_marks, snapshot_passing_percentage, snapshot_payload')
      .eq('id', attempt.exam_version_id)
      .eq('institution_id', institutionId)
      .maybeSingle(),
    (supabase as any)
      .from('exam_question_grades')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('attempt_id', attempt.id),
    (supabase as any)
      .from('exam_attempt_answers')
      .select('question_id, selected_option_keys, descriptive_text')
      .eq('institution_id', institutionId)
      .eq('attempt_id', attempt.id),
  ]);

  if (versionRes.error || !versionRes.data) throw new Error('Exam version snapshot not found');
  if (qGradesRes.error) throw new Error(qGradesRes.error.message);
  if (studentAnswersRes.error) throw new Error(studentAnswersRes.error.message);

  const ver = versionRes.data as any;
  const qGradesMap = new Map((qGradesRes.data ?? []).map((q: any) => [q.question_id, q]));
  const answersMap = new Map((studentAnswersRes.data ?? []).map((a: any) => [a.question_id, a]));
  const snapshot = ver.snapshot_payload as unknown as ExamSnapshotPayload;

  const detailItems: StudentResultDetailItem[] = [];
  for (const sec of snapshot.sections ?? []) {
    for (const q of sec.questions ?? []) {
      const qg = qGradesMap.get(q.id) as any;
      const ans = answersMap.get(q.id) as any;
      detailItems.push({
        questionId: q.id,
        sectionTitle: sec.title,
        questionTitle: q.title,
        prompt: q.prompt,
        questionType: q.question_type,
        maxMarks: Number(qg?.max_marks ?? q.effective_marks ?? 0),
        awardedMarks: Number(qg?.awarded_marks ?? 0),
        negativeDeduction: Number(qg?.negative_deduction ?? 0),
        isCorrect: qg?.is_correct ?? null,
        selectedOptionKeys: ans?.selected_option_keys ?? ans?.selectedOptionKeys ?? [],
        descriptiveText: ans?.descriptive_text ?? ans?.descriptiveText ?? null,
        teacherFeedback: qg?.teacher_feedback ?? null,
        rubricBreakdown: (qg?.rubric_breakdown ?? {}) as Record<string, string>,
      });
    }
  }

  const gradeRecord = gradeRec as any;

  return {
    examId,
    examTitle: ver.title,
    courseCode: ver.course_code ?? null,
    courseTitle: ver.course_title ?? null,
    versionNumber: ver.version_number,
    attemptId: attempt.id,
    status: gradeRecord.status,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    totalAwardedMarks: Number(gradeRecord.total_awarded_marks),
    maxPossibleMarks: Number(gradeRecord.max_possible_marks),
    percentage: Number(gradeRecord.percentage),
    isPassing: Boolean(gradeRecord.is_passing),
    passingMarks: ver.snapshot_passing_marks != null ? Number(ver.snapshot_passing_marks) : null,
    passingPercentage: ver.snapshot_passing_percentage != null ? Number(ver.snapshot_passing_percentage) : null,
    teacherNotes: gradeRecord.teacher_notes,
    publishedAt: gradeRecord.published_at,
    questions: detailItems,
  };
}

export async function loadExamAnalytics(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  examId: string,
): Promise<ExamAnalyticsData> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Educator access required for exam analytics', 403);
  }

  const [examRes, gradesRes, versionRes] = await Promise.all([
    (supabase as any).from('exams').select('title, total_marks').eq('id', examId).eq('institution_id', institutionId).maybeSingle(),
    (supabase as any)
      .from('exam_attempt_grades')
      .select('total_awarded_marks, max_possible_marks, percentage, is_passing, attempt_id')
      .eq('exam_id', examId)
      .eq('institution_id', institutionId),
    (supabase as any)
      .from('exam_versions')
      .select('title, snapshot_payload')
      .eq('exam_id', examId)
      .eq('institution_id', institutionId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (examRes.error || !examRes.data) throw new Error('Exam not found');
  if (gradesRes.error) throw new Error(gradesRes.error.message);

  const grades = (gradesRes.data ?? []) as any[];
  const totalSubmissions = grades.length;

  let sumScore = 0;
  let highest = 0;
  let lowest = totalSubmissions > 0 ? 999999 : 0;
  let passCount = 0;

  for (const g of grades) {
    const sc = Number(g.total_awarded_marks);
    sumScore += sc;
    if (sc > highest) highest = sc;
    if (sc < lowest) lowest = sc;
    if (g.is_passing) passCount++;
  }

  const averageScore = totalSubmissions > 0 ? Number((sumScore / totalSubmissions).toFixed(1)) : 0;
  const passRate = totalSubmissions > 0 ? Number(((passCount / totalSubmissions) * 100).toFixed(1)) : 0;

  const attemptIds = grades.map((g: any) => g.attempt_id);
  const qGradesRes = attemptIds.length > 0
    ? await (supabase as any)
        .from('exam_question_grades')
        .select('question_id, awarded_marks, max_marks, is_correct')
        .in('attempt_id', attemptIds)
        .eq('institution_id', institutionId)
    : { data: [] };

  const qMap = new Map<string, { totalAwarded: number; max: number; count: number; correct: number }>();
  for (const qg of (qGradesRes.data ?? []) as any[]) {
    let cur = qMap.get(qg.question_id);
    if (!cur) {
      cur = { totalAwarded: 0, max: Number(qg.max_marks), count: 0, correct: 0 };
      qMap.set(qg.question_id, cur);
    }
    cur.totalAwarded += Number(qg.awarded_marks);
    cur.count++;
    if (qg.is_correct) cur.correct++;
  }

  const snapshot = (versionRes.data as any)?.snapshot_payload as unknown as ExamSnapshotPayload;
  const questionStats = [];
  for (const sec of snapshot?.sections ?? []) {
    for (const q of sec.questions ?? []) {
      const stats = qMap.get(q.id);
      const cnt = stats?.count ?? 0;
      const avgAw = cnt > 0 ? Number((stats!.totalAwarded / cnt).toFixed(1)) : 0;
      const maxM = Number(q.effective_marks ?? 10);
      const successRate = maxM > 0 ? Number(((avgAw / maxM) * 100).toFixed(1)) : 0;

      questionStats.push({
        questionId: q.id,
        title: q.title,
        questionType: q.question_type,
        maxMarks: maxM,
        attemptCount: cnt,
        correctCount: stats?.correct ?? 0,
        averageAwarded: avgAw,
        successRate,
      });
    }
  }

  return {
    examId,
    examTitle: (versionRes.data as any)?.title ?? (examRes.data as any).title,
    totalSubmissions,
    averageScore,
    highestScore: totalSubmissions > 0 ? highest : 0,
    lowestScore: totalSubmissions > 0 ? lowest : 0,
    passCount,
    failCount: totalSubmissions - passCount,
    passRate,
    questionStats,
  };
}
