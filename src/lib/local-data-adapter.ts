import { z } from 'zod';
import type {
  AcademicCatalog,
  AcademicClassRow,
  AcademicSessionRow,
  AcademicTermRow,
  ClassSectionRow,
  CourseRow,
  CsvImportJobRow,
  CsvImportSummary,
  DepartmentRow,
  PaginatedResult,
  ProgramRow,
  StudentDirectoryItem,
  StudentEnrollmentRow,
  StudentRecordRow,
  TeacherAssignmentRow,
  TeacherDirectoryItem,
} from './academic.server';
import {
  AUDIT_PAGE_SIZE_MAX,
  redactAuditMetadata,
  sanitizeSearchTerm,
  type AuditLogEntry,
  type AuditSearchResult,
} from './audit.shared';
import { parseAndValidateStudentCsv } from './csv';
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
  type SubmitExamAttemptResult,
} from './exam-engine.shared';
import type {
  ExamAssignmentDetail,
  ExamBuilderCatalog,
  ExamDetail,
  ExamPreviewData,
  ExamSectionDetail,
  ExamSectionQuestionDetail,
  ExamSnapshotPayload,
  ExamSummaryItem,
  SaveExamConfigInput,
  TeacherExamBucket,
  TeacherExamDashboardData,
  TeacherExamDashboardRow,
} from './exams.server';
import { computeExamAnalytics } from './grading.analytics';
import type {
  ExamAnalyticsData,
  ExamGradeStatus,
  StudentResultDetailItem,
  StudentResultReport,
  TeacherAttemptGradingDetail,
  TeacherAttemptQuestionDetail,
  TeacherExamGradingDashboardData,
} from './grading.shared';
import {
  gradeLocalExam,
  saveLocalQuestionGrade,
  type GradingAnswer,
  type GradingQuestion,
  type LocalGrade,
  type LocalQuestionGrade,
  type LocalQuestionType,
} from './local-exam-grading';
import {
  localRepository,
  type ExamRepository,
  type LocalEntity,
  type LocalExamSectionQuestionRecord,
  type LocalExamSectionRecord,
  type LocalExamVersionRecord,
  type LocalSnapshot,
} from './local-repository';
import type {
  AttemptReviewRecord,
  AttemptReviewStatus,
  InvigilatorDashboardAttemptRow,
  ProctoringEventItem,
  ProctoringEventType,
  ProctoringSeverity,
} from './proctoring.shared';
import type {
  EducatorQuestionItem,
  QuestionAttachmentWithUrl,
  QuestionBankCatalog,
  QuestionCsvImportSummary,
  QuestionSetWithItems,
  SaveQuestionInput,
} from './question-bank.server';
import { parseAndValidateQuestionCsv } from './question-csv';
import { buildReportsOverview, type ReportExamInput, type ReportsOverview } from './reports.shared';
import type { InstitutionWorkspaceData, MemberWithProfile } from './workspace.server';
import type {
  CourseStatus,
  InstitutionRole,
  InstitutionStatus,
  Json,
  MembershipStatus,
  QuestionDifficulty,
  QuestionStatus,
  QuestionType,
} from '@/integrations/supabase/types';

const idSchema = z.string().trim().min(1);

const createSessionSchema = z.object({
  institutionId: idSchema,
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(40),
  startsOn: z.string().min(8),
  endsOn: z.string().min(8),
  status: z.enum(['planned', 'active', 'archived']),
  isCurrent: z.boolean(),
});

const createTermSchema = z.object({
  institutionId: idSchema,
  sessionId: idSchema,
  name: z.string().trim().min(2).max(100),
  startsOn: z.string().min(8),
  endsOn: z.string().min(8),
  status: z.enum(['planned', 'active', 'archived']),
  isCurrent: z.boolean(),
});

const createDepartmentSchema = z.object({
  institutionId: idSchema,
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(30),
  description: z.string().trim().max(500).nullable().optional(),
  headMembershipId: idSchema.nullable().optional(),
});

const createProgramSchema = z.object({
  institutionId: idSchema,
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(30),
  departmentId: idSchema.nullable().optional(),
  durationYears: z.number().int().min(1).max(10),
});

const createClassSchema = z.object({
  institutionId: idSchema,
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(30),
  programId: idSchema.nullable().optional(),
  levelOrder: z.number().int().min(1).max(20),
});

const createSectionSchema = z.object({
  institutionId: idSchema,
  classId: idSchema,
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(2000),
});

const createCourseSchema = z.object({
  institutionId: idSchema,
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(2).max(150),
  departmentId: idSchema.nullable().optional(),
  programId: idSchema.nullable().optional(),
  classId: idSchema.nullable().optional(),
  credits: z.number().min(0).max(30),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const createStudentSchema = z.object({
  institutionId: idSchema,
  studentCode: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  status: z.enum(['active', 'graduated', 'withdrawn', 'suspended']).optional(),
  academicSessionId: idSchema.nullable().optional(),
  academicTermId: idSchema.nullable().optional(),
  classSectionId: idSchema.nullable().optional(),
});

const saveQuestionSchema = z.object({
  institutionId: idSchema,
  courseId: idSchema.nullable().optional(),
  questionType: z.enum(['mcq_single', 'mcq_multi', 'descriptive', 'long_answer']),
  title: z.string().trim().min(2).max(180),
  prompt: z.string().trim().min(3).max(15000),
  topic: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  marks: z.number().positive().max(1000),
  negativeMarks: z.number().min(0).max(1000),
  expectedWordCount: z.number().int().min(10).max(20000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  options: z
    .array(
      z.object({
        optionKey: z.string().trim().min(1).max(8),
        optionText: z.string().trim().min(1).max(2000),
        sortOrder: z.number().int().min(0),
      }),
    )
    .max(8)
    .optional(),
  correctOptionKeys: z.array(z.string().trim().min(1).max(8)).max(8).optional(),
  sampleAnswer: z.string().trim().max(15000).nullable().optional(),
  gradingRubric: z.string().trim().max(15000).nullable().optional(),
  explanation: z.string().trim().max(10000).nullable().optional(),
});

const saveExamConfigSchema = z.object({
  institutionId: idSchema,
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(4000).nullable().optional(),
  courseId: idSchema.nullable().optional(),
  academicSessionId: idSchema.nullable().optional(),
  academicTermId: idSchema.nullable().optional(),
  instructions: z.string().trim().max(15000).nullable().optional(),
  startsAt: z.string().trim().nullable().optional(),
  endsAt: z.string().trim().nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  passingMarks: z.number().min(0).max(100000).nullable().optional(),
  passingPercentage: z.number().min(0).max(100).nullable().optional(),
  negativeMarkingEnabled: z.boolean(),
  defaultNegativeMarks: z.number().min(0).max(1000),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
});

function str(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function nullableStr(val: unknown): string | null {
  return typeof val === 'string' && val.length > 0 ? val : null;
}

function num(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function bool(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function appendAudit(
  snap: LocalSnapshot,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
  actor = 'Local workspace user',
) {
  const now = new Date().toISOString();
  snap.data.auditLog = [
    {
      id: makeId('audit'),
      time: now,
      createdAt: now,
      actor,
      actorUserId: actor,
      action,
      targetType,
      targetId,
      resource: targetId ?? targetType,
      metadata: metadata as never,
    },
    ...snap.data.auditLog,
  ];
}

function toMemberWithProfile(m: LocalEntity, institutionId: string): MemberWithProfile {
  const now = str(m['createdAt'], new Date().toISOString());
  const userId = str(m['userId'], m.id);
  const fullName = str(m['name'], str(m['fullName'], m.id));
  const email = str(m['email'], 'local@example.test');
  return {
    id: m.id,
    institution_id: institutionId,
    user_id: userId,
    role: str(m['role'], 'teacher') as InstitutionRole,
    status: str(m['status'], 'active') as MembershipStatus,
    invited_by: null,
    created_at: now,
    updated_at: now,
    profile: {
      id: userId,
      email,
      full_name: fullName,
      phone: null,
      timezone: 'UTC',
    },
  };
}

function toCourseRow(c: LocalEntity, institutionId: string): CourseRow {
  const now = str(c['created_at'], new Date().toISOString());
  return {
    id: c.id,
    institution_id: institutionId,
    code: str(c['code']),
    title: str(c['title']),
    department_id: nullableStr(c['departmentId']),
    program_id: nullableStr(c['programId']),
    class_id: nullableStr(c['classId']),
    credits: num(c['credits'], 3),
    description: nullableStr(c['description']),
    status: str(c['status'], 'active') as CourseStatus,
    created_at: now,
    updated_at: now,
  };
}

function toDepartmentRow(d: LocalEntity, institutionId: string): DepartmentRow {
  const now = str(d['created_at'], new Date().toISOString());
  return {
    id: d.id,
    institution_id: institutionId,
    name: str(d['name']),
    code: str(d['code']),
    description: nullableStr(d['description']),
    head_membership_id: nullableStr(d['headMembershipId']),
    created_at: now,
    updated_at: now,
  };
}

function toProgramRow(p: LocalEntity, institutionId: string): ProgramRow {
  const now = str(p['created_at'], new Date().toISOString());
  return {
    id: p.id,
    institution_id: institutionId,
    department_id: nullableStr(p['departmentId']),
    name: str(p['name']),
    code: str(p['code']),
    duration_years: num(p['durationYears'], 3),
    created_at: now,
    updated_at: now,
  };
}

function toEducatorQuestion(
  q: LocalEntity,
  snap: LocalSnapshot,
  institutionId: string,
): EducatorQuestionItem {
  const course = snap.data.courses.find((c) => c.id === q['courseId']);
  const now = str(q['createdAt'], new Date().toISOString());
  const rawOptions = Array.isArray(q['options']) ? q['options'] : [];
  const options = rawOptions.map((o: unknown, idx: number) => {
    const rec = o as Record<string, unknown>;
    return {
      id: str(rec['id'], `${q.id}-opt-${idx}`),
      option_key: str(rec['optionKey'] ?? rec['option_key'], String.fromCharCode(65 + idx)),
      option_text: str(rec['optionText'] ?? rec['option_text']),
      sort_order: num(rec['sortOrder'] ?? rec['sort_order'], idx),
    };
  });
  const correctKeys = Array.isArray(q['correctOptionKeys'])
    ? (q['correctOptionKeys'] as unknown[]).map((k) => String(k))
    : [];
  const tags = Array.isArray(q['tags']) ? (q['tags'] as unknown[]).map((t) => String(t)) : [];
  const attachments: QuestionAttachmentWithUrl[] = snap.aux.attachments
    .filter((a) => a.question_id === q.id)
    .map((a) => ({
      id: a.id,
      institution_id: institutionId,
      question_id: a.question_id,
      file_name: a.file_name,
      storage_path: a.storage_path,
      mime_type: a.mime_type,
      file_size_bytes: a.file_size_bytes,
      attachment_kind: a.attachment_kind,
      uploaded_by: a.uploaded_by,
      created_at: a.created_at,
      signedUrl: a.dataUrl,
    }));

  return {
    id: q.id,
    institution_id: institutionId,
    course_id: nullableStr(q['courseId']),
    courseCode: course ? str(course['code']) : null,
    courseTitle: course ? str(course['title']) : null,
    question_type: str(q['questionType'], 'mcq_single') as QuestionType,
    title: str(q['title']),
    prompt: str(q['prompt']),
    topic: str(q['topic'], 'General'),
    category: str(q['category'], 'Conceptual'),
    difficulty: str(q['difficulty'], 'medium') as QuestionDifficulty,
    marks: num(q['marks'], 1),
    negative_marks: num(q['negativeMarks'], 0),
    expected_word_count: nullableNum(q['expectedWordCount']),
    tags,
    status: str(q['status'], 'active') as QuestionStatus,
    source_question_id: nullableStr(q['sourceQuestionId']),
    created_by: str(q['createdBy'], 'local-user-teacher'),
    updated_by: nullableStr(q['updatedBy']),
    created_at: now,
    updated_at: str(q['updatedAt'], now),
    options,
    answerKey: {
      correct_option_keys: correctKeys,
      sample_answer: nullableStr(q['sampleAnswer']),
      grading_rubric: nullableStr(q['gradingRubric']),
      explanation: nullableStr(q['explanation']),
    },
    attachments,
  };
}

function classifyExamBucket(
  exam: { status: string; starts_at: string | null; ends_at: string | null },
  nowMs = Date.now(),
): TeacherExamBucket {
  if (exam.status === 'closed' || exam.status === 'archived') return 'archived';
  if (exam.status === 'draft') return 'draft';
  const startMs = exam.starts_at ? Date.parse(exam.starts_at) : null;
  const endMs = exam.ends_at ? Date.parse(exam.ends_at) : null;
  if (endMs !== null && Number.isFinite(endMs) && endMs <= nowMs) return 'archived';
  if (startMs !== null && Number.isFinite(startMs) && startMs > nowMs) return 'upcoming';
  return 'active';
}

function computeExamTotalMarks(snap: LocalSnapshot, examId: string): number {
  const sqs = snap.aux.examSectionQuestions.filter((sq) => sq.exam_id === examId);
  if (sqs.length > 0) {
    return sqs.reduce((sum, sq) => sum + Number(sq.marks ?? 0), 0);
  }
  const ex = snap.data.exams.find((e) => e.id === examId);
  if (ex && Array.isArray(ex['questionIds'])) {
    return (ex['questionIds'] as string[]).reduce((sum, qId) => {
      const q = snap.data.questionBank.find((item) => item.id === qId);
      return sum + (q ? num(q['marks'], 0) : 0);
    }, 0);
  }
  return 0;
}

function syncExamEntityMarksAndQuestionIds(snap: LocalSnapshot, examId: string) {
  const sqs = snap.aux.examSectionQuestions
    .filter((sq) => sq.exam_id === examId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const totalMarks = sqs.reduce((sum, sq) => sum + Number(sq.marks ?? 0), 0);
  const questionIds = sqs.map((sq) => sq.question_id);
  snap.data.exams = snap.data.exams.map((ex) =>
    ex.id === examId
      ? {
          ...ex,
          totalMarks,
          questionIds,
          updatedAt: new Date().toISOString(),
        }
      : ex,
  );
}

function toExamSummaryItem(
  ex: LocalEntity,
  snap: LocalSnapshot,
  institutionId: string,
): ExamSummaryItem {
  const course = snap.data.courses.find((c) => c.id === ex['courseId']);
  const session = snap.aux.sessions.find((s) => s.id === ex['academicSessionId']);
  const term = snap.aux.terms.find((t) => t.id === ex['academicTermId']);
  const sections = snap.aux.examSections.filter((s) => s.exam_id === ex.id);
  const sqs = snap.aux.examSectionQuestions.filter((sq) => sq.exam_id === ex.id);
  const assignments = snap.aux.examAssignments.filter((a) => a.exam_id === ex.id);
  const attempts = snap.data.attempts.filter((a) => a['examId'] === ex.id);
  const computedMarks =
    sqs.length > 0
      ? sqs.reduce((sum, sq) => sum + Number(sq.marks ?? 0), 0)
      : num(ex['totalMarks'], computeExamTotalMarks(snap, ex.id));
  const now = str(ex['createdAt'], new Date().toISOString());
  const questionCount =
    sqs.length > 0
      ? sqs.length
      : Array.isArray(ex['questionIds'])
        ? ex['questionIds'].length
        : 0;

  return {
    id: ex.id,
    institution_id: institutionId,
    course_id: nullableStr(ex['courseId']),
    courseCode: course ? str(course['code']) : null,
    courseTitle: course ? str(course['title']) : null,
    academic_session_id: nullableStr(ex['academicSessionId']),
    sessionName: session?.name ?? null,
    academic_term_id: nullableStr(ex['academicTermId']),
    termName: term?.name ?? null,
    title: str(ex['title']),
    description: nullableStr(ex['description']),
    starts_at: nullableStr(ex['startsAt']),
    ends_at: nullableStr(ex['endsAt']),
    duration_minutes: num(ex['durationMinutes'], 60),
    total_marks: computedMarks,
    passing_marks: nullableNum(ex['passingMarks']),
    passing_percentage: nullableNum(ex['passingPercentage']),
    negative_marking_enabled: bool(ex['negativeMarkingEnabled'], false),
    default_negative_marks: num(ex['defaultNegativeMarks'], 0),
    shuffle_questions: bool(ex['shuffleQuestions'], false),
    shuffle_options: bool(ex['shuffleOptions'], false),
    status: str(ex['status'], 'draft') as ExamSummaryItem['status'],
    current_version_number: num(ex['currentVersionNumber'], 0),
    latest_published_version_id: nullableStr(ex['latestPublishedVersionId']),
    published_at: nullableStr(ex['publishedAt']),
    closed_at: nullableStr(ex['closedAt']),
    sectionCount: sections.length,
    questionCount,
    assignmentCount: assignments.length,
    totalAttempts: attempts.length,
    isLockedByAttempts: attempts.length > 0,
    created_by: str(ex['createdBy'], 'local-user-teacher'),
    updated_at: str(ex['updatedAt'], now),
  };
}

function buildExamDetailFromSnap(
  snap: LocalSnapshot,
  institutionId: string,
  examId: string,
): ExamDetail {
  const ex = snap.data.exams.find((item) => item.id === examId);
  if (!ex) throw new Error('Exam not found');
  const summary = toExamSummaryItem(ex, snap, institutionId);

  const rawSections = snap.aux.examSections
    .filter((s) => s.exam_id === examId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  const sections: ExamSectionDetail[] = rawSections.map((sec) => {
    const rawSqs = snap.aux.examSectionQuestions
      .filter((sq) => sq.section_id === sec.id)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    const questions: ExamSectionQuestionDetail[] = rawSqs
      .map((sq) => {
        const qEntity = snap.data.questionBank.find((q) => q.id === sq.question_id);
        if (!qEntity) return null;
        const eq = toEducatorQuestion(qEntity, snap, institutionId);
        return {
          id: sq.id,
          exam_id: examId,
          section_id: sec.id,
          question_id: sq.question_id,
          sort_order: sq.sort_order,
          marks: sq.marks,
          negative_marks: sq.negative_marks,
          question: {
            id: eq.id,
            question_type: eq.question_type,
            title: eq.title,
            prompt: eq.prompt,
            topic: eq.topic,
            category: eq.category,
            difficulty: eq.difficulty,
            default_marks: eq.marks,
            default_negative_marks: eq.negative_marks,
            expected_word_count: eq.expected_word_count,
            status: eq.status,
            course_id: eq.course_id,
            options: eq.options,
            answerKey: eq.answerKey,
          },
        };
      })
      .filter((x): x is ExamSectionQuestionDetail => Boolean(x));

    return {
      ...sec,
      sectionTotalMarks: questions.reduce((s, q) => s + q.marks, 0),
      questions,
    };
  });

  const assignments: ExamAssignmentDetail[] = snap.aux.examAssignments
    .filter((a) => a.exam_id === examId)
    .map((a) => {
      let targetLabel = 'Assigned cohort';
      let targetSublabel: string | null = null;
      if (a.target_type === 'class' && a.class_id) {
        const cls = snap.aux.classes.find((c) => c.id === a.class_id);
        targetLabel = cls ? `${cls.code} — ${cls.name}` : a.class_id;
        targetSublabel = 'Entire class';
      } else if (a.target_type === 'section' && a.class_section_id) {
        const sec = snap.aux.sections.find((s) => s.id === a.class_section_id);
        const cls = sec ? snap.aux.classes.find((c) => c.id === sec.class_id) : undefined;
        targetLabel = cls && sec ? `${cls.name} — ${sec.name}` : sec?.name ?? a.class_section_id;
        targetSublabel = 'Class section';
      } else if (a.target_type === 'student' && a.student_id) {
        const st = snap.data.students.find((s) => s.id === a.student_id);
        targetLabel = st ? str(st['fullName']) : a.student_id;
        targetSublabel = st ? str(st['studentCode']) : 'Individual student';
      }
      return {
        ...a,
        targetLabel,
        targetSublabel,
      };
    });

  const versions = snap.aux.examVersions
    .filter((v) => v.exam_id === examId)
    .slice()
    .sort((a, b) => b.version_number - a.version_number);

  return {
    exam: {
      ...summary,
      instructions: nullableStr(ex['instructions']),
    },
    sections,
    assignments,
    versions,
  };
}

function getLocalStudentIdentity(snap: LocalSnapshot) {
  const student =
    snap.data.students.find((s) => s.id === 'student-014') ??
    snap.data.students.find((s) => s['userId'] === 'local-user-student') ??
    snap.data.students[0];
  if (!student) {
    throw new Error('No local student record found. Reset sample data or add a student.');
  }
  const enrolledSectionIds = snap.aux.enrollments
    .filter((e) => e.student_id === student.id && e.status === 'enrolled')
    .map((e) => e.class_section_id);
  const enrolledClassIds = snap.aux.sections
    .filter((sec) => enrolledSectionIds.includes(sec.id))
    .map((sec) => sec.class_id);
  return {
    student,
    studentId: student.id,
    studentCode: str(student['studentCode'], 'STU-001'),
    fullName: str(student['fullName'], 'Local Student'),
    email: nullableStr(student['email']),
    enrolledSectionIds,
    enrolledClassIds,
  };
}

function isStudentAssignedToExam(
  snap: LocalSnapshot,
  examId: string,
  studentId: string,
  enrolledSectionIds: string[],
  enrolledClassIds: string[],
): 'student' | 'section' | 'class' | null {
  const assignments = snap.aux.examAssignments.filter((a) => a.exam_id === examId);
  if (assignments.some((a) => a.target_type === 'student' && a.student_id === studentId)) {
    return 'student';
  }
  if (
    assignments.some(
      (a) => a.target_type === 'section' && a.class_section_id && enrolledSectionIds.includes(a.class_section_id),
    )
  ) {
    return 'section';
  }
  if (assignments.some((a) => a.target_type === 'class' && a.class_id && enrolledClassIds.includes(a.class_id))) {
    return 'class';
  }
  return null;
}

function resolveVersionForExam(snap: LocalSnapshot, ex: LocalEntity): LocalExamVersionRecord | null {
  const latestId = nullableStr(ex['latestPublishedVersionId']);
  if (latestId) {
    const found = snap.aux.examVersions.find((v) => v.id === latestId);
    if (found) return found;
  }
  const versions = snap.aux.examVersions
    .filter((v) => v.exam_id === ex.id)
    .slice()
    .sort((a, b) => b.version_number - a.version_number);
  return versions[0] ?? null;
}

function toStudentAttemptRecord(att: LocalEntity, institutionId: string): StudentAttemptRecord {
  const answersMap = (att['answers'] as Record<string, unknown> | undefined) ?? {};
  const answeredCount =
    typeof att['answeredCount'] === 'number'
      ? att['answeredCount']
      : Object.keys(answersMap).length;
  return {
    id: att.id,
    institutionId,
    examId: str(att['examId']),
    examVersionId: str(att['examVersionId']),
    studentId: str(att['studentId']),
    status: str(att['status'], 'in_progress') as StudentAttemptRecord['status'],
    startedAt: str(att['startedAt'], new Date().toISOString()),
    expiresAt: str(att['expiresAt'], new Date().toISOString()),
    submittedAt: nullableStr(att['submittedAt']),
    submissionReason: nullableStr(att['submissionReason']),
    lastSavedAt: nullableStr(att['lastSavedAt']),
    answeredCount,
    totalQuestions: num(att['totalQuestions'], 0),
  };
}

function gradeAttemptInSnap(snap: LocalSnapshot, attemptId: string): LocalGrade {
  const att = snap.data.attempts.find((a) => a.id === attemptId);
  if (!att) throw new Error('Attempt not found');
  const ex = snap.data.exams.find((e) => e.id === att['examId']);
  if (!ex) throw new Error('Exam not found');
  const version = snap.aux.examVersions.find((v) => v.id === att['examVersionId']) ?? resolveVersionForExam(snap, ex);

  const questions: GradingQuestion[] = [];
  const questionIds: string[] = [];

  if (version) {
    for (const sec of version.snapshot_payload.sections) {
      for (const q of sec.questions) {
        questionIds.push(q.id);
        const keyInfo = version.answer_keys[q.id];
        questions.push({
          id: q.id,
          questionType: q.question_type as LocalQuestionType,
          marks: Number(q.effective_marks ?? 1),
          negativeMarks: Number(q.effective_negative_marks ?? 0),
          correctOptionKeys: keyInfo?.correct_option_keys ?? [],
        });
      }
    }
  } else {
    const rawIds = Array.isArray(ex['questionIds']) ? (ex['questionIds'] as string[]) : [];
    for (const qId of rawIds) {
      const q = snap.data.questionBank.find((item) => item.id === qId);
      if (!q) continue;
      questionIds.push(qId);
      questions.push({
        id: qId,
        questionType: str(q['questionType'], 'mcq_single') as LocalQuestionType,
        marks: num(q['marks'], 1),
        negativeMarks: num(q['negativeMarks'], 0),
        correctOptionKeys: Array.isArray(q['correctOptionKeys'])
          ? (q['correctOptionKeys'] as unknown[]).map((k) => String(k))
          : [],
      });
    }
  }

  const rawAnswers = (att['answers'] as Record<string, Record<string, unknown>> | undefined) ?? {};
  const gradingAnswers: Record<string, GradingAnswer> = {};
  for (const [qId, ans] of Object.entries(rawAnswers)) {
    gradingAnswers[qId] = {
      selectedOptionKeys: Array.isArray(ans['selectedOptionKeys'])
        ? (ans['selectedOptionKeys'] as unknown[]).map((k) => String(k))
        : [],
      descriptiveText: nullableStr(ans['descriptiveText']),
    };
  }

  const computed = gradeLocalExam(
    {
      id: ex.id,
      questionIds,
      passingPercentage: nullableNum(version?.passing_percentage ?? ex['passingPercentage']) ?? 50,
      passingMarks: nullableNum(version?.passing_marks ?? ex['passingMarks']),
    },
    questions,
    gradingAnswers,
    att.id,
    str(att['studentId']),
  );

  // Preserve previously saved manual grades & feedback if recalculating
  const existing = snap.data.grades.find((g) => g['attemptId'] === attemptId) as unknown as LocalGrade | undefined;
  let merged = computed;
  if (existing && existing.questionGrades) {
    for (const [qId, prevQ] of Object.entries(existing.questionGrades)) {
      const currentQ = merged.questionGrades[qId];
      if (!currentQ) continue;
      if (!prevQ.pendingManual && prevQ.isCorrect === null) {
        merged = saveLocalQuestionGrade(
          merged,
          qId,
          Math.min(prevQ.awardedMarks, currentQ.maxMarks),
          prevQ.feedback,
          prevQ.rubricBreakdown ?? {},
        );
      }
    }
    if (existing.status === 'published' && Object.values(merged.questionGrades).every((q) => !q.pendingManual)) {
      merged = { ...merged, status: 'published', publishedAt: existing.publishedAt ?? new Date().toISOString() };
    }
  }

  const gradeEntity: LocalEntity = {
    ...(merged as unknown as Record<string, never>),
    id: merged.id,
    examVersionId: version?.id ?? '',
  };
  const existingIdx = snap.data.grades.findIndex((g) => g['attemptId'] === attemptId);
  if (existingIdx >= 0) {
    snap.data.grades[existingIdx] = gradeEntity;
  } else {
    snap.data.grades.push(gradeEntity);
  }
  return merged;
}

function finalizeAttemptIfExpired(snap: LocalSnapshot, att: LocalEntity, nowMs: number): LocalEntity {
  if (str(att['status']) !== 'in_progress') return att;
  const expiresMs = Date.parse(str(att['expiresAt']));
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    const submittedAt = new Date(expiresMs).toISOString();
    const updated: LocalEntity = {
      ...att,
      status: 'auto_submitted',
      submittedAt,
      submissionReason: 'deadline_auto_submit',
    };
    snap.data.attempts = snap.data.attempts.map((a) => (a.id === att.id ? updated : a));
    gradeAttemptInSnap(snap, att.id);
    return updated;
  }
  return att;
}

export function createLocalDataAdapter(repo: ExamRepository = localRepository) {
  return {
    // -------------------------------------------------------------------------
    // WORKSPACE & AUDIT & REPORTS
    // -------------------------------------------------------------------------
    async getInstitutionWorkspace(input: { institutionId: string }): Promise<InstitutionWorkspaceData> {
      const snap = repo.read();
      const inst = snap.data.institution.find((i) => i.id === input.institutionId) ?? snap.data.institution[0];
      if (!inst) throw new Error('Institution not found');
      const now = str(inst['created_at'], new Date().toISOString());
      const institution = {
        id: inst.id,
        name: str(inst['name']),
        slug: str(inst['slug']),
        institution_type: (nullableStr(inst['institution_type']) ?? 'college') as InstitutionWorkspaceData['institution']['institution_type'],
        status: (nullableStr(inst['status']) ?? 'active') as InstitutionStatus,
        created_by: str(inst['created_by'], 'local-user-institution'),
        created_at: now,
        updated_at: str(inst['updated_at'], now),
      };
      const members = snap.data.members.map((m) => toMemberWithProfile(m, inst.id));
      const auditLogs = snap.data.auditLog.map((a) => ({
        id: a.id,
        institution_id: inst.id,
        actor_user_id: nullableStr(a['actorUserId']),
        action: str(a['action']),
        target_type: str(a['targetType'], 'workspace'),
        target_id: nullableStr(a['targetId']),
        metadata: (a['metadata'] ?? {}) as Json,
        created_at: str(a['createdAt'] ?? a['time'], now),
      }));
      return {
        institution,
        myMembership: members[0] ?? null,
        isSuperAdmin: false,
        members,
        invitations: [],
        auditLogs,
      };
    },

    async getReportsOverview(input: { institutionId: string; from?: string; to?: string }): Promise<ReportsOverview> {
      const snap = repo.read();
      const exams: ReportExamInput[] = snap.data.exams
        .filter((e) => e['status'] !== 'draft')
        .map((e) => {
          const c = snap.data.courses.find((course) => course.id === e['courseId']);
          return {
            id: e.id,
            title: str(e['title']),
            status: str(e['status'], 'published') as ReportExamInput['status'],
            starts_at: nullableStr(e['startsAt']),
            created_at: str(e['createdAt'], new Date().toISOString()),
            total_marks: computeExamTotalMarks(snap, e.id),
            course_label: c ? `${str(c['code'])} — ${str(c['title'])}` : null,
          };
        });
      const attempts = snap.data.attempts.map((a) => ({
        exam_id: str(a['examId']),
        attempt_id: a.id,
        status: str(a['status']),
      }));
      const grades = snap.data.grades.map((g) => ({
        exam_id: str(g['examId']),
        attempt_id: str(g['attemptId']),
        status: str(g['status'], 'draft') as 'ungraded' | 'draft' | 'moderated' | 'published',
        percentage: num(g['percentage'], 0),
        is_passing: bool(g['isPassing'], false),
      }));
      return buildReportsOverview(exams, attempts, grades, {
        ...(input.from ? { from: input.from } : {}),
        ...(input.to ? { to: input.to } : {}),
      });
    },

    async searchAuditLogs(input: {
      institutionId: string;
      search?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    }): Promise<AuditSearchResult> {
      const parsed = z
        .object({
          institutionId: idSchema,
          search: z.string().trim().max(80).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          page: z.number().int().min(1).max(10_000).default(1),
          pageSize: z.number().int().min(1).max(AUDIT_PAGE_SIZE_MAX).default(25),
        })
        .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), {
          message: 'Start date must be before end date',
          path: ['from'],
        })
        .parse(input);
      const snap = repo.read();
      const q = parsed.search ? sanitizeSearchTerm(parsed.search).toLowerCase() : '';
      const fromMs = parsed.from ? Date.parse(parsed.from) : null;
      const toMs = parsed.to ? Date.parse(parsed.to) : null;

      const filtered: AuditLogEntry[] = snap.data.auditLog
        .map((row) => ({
          id: row.id,
          createdAt: str(row['createdAt'] ?? row['time'], new Date().toISOString()),
          action: str(row['action']),
          targetType: str(row['targetType'], str(row['resource'], 'workspace')),
          targetId: nullableStr(row['targetId']),
          actorUserId: nullableStr(row['actorUserId']),
          actorName: nullableStr(row['actor']),
          metadata: redactAuditMetadata((row['metadata'] as Record<string, unknown>) ?? {}),
        }))
        .filter((entry) => {
          const ts = Date.parse(entry.createdAt);
          if (fromMs !== null && ts < fromMs) return false;
          if (toMs !== null && ts > toMs) return false;
          if (q) {
            const hay = `${entry.action} ${entry.targetType} ${entry.actorName ?? ''} ${entry.targetId ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      const start = (parsed.page - 1) * parsed.pageSize;
      return {
        items: filtered.slice(start, start + parsed.pageSize),
        total: filtered.length,
        page: parsed.page,
        pageSize: parsed.pageSize,
      };
    },

    // -------------------------------------------------------------------------
    // ACADEMICS & STUDENTS & TEACHERS
    // -------------------------------------------------------------------------
    async getAcademicCatalog(input: { institutionId: string }): Promise<AcademicCatalog> {
      const snap = repo.read();
      const instId = input.institutionId;
      return {
        sessions: [...snap.aux.sessions],
        terms: [...snap.aux.terms],
        departments: snap.data.departments.map((d) => toDepartmentRow(d, instId)),
        programs: snap.data.programs.map((p) => toProgramRow(p, instId)),
        classes: [...snap.aux.classes],
        sections: [...snap.aux.sections],
        courses: snap.data.courses.map((c) => toCourseRow(c, instId)),
        teachers: snap.data.members
          .filter((m) => m['role'] === 'teacher' && m['status'] === 'active')
          .map((m) => toMemberWithProfile(m, instId)),
        assignments: [...snap.aux.teacherAssignments],
      };
    },

    async createAcademicSession(raw: z.input<typeof createSessionSchema>): Promise<AcademicSessionRow> {
      const input = createSessionSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        if (input.isCurrent) {
          snap.aux.sessions = snap.aux.sessions.map((s) => ({ ...s, is_current: false }));
        }
        const row: AcademicSessionRow = {
          id: makeId('session'),
          institution_id: input.institutionId,
          name: input.name,
          code: input.code,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          status: input.status,
          is_current: input.isCurrent,
          created_by: 'local-user-institution',
          created_at: now,
          updated_at: now,
        };
        snap.aux.sessions = [row, ...snap.aux.sessions];
        appendAudit(snap, 'academic.session_created', 'academic_session', row.id, { name: row.name });
        return row;
      });
    },

    async setCurrentAcademicSession(input: { institutionId: string; sessionId: string }): Promise<AcademicSessionRow> {
      return repo.mutate((snap) => {
        let updatedRow: AcademicSessionRow | null = null;
        snap.aux.sessions = snap.aux.sessions.map((s) => {
          const next = {
            ...s,
            is_current: s.id === input.sessionId,
            ...(s.id === input.sessionId ? { status: 'active' as const } : {}),
          };
          if (s.id === input.sessionId) {
            updatedRow = next;
          }
          return next;
        });
        if (!updatedRow) {
          throw new Error('Academic session not found');
        }
        appendAudit(snap, 'academic.session_set_current', 'academic_session', input.sessionId);
        return updatedRow;
      });
    },

    async deleteAcademicSession(input: { institutionId: string; sessionId: string }) {
      repo.mutate((snap) => {
        snap.aux.sessions = snap.aux.sessions.filter((s) => s.id !== input.sessionId);
        snap.aux.terms = snap.aux.terms.filter((t) => t.session_id !== input.sessionId);
        appendAudit(snap, 'academic.session_deleted', 'academic_session', input.sessionId);
      });
      return { ok: true };
    },

    async createAcademicTerm(raw: z.input<typeof createTermSchema>): Promise<AcademicTermRow> {
      const input = createTermSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const row: AcademicTermRow = {
          id: makeId('term'),
          institution_id: input.institutionId,
          session_id: input.sessionId,
          name: input.name,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          status: input.status,
          is_current: input.isCurrent,
          created_at: now,
          updated_at: now,
        };
        snap.aux.terms = [...snap.aux.terms, row];
        appendAudit(snap, 'academic.term_created', 'academic_term', row.id, { name: row.name });
        return row;
      });
    },

    async deleteAcademicTerm(input: { institutionId: string; termId: string }) {
      repo.mutate((snap) => {
        snap.aux.terms = snap.aux.terms.filter((t) => t.id !== input.termId);
        appendAudit(snap, 'academic.term_deleted', 'academic_term', input.termId);
      });
      return { ok: true };
    },

    async createDepartment(raw: z.input<typeof createDepartmentSchema>): Promise<DepartmentRow> {
      const input = createDepartmentSchema.parse(raw);
      return repo.mutate((snap) => {
        const duplicate = snap.data.departments.some(
          (d) => str(d['code']).toLowerCase() === input.code.toLowerCase(),
        );
        if (duplicate) throw new Error(`Department code "${input.code}" already exists.`);
        const now = new Date().toISOString();
        const entity: LocalEntity = {
          id: makeId('dept'),
          name: input.name,
          code: input.code,
          description: input.description ?? null,
          headMembershipId: input.headMembershipId ?? null,
          created_at: now,
        };
        snap.data.departments = [...snap.data.departments, entity];
        appendAudit(snap, 'academic.department_created', 'department', entity.id, { code: input.code });
        return toDepartmentRow(entity, input.institutionId);
      });
    },

    async deleteDepartment(input: { institutionId: string; departmentId: string }) {
      repo.mutate((snap) => {
        snap.data.departments = snap.data.departments.filter((d) => d.id !== input.departmentId);
        appendAudit(snap, 'academic.department_deleted', 'department', input.departmentId);
      });
      return { ok: true };
    },

    async createProgram(raw: z.input<typeof createProgramSchema>): Promise<ProgramRow> {
      const input = createProgramSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const entity: LocalEntity = {
          id: makeId('program'),
          name: input.name,
          code: input.code,
          departmentId: input.departmentId ?? null,
          durationYears: input.durationYears,
          created_at: now,
        };
        snap.data.programs = [...snap.data.programs, entity];
        appendAudit(snap, 'academic.program_created', 'program', entity.id, { code: input.code });
        return toProgramRow(entity, input.institutionId);
      });
    },

    async deleteProgram(input: { institutionId: string; programId: string }) {
      repo.mutate((snap) => {
        snap.data.programs = snap.data.programs.filter((p) => p.id !== input.programId);
        appendAudit(snap, 'academic.program_deleted', 'program', input.programId);
      });
      return { ok: true };
    },

    async createAcademicClass(raw: z.input<typeof createClassSchema>): Promise<AcademicClassRow> {
      const input = createClassSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const row: AcademicClassRow = {
          id: makeId('class'),
          institution_id: input.institutionId,
          name: input.name,
          code: input.code,
          program_id: input.programId ?? null,
          level_order: input.levelOrder,
          created_at: now,
          updated_at: now,
        };
        snap.aux.classes = [...snap.aux.classes, row];
        appendAudit(snap, 'academic.class_created', 'academic_class', row.id, { code: row.code });
        return row;
      });
    },

    async deleteAcademicClass(input: { institutionId: string; classId: string }) {
      repo.mutate((snap) => {
        snap.aux.classes = snap.aux.classes.filter((c) => c.id !== input.classId);
        snap.aux.sections = snap.aux.sections.filter((s) => s.class_id !== input.classId);
        appendAudit(snap, 'academic.class_deleted', 'academic_class', input.classId);
      });
      return { ok: true };
    },

    async createClassSection(raw: z.input<typeof createSectionSchema>): Promise<ClassSectionRow> {
      const input = createSectionSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const row: ClassSectionRow = {
          id: makeId('section'),
          institution_id: input.institutionId,
          class_id: input.classId,
          name: input.name,
          capacity: input.capacity,
          created_at: now,
          updated_at: now,
        };
        snap.aux.sections = [...snap.aux.sections, row];
        appendAudit(snap, 'academic.section_created', 'class_section', row.id, { name: row.name });
        return row;
      });
    },

    async deleteClassSection(input: { institutionId: string; sectionId: string }) {
      repo.mutate((snap) => {
        snap.aux.sections = snap.aux.sections.filter((s) => s.id !== input.sectionId);
        appendAudit(snap, 'academic.section_deleted', 'class_section', input.sectionId);
      });
      return { ok: true };
    },

    async createCourse(raw: z.input<typeof createCourseSchema>): Promise<CourseRow> {
      const input = createCourseSchema.parse(raw);
      return repo.mutate((snap) => {
        const duplicate = snap.data.courses.some(
          (c) => str(c['code']).toLowerCase() === input.code.toLowerCase(),
        );
        if (duplicate) throw new Error(`Course code "${input.code}" already exists.`);
        const now = new Date().toISOString();
        const entity: LocalEntity = {
          id: makeId('course'),
          code: input.code,
          title: input.title,
          departmentId: input.departmentId ?? null,
          programId: input.programId ?? null,
          classId: input.classId ?? null,
          credits: input.credits,
          description: input.description ?? null,
          status: input.status ?? 'active',
          created_at: now,
        };
        snap.data.courses = [...snap.data.courses, entity];
        appendAudit(snap, 'academic.course_created', 'course', entity.id, { code: input.code });
        return toCourseRow(entity, input.institutionId);
      });
    },

    async deleteCourse(input: { institutionId: string; courseId: string }) {
      repo.mutate((snap) => {
        snap.data.courses = snap.data.courses.filter((c) => c.id !== input.courseId);
        appendAudit(snap, 'academic.course_deleted', 'course', input.courseId);
      });
      return { ok: true };
    },

    async listTeachers(input: {
      institutionId: string;
      search?: string;
      departmentId?: string;
      status?: 'active' | 'suspended';
      page?: number;
      pageSize?: number;
    }): Promise<PaginatedResult<TeacherDirectoryItem>> {
      const snap = repo.read();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const q = (input.search ?? '').trim().toLowerCase();

      const teacherMembers = snap.data.members.filter((m) => m['role'] === 'teacher');
      const items: TeacherDirectoryItem[] = teacherMembers
        .map((m) => {
          const base = toMemberWithProfile(m, input.institutionId);
          const myAssigns = snap.aux.teacherAssignments.filter((a) => a.membership_id === m.id);
          const courses = myAssigns
            .map((a) => {
              const c = snap.data.courses.find((course) => course.id === a.course_id);
              if (!c) return null;
              return {
                id: c.id,
                code: str(c['code']),
                title: str(c['title']),
                sessionId: a.academic_session_id,
                departmentId: nullableStr(c['departmentId']),
              };
            })
            .filter((x): x is { id: string; code: string; title: string; sessionId: string; departmentId: string | null } => Boolean(x));
          return {
            ...base,
            assignmentsCount: myAssigns.length,
            courses: courses.map(({ id, code, title, sessionId }) => ({ id, code, title, sessionId })),
            _deptIds: new Set(courses.map((c) => c.departmentId).filter(Boolean)),
          };
        })
        .filter((item) => {
          if (input.status && item.status !== input.status) return false;
          if (input.departmentId) {
            const teacherRec = snap.data.teachers.find((t) => t['membershipId'] === item.id || t['email'] === item.profile?.email);
            const matchesRec = teacherRec && teacherRec['departmentId'] === input.departmentId;
            if (!matchesRec && !item._deptIds.has(input.departmentId)) return false;
          }
          if (q) {
            const hay = `${item.profile?.full_name ?? ''} ${item.profile?.email ?? ''} ${item.courses.map((c) => `${c.code} ${c.title}`).join(' ')}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .map(({ _deptIds: _, ...rest }) => rest);

      const start = (page - 1) * pageSize;
      return {
        items: items.slice(start, start + pageSize),
        total: items.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
      };
    },

    async createTeacherAssignment(raw: {
      institutionId: string;
      membershipId: string;
      courseId: string;
      academicSessionId: string;
      academicTermId?: string | null;
      classSectionId?: string | null;
    }): Promise<TeacherAssignmentRow> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const row: TeacherAssignmentRow = {
          id: makeId('ta'),
          institution_id: raw.institutionId,
          membership_id: raw.membershipId,
          course_id: raw.courseId,
          academic_session_id: raw.academicSessionId,
          academic_term_id: raw.academicTermId ?? null,
          class_section_id: raw.classSectionId ?? null,
          assigned_by: 'local-user-institution',
          created_at: now,
        };
        snap.aux.teacherAssignments = [...snap.aux.teacherAssignments, row];
        appendAudit(snap, 'academic.teacher_assigned', 'teacher_assignment', row.id, {
          courseId: raw.courseId,
        });
        return row;
      });
    },

    async deleteTeacherAssignment(input: { institutionId: string; assignmentId: string }) {
      repo.mutate((snap) => {
        snap.aux.teacherAssignments = snap.aux.teacherAssignments.filter(
          (a) => a.id !== input.assignmentId,
        );
        appendAudit(snap, 'academic.teacher_unassigned', 'teacher_assignment', input.assignmentId);
      });
      return { ok: true };
    },

    async listStudents(input: {
      institutionId: string;
      search?: string;
      status?: 'active' | 'graduated' | 'withdrawn' | 'suspended';
      sessionId?: string;
      sectionId?: string;
      programId?: string;
      page?: number;
      pageSize?: number;
    }): Promise<PaginatedResult<StudentDirectoryItem>> {
      const snap = repo.read();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const q = (input.search ?? '').trim().toLowerCase();

      const items: StudentDirectoryItem[] = snap.data.students
        .map((st) => {
          const now = str(st['created_at'], new Date().toISOString());
          const enrollments = snap.aux.enrollments
            .filter((e) => e.student_id === st.id)
            .map((e) => {
              const sess = snap.aux.sessions.find((s) => s.id === e.academic_session_id);
              const term = snap.aux.terms.find((t) => t.id === e.academic_term_id);
              const sec = snap.aux.sections.find((s) => s.id === e.class_section_id);
              const cls = sec ? snap.aux.classes.find((c) => c.id === sec.class_id) : undefined;
              return {
                ...e,
                sessionName: sess?.name ?? 'Session',
                termName: term?.name ?? null,
                sectionName: sec?.name ?? 'Section',
                className: cls?.name ?? 'Class',
                classCode: cls?.code ?? 'CLS',
                programId: cls?.program_id ?? null,
              };
            });

          return {
            id: st.id,
            institution_id: input.institutionId,
            membership_id: nullableStr(st['membershipId']),
            student_code: str(st['studentCode']),
            full_name: str(st['fullName']),
            email: nullableStr(st['email']),
            phone: nullableStr(st['phone']),
            status: str(st['status'], 'active') as StudentDirectoryItem['status'],
            created_by: str(st['createdBy'], 'local-user-institution'),
            created_at: now,
            updated_at: now,
            enrollments,
          };
        })
        .filter((item) => {
          if (input.status && item.status !== input.status) return false;
          if (input.sessionId && !item.enrollments.some((e) => e.academic_session_id === input.sessionId)) {
            return false;
          }
          if (input.sectionId && !item.enrollments.some((e) => e.class_section_id === input.sectionId)) {
            return false;
          }
          if (input.programId && !item.enrollments.some((e) => e.programId === input.programId)) {
            return false;
          }
          if (q) {
            const hay = `${item.full_name} ${item.student_code} ${item.email ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

      const start = (page - 1) * pageSize;
      return {
        items: items.slice(start, start + pageSize),
        total: items.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
      };
    },

    async createStudent(
      raw: z.input<typeof createStudentSchema>,
    ): Promise<{ student: StudentRecordRow; enrollment: StudentEnrollmentRow | null }> {
      const input = createStudentSchema.parse(raw);
      return repo.mutate((snap) => {
        const dup = snap.data.students.some(
          (s) => str(s['studentCode']).toLowerCase() === input.studentCode.toLowerCase(),
        );
        if (dup) throw new Error(`Student code "${input.studentCode}" already exists.`);
        const now = new Date().toISOString();
        const studentEntity: LocalEntity = {
          id: makeId('student'),
          membershipId: null,
          studentCode: input.studentCode,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          status: input.status ?? 'active',
          createdBy: 'local-user-institution',
          created_at: now,
        };
        snap.data.students = [studentEntity, ...snap.data.students];

        let enrollment: StudentEnrollmentRow | null = null;
        if (input.academicSessionId && input.classSectionId) {
          enrollment = {
            id: makeId('enroll'),
            institution_id: input.institutionId,
            student_id: studentEntity.id,
            academic_session_id: input.academicSessionId,
            academic_term_id: input.academicTermId ?? null,
            class_section_id: input.classSectionId,
            status: 'enrolled',
            enrolled_by: 'local-user-institution',
            enrolled_at: now,
            updated_at: now,
          };
          snap.aux.enrollments.push(enrollment);
        }
        appendAudit(snap, 'academic.student_created', 'student', studentEntity.id, {
          studentCode: input.studentCode,
        });
        const student: StudentRecordRow = {
          id: studentEntity.id,
          institution_id: input.institutionId,
          membership_id: null,
          student_code: input.studentCode,
          full_name: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          status: input.status ?? 'active',
          created_by: 'local-user-institution',
          created_at: now,
          updated_at: now,
        };
        return { student, enrollment };
      });
    },

    async enrollStudent(input: {
      institutionId: string;
      studentId: string;
      academicSessionId: string;
      academicTermId?: string | null;
      classSectionId: string;
    }): Promise<StudentEnrollmentRow> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const row: StudentEnrollmentRow = {
          id: makeId('enroll'),
          institution_id: input.institutionId,
          student_id: input.studentId,
          academic_session_id: input.academicSessionId,
          academic_term_id: input.academicTermId ?? null,
          class_section_id: input.classSectionId,
          status: 'enrolled',
          enrolled_by: 'local-user-institution',
          enrolled_at: now,
          updated_at: now,
        };
        snap.aux.enrollments = [...snap.aux.enrollments, row];
        appendAudit(snap, 'academic.student_enrolled', 'student_enrollment', row.id, {
          studentId: input.studentId,
        });
        return row;
      });
    },

    async updateEnrollmentStatus(input: {
      institutionId: string;
      enrollmentId: string;
      status: 'enrolled' | 'dropped' | 'completed';
    }) {
      return repo.mutate((snap) => {
        const idx = snap.aux.enrollments.findIndex((e) => e.id === input.enrollmentId);
        if (idx < 0) throw new Error('Enrollment record not found');
        const updated = {
          ...snap.aux.enrollments[idx]!,
          status: input.status,
          updated_at: new Date().toISOString(),
        };
        snap.aux.enrollments[idx] = updated;
        appendAudit(snap, 'academic.enrollment_updated', 'student_enrollment', input.enrollmentId, {
          status: input.status,
        });
        return updated;
      });
    },

    async deleteStudent(input: { institutionId: string; studentId: string }) {
      repo.mutate((snap) => {
        snap.data.students = snap.data.students.filter((s) => s.id !== input.studentId);
        snap.aux.enrollments = snap.aux.enrollments.filter((e) => e.student_id !== input.studentId);
        appendAudit(snap, 'academic.student_deleted', 'student', input.studentId);
      });
      return { ok: true };
    },

    async importStudentsCsv(input: {
      institutionId: string;
      fileName: string;
      csvText: string;
      defaultSessionId?: string | null;
      defaultSectionId?: string | null;
    }): Promise<CsvImportSummary> {
      const parsed = parseAndValidateStudentCsv(input.csvText);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        let importedCount = 0;
        let enrolledCount = 0;

        for (const row of parsed.validRows) {
          const existing = snap.data.students.find(
            (s) => str(s['studentCode']).toLowerCase() === row.student_code.toLowerCase(),
          );
          let studentId = existing?.id;
          if (!existing) {
            studentId = makeId('student');
            snap.data.students.push({
              id: studentId,
              membershipId: null,
              studentCode: row.student_code,
              fullName: row.full_name,
              email: row.email,
              phone: row.phone,
              status: row.status,
              createdBy: 'local-user-institution',
              created_at: now,
            });
            importedCount++;
          }
          if (studentId && input.defaultSessionId && input.defaultSectionId) {
            const alreadyEnrolled = snap.aux.enrollments.some(
              (e) =>
                e.student_id === studentId &&
                e.academic_session_id === input.defaultSessionId &&
                e.class_section_id === input.defaultSectionId,
            );
            if (!alreadyEnrolled) {
              snap.aux.enrollments.push({
                id: makeId('enroll'),
                institution_id: input.institutionId,
                student_id: studentId,
                academic_session_id: input.defaultSessionId,
                academic_term_id: null,
                class_section_id: input.defaultSectionId,
                status: 'enrolled',
                enrolled_by: 'local-user-institution',
                enrolled_at: now,
                updated_at: now,
              });
              enrolledCount++;
            }
          }
        }

        const totalRows = parsed.totalRows;
        snap.aux.csvImportJobs.unshift({
          id: makeId('csv-job'),
          institution_id: input.institutionId,
          uploaded_by: 'local-user-institution',
          entity_type: 'students',
          file_name: input.fileName,
          total_rows: totalRows,
          imported_count: importedCount,
          error_count: parsed.errors.length,
          errors: parsed.errors as unknown as Json,
          created_at: now,
        });

        appendAudit(snap, 'academic.students_csv_imported', 'csv_import_job', null, {
          fileName: input.fileName,
          importedCount,
          enrolledCount,
        });

        return {
          totalRows,
          validRows: parsed.validRows.length,
          importedCount,
          enrolledCount,
          errorCount: parsed.errors.length,
          errors: parsed.errors,
        };
      });
    },

    async listCsvImportJobs(input: { institutionId: string }): Promise<CsvImportJobRow[]> {
      return [...repo.read().aux.csvImportJobs];
    },

    // -------------------------------------------------------------------------
    // QUESTION BANK
    // -------------------------------------------------------------------------
    async getQuestionBankCatalog(input: { institutionId: string }): Promise<QuestionBankCatalog> {
      const snap = repo.read();
      const topics = Array.from(
        new Set(snap.data.questionBank.map((q) => str(q['topic'])).filter(Boolean)),
      ).sort();
      const categories = Array.from(
        new Set(snap.data.questionBank.map((q) => str(q['category'])).filter(Boolean)),
      ).sort();
      const qs = snap.data.questionBank;
      return {
        courses: snap.data.courses.map((c) => ({
          id: c.id,
          code: str(c['code']),
          title: str(c['title']),
          status: str(c['status'], 'active') as CourseStatus,
        })),
        topics,
        categories,
        stats: {
          total: qs.length,
          active: qs.filter((q) => str(q['status'], 'active') === 'active').length,
          draft: qs.filter((q) => str(q['status']) === 'draft').length,
          archived: qs.filter((q) => str(q['status']) === 'archived').length,
          mcqCount: qs.filter((q) => str(q['questionType']).startsWith('mcq')).length,
          writtenCount: qs.filter((q) => !str(q['questionType']).startsWith('mcq')).length,
        },
      };
    },

    async listQuestions(input: {
      institutionId: string;
      search?: string;
      courseId?: string;
      topic?: string;
      category?: string;
      difficulty?: QuestionDifficulty;
      questionType?: QuestionType;
      status?: QuestionStatus;
      includeArchived?: boolean;
      page?: number;
      pageSize?: number;
    }): Promise<PaginatedResult<EducatorQuestionItem>> {
      const snap = repo.read();
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const q = (input.search ?? '').trim().toLowerCase();

      const items = snap.data.questionBank
        .map((item) => toEducatorQuestion(item, snap, input.institutionId))
        .filter((item) => {
          if (!input.includeArchived && !input.status && item.status === 'archived') return false;
          if (input.status && item.status !== input.status) return false;
          if (input.courseId && item.course_id !== input.courseId) return false;
          if (input.topic && item.topic !== input.topic) return false;
          if (input.category && item.category !== input.category) return false;
          if (input.difficulty && item.difficulty !== input.difficulty) return false;
          if (input.questionType && item.question_type !== input.questionType) return false;
          if (q) {
            const hay = `${item.title} ${item.prompt} ${item.topic} ${item.tags.join(' ')}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

      const start = (page - 1) * pageSize;
      return {
        items: items.slice(start, start + pageSize),
        total: items.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
      };
    },

    async createQuestion(raw: SaveQuestionInput): Promise<EducatorQuestionItem> {
      const input = saveQuestionSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const isMcq = input.questionType === 'mcq_single' || input.questionType === 'mcq_multi';
        if (isMcq && (!input.options || input.options.filter((o) => o.optionText.trim()).length < 2)) {
          throw new Error('MCQ questions require at least 2 options.');
        }
        if (isMcq && (!input.correctOptionKeys || input.correctOptionKeys.length === 0)) {
          throw new Error('Select at least 1 correct option.');
        }

        const entity: LocalEntity = {
          id: makeId('q'),
          courseId: input.courseId ?? null,
          questionType: input.questionType,
          title: input.title,
          prompt: input.prompt,
          topic: input.topic,
          category: input.category,
          difficulty: input.difficulty,
          marks: input.marks,
          negativeMarks: input.negativeMarks,
          expectedWordCount: input.expectedWordCount ?? null,
          tags: input.tags ?? [],
          status: input.status ?? 'active',
          options: isMcq
            ? (input.options ?? []).map((o) => ({
                key: o.optionKey,
                optionKey: o.optionKey,
                text: o.optionText,
                optionText: o.optionText,
                sortOrder: o.sortOrder,
              }))
            : [],
          correctOptionKeys: isMcq ? input.correctOptionKeys ?? [] : [],
          sampleAnswer: input.sampleAnswer ?? null,
          gradingRubric: input.gradingRubric ?? null,
          explanation: input.explanation ?? null,
          createdBy: 'local-user-teacher',
          createdAt: now,
          updatedAt: now,
        };
        snap.data.questionBank = [entity, ...snap.data.questionBank];
        appendAudit(snap, 'question_bank.created', 'question', entity.id, { title: input.title });
        return toEducatorQuestion(entity, snap, input.institutionId);
      });
    },

    async updateQuestion(raw: SaveQuestionInput & { questionId: string }): Promise<EducatorQuestionItem> {
      const input = saveQuestionSchema.extend({ questionId: idSchema }).parse(raw);
      return repo.mutate((snap) => {
        const idx = snap.data.questionBank.findIndex((q) => q.id === input.questionId);
        if (idx < 0) throw new Error('Question not found');
        const current = snap.data.questionBank[idx]!;
        const isMcq = input.questionType === 'mcq_single' || input.questionType === 'mcq_multi';
        const updated: LocalEntity = {
          ...current,
          courseId: input.courseId ?? null,
          questionType: input.questionType,
          title: input.title,
          prompt: input.prompt,
          topic: input.topic,
          category: input.category,
          difficulty: input.difficulty,
          marks: input.marks,
          negativeMarks: input.negativeMarks,
          expectedWordCount: input.expectedWordCount ?? null,
          tags: input.tags ?? [],
          status: input.status ?? str(current['status'], 'active'),
          options: isMcq
            ? (input.options ?? []).map((o) => ({
                key: o.optionKey,
                optionKey: o.optionKey,
                text: o.optionText,
                optionText: o.optionText,
                sortOrder: o.sortOrder,
              }))
            : [],
          correctOptionKeys: isMcq ? input.correctOptionKeys ?? [] : [],
          sampleAnswer: input.sampleAnswer ?? null,
          gradingRubric: input.gradingRubric ?? null,
          explanation: input.explanation ?? null,
          updatedBy: 'local-user-teacher',
          updatedAt: new Date().toISOString(),
        };
        snap.data.questionBank[idx] = updated;
        appendAudit(snap, 'question_bank.updated', 'question', input.questionId, { title: input.title });
        return toEducatorQuestion(updated, snap, input.institutionId);
      });
    },

    async duplicateQuestion(input: { institutionId: string; questionId: string }): Promise<EducatorQuestionItem> {
      return repo.mutate((snap) => {
        const orig = snap.data.questionBank.find((q) => q.id === input.questionId);
        if (!orig) throw new Error('Question not found');
        const now = new Date().toISOString();
        const copy: LocalEntity = {
          ...orig,
          id: makeId('q'),
          title: `${str(orig['title'])} (Copy)`,
          status: 'draft',
          sourceQuestionId: orig.id,
          createdAt: now,
          updatedAt: now,
          sample: false,
        };
        snap.data.questionBank = [copy, ...snap.data.questionBank];
        appendAudit(snap, 'question_bank.duplicated', 'question', copy.id, { sourceId: orig.id });
        return toEducatorQuestion(copy, snap, input.institutionId);
      });
    },

    async setQuestionStatus(input: {
      institutionId: string;
      questionId: string;
      status: QuestionStatus;
    }): Promise<EducatorQuestionItem> {
      return repo.mutate((snap) => {
        const idx = snap.data.questionBank.findIndex((q) => q.id === input.questionId);
        if (idx < 0) throw new Error('Question not found');
        const updated = {
          ...snap.data.questionBank[idx]!,
          status: input.status,
          updatedAt: new Date().toISOString(),
        };
        snap.data.questionBank[idx] = updated;
        appendAudit(snap, 'question_bank.status_changed', 'question', input.questionId, {
          status: input.status,
        });
        return toEducatorQuestion(updated, snap, input.institutionId);
      });
    },

    async deleteQuestion(input: { institutionId: string; questionId: string }) {
      repo.mutate((snap) => {
        snap.data.questionBank = snap.data.questionBank.filter((q) => q.id !== input.questionId);
        snap.aux.attachments = snap.aux.attachments.filter((a) => a.question_id !== input.questionId);
        appendAudit(snap, 'question_bank.deleted', 'question', input.questionId);
      });
      return { ok: true };
    },

    async attachQuestionFile(input: {
      institutionId: string;
      questionId: string;
      fileName: string;
      storagePath: string;
      mimeType: string;
      fileSizeBytes: number;
      dataUrl?: string | null;
    }): Promise<QuestionAttachmentWithUrl> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const att = {
          id: makeId('att'),
          institution_id: input.institutionId,
          question_id: input.questionId,
          file_name: input.fileName,
          storage_path: input.storagePath,
          mime_type: input.mimeType,
          file_size_bytes: input.fileSizeBytes,
          attachment_kind: (input.mimeType.startsWith('image/') ? 'image' : 'document') as 'image' | 'document',
          uploaded_by: 'local-user-teacher',
          created_at: now,
          dataUrl: input.dataUrl ?? null,
        };
        snap.aux.attachments.push(att);
        return {
          id: att.id,
          institution_id: att.institution_id,
          question_id: att.question_id,
          file_name: att.file_name,
          storage_path: att.storage_path,
          mime_type: att.mime_type,
          file_size_bytes: att.file_size_bytes,
          attachment_kind: att.attachment_kind,
          uploaded_by: att.uploaded_by,
          created_at: att.created_at,
          signedUrl: att.dataUrl,
        };
      });
    },

    async deleteQuestionAttachment(input: { institutionId: string; attachmentId: string }) {
      repo.mutate((snap) => {
        snap.aux.attachments = snap.aux.attachments.filter((a) => a.id !== input.attachmentId);
      });
      return { ok: true };
    },

    async importQuestionsCsv(input: {
      institutionId: string;
      fileName: string;
      csvText: string;
      defaultCourseId?: string | null;
    }): Promise<QuestionCsvImportSummary> {
      const parsed = parseAndValidateQuestionCsv(input.csvText);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        let importedCount = 0;

        for (const row of parsed.validRows) {
          const entity: LocalEntity = {
            id: makeId('q'),
            courseId: input.defaultCourseId ?? null,
            questionType: row.question_type,
            title: row.title,
            prompt: row.prompt,
            topic: row.topic,
            category: row.category,
            difficulty: row.difficulty,
            marks: row.marks,
            negativeMarks: row.negative_marks,
            expectedWordCount: row.expected_word_count,
            tags: row.tags,
            status: row.status,
            options: row.options.map((o) => ({
              key: o.option_key,
              optionKey: o.option_key,
              text: o.option_text,
              optionText: o.option_text,
              sortOrder: o.sort_order,
            })),
            correctOptionKeys: row.correct_option_keys,
            sampleAnswer: row.sample_answer,
            gradingRubric: row.grading_rubric,
            explanation: row.explanation,
            createdBy: 'local-user-teacher',
            createdAt: now,
            updatedAt: now,
          };
          snap.data.questionBank.unshift(entity);
          importedCount++;
        }

        const totalRows = parsed.totalRows;
        snap.aux.questionImportJobs.unshift({
          id: makeId('q-csv'),
          institution_id: input.institutionId,
          uploaded_by: 'local-user-teacher',
          entity_type: 'questions',
          file_name: input.fileName,
          total_rows: totalRows,
          imported_count: importedCount,
          error_count: parsed.errors.length,
          errors: parsed.errors as unknown as Json,
          created_at: now,
        });

        appendAudit(snap, 'question_bank.csv_imported', 'question_import', null, {
          fileName: input.fileName,
          importedCount,
        });

        return {
          totalRows,
          validRows: parsed.validRows.length,
          importedCount,
          errorCount: parsed.errors.length,
          errors: parsed.errors,
        };
      });
    },

    async listQuestionImportJobs(input: { institutionId: string }): Promise<CsvImportJobRow[]> {
      return [...repo.read().aux.questionImportJobs];
    },

    async listQuestionSets(input: { institutionId: string }): Promise<QuestionSetWithItems[]> {
      const snap = repo.read();
      return snap.aux.questionSets.map((set) => {
        const course = snap.data.courses.find((c) => c.id === set.course_id);
        const items = set.items.map((it) => {
          const q = snap.data.questionBank.find((qb) => qb.id === it.question_id);
          return {
            id: it.id,
            question_id: it.question_id,
            sort_order: it.sort_order,
            marks_override: null,
            question: q
              ? {
                  id: q.id,
                  title: str(q['title']),
                  question_type: str(q['questionType'], 'mcq_single') as QuestionType,
                  difficulty: str(q['difficulty'], 'medium') as QuestionDifficulty,
                  marks: num(q['marks'], 1),
                  topic: str(q['topic'], 'General'),
                  status: str(q['status'], 'active') as QuestionStatus,
                }
              : null,
          };
        });
        return {
          id: set.id,
          institution_id: input.institutionId,
          course_id: set.course_id,
          courseCode: course ? str(course['code']) : null,
          courseTitle: course ? str(course['title']) : null,
          title: set.title,
          description: set.description,
          created_by: set.created_by,
          created_at: set.created_at,
          updated_at: set.updated_at,
          totalMarks: items.reduce((s, i) => s + (i.question?.marks ?? 0), 0),
          items,
        };
      });
    },

    async createQuestionSet(input: {
      institutionId: string;
      title: string;
      description?: string | null;
      courseId?: string | null;
      questionIds?: string[];
    }) {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const set = {
          id: makeId('qset'),
          institution_id: input.institutionId,
          course_id: input.courseId ?? null,
          title: input.title,
          description: input.description ?? null,
          created_by: 'local-user-teacher',
          created_at: now,
          updated_at: now,
          items: (input.questionIds ?? []).map((qid, idx) => ({
            id: makeId('qsi'),
            question_id: qid,
            sort_order: idx,
          })),
        };
        snap.aux.questionSets.unshift(set);
        appendAudit(snap, 'question_set.created', 'question_set', set.id, { title: set.title });
        return set;
      });
    },

    async addQuestionsToSet(input: {
      institutionId: string;
      questionSetId: string;
      questionIds: string[];
    }) {
      return repo.mutate((snap) => {
        const set = snap.aux.questionSets.find((s) => s.id === input.questionSetId);
        if (!set) throw new Error('Question set not found');
        const existing = new Set(set.items.map((i) => i.question_id));
        let added = 0;
        for (const qId of input.questionIds) {
          if (!existing.has(qId)) {
            set.items.push({ id: makeId('qsi'), question_id: qId, sort_order: set.items.length });
            existing.add(qId);
            added++;
          }
        }
        set.updated_at = new Date().toISOString();
        return { added };
      });
    },

    async removeQuestionFromSet(input: { institutionId: string; itemId: string }) {
      repo.mutate((snap) => {
        snap.aux.questionSets = snap.aux.questionSets.map((set) => ({
          ...set,
          items: set.items.filter((it) => it.id !== input.itemId),
        }));
      });
      return { ok: true };
    },

    async deleteQuestionSet(input: { institutionId: string; questionSetId: string }) {
      repo.mutate((snap) => {
        snap.aux.questionSets = snap.aux.questionSets.filter((s) => s.id !== input.questionSetId);
      });
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // EXAM BUILDER
    // -------------------------------------------------------------------------
    async getTeacherExamDashboard(input: { institutionId: string }): Promise<TeacherExamDashboardData> {
      const snap = repo.read();
      const nowMs = Date.now();
      const courses = snap.data.courses.map((c) => ({
        id: c.id,
        code: str(c['code']),
        title: str(c['title']),
      }));
      const sectionsByClass = new Map<string, string[]>();
      for (const sec of snap.aux.sections) {
        const arr = sectionsByClass.get(sec.class_id) ?? [];
        arr.push(sec.id);
        sectionsByClass.set(sec.class_id, arr);
      }
      const studentsBySection = new Map<string, Set<string>>();
      for (const enr of snap.aux.enrollments) {
        if (enr.status !== 'enrolled') continue;
        const set = studentsBySection.get(enr.class_section_id) ?? new Set<string>();
        set.add(enr.student_id);
        studentsBySection.set(enr.class_section_id, set);
      }

      const globalAssigned = new Set<string>();
      const exams: TeacherExamDashboardRow[] = snap.data.exams.map((ex) => {
        const summary = toExamSummaryItem(ex, snap, input.institutionId);
        const assignedSet = new Set<string>();
        for (const a of snap.aux.examAssignments.filter((as) => as.exam_id === ex.id)) {
          if (a.target_type === 'student' && a.student_id) assignedSet.add(a.student_id);
          else if (a.target_type === 'section' && a.class_section_id) {
            for (const sid of studentsBySection.get(a.class_section_id) ?? []) assignedSet.add(sid);
          } else if (a.target_type === 'class' && a.class_id) {
            for (const secId of sectionsByClass.get(a.class_id) ?? []) {
              for (const sid of studentsBySection.get(secId) ?? []) assignedSet.add(sid);
            }
          }
        }
        for (const sid of assignedSet) globalAssigned.add(sid);

        const examGrades = snap.data.grades.filter((g) => g['examId'] === ex.id);
        const gradedCount = examGrades.length;
        const avgScore =
          gradedCount > 0
            ? examGrades.reduce((s, g) => s + num(g['totalAwardedMarks'], 0), 0) / gradedCount
            : null;
        const avgPct =
          gradedCount > 0
            ? examGrades.reduce((s, g) => s + num(g['percentage'], 0), 0) / gradedCount
            : null;

        return {
          id: ex.id,
          title: summary.title,
          description: summary.description,
          courseId: summary.course_id,
          courseCode: summary.courseCode,
          courseTitle: summary.courseTitle,
          status: summary.status,
          bucket: classifyExamBucket(summary, nowMs),
          starts_at: summary.starts_at,
          ends_at: summary.ends_at,
          duration_minutes: summary.duration_minutes,
          total_marks: summary.total_marks,
          passing_marks: summary.passing_marks,
          passing_percentage: summary.passing_percentage,
          sectionCount: summary.sectionCount,
          questionCount: summary.questionCount,
          assignedCohortCount: assignedSet.size,
          participantCount: summary.totalAttempts,
          averageScore: avgScore,
          averagePercentage: avgPct,
          gradedCount,
          current_version_number: summary.current_version_number,
          updated_at: summary.updated_at,
        };
      });

      const allGrades = snap.data.grades;
      const totalGraded = allGrades.length;
      return {
        summary: {
          activeCount: exams.filter((e) => e.bucket === 'active').length,
          upcomingCount: exams.filter((e) => e.bucket === 'upcoming').length,
          archivedCount: exams.filter((e) => e.bucket === 'archived').length,
          draftCount: exams.filter((e) => e.bucket === 'draft').length,
          totalParticipants: exams.reduce((s, e) => s + e.participantCount, 0),
          totalAssignedStudents: globalAssigned.size,
          overallAverageScore:
            totalGraded > 0
              ? allGrades.reduce((s, g) => s + num(g['totalAwardedMarks'], 0), 0) / totalGraded
              : null,
          overallAveragePercentage:
            totalGraded > 0
              ? allGrades.reduce((s, g) => s + num(g['percentage'], 0), 0) / totalGraded
              : null,
          totalGradedSubmissions: totalGraded,
        },
        courses,
        exams,
      };
    },

    async getExamBuilderCatalog(input: { institutionId: string }): Promise<ExamBuilderCatalog> {
      const snap = repo.read();
      const questionSets = await this.listQuestionSets(input);
      return {
        courses: snap.data.courses.map((c) => ({
          id: c.id,
          code: str(c['code']),
          title: str(c['title']),
          status: str(c['status'], 'active') as CourseStatus,
        })),
        sessions: snap.aux.sessions.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          is_current: s.is_current,
        })),
        terms: snap.aux.terms.map((t) => ({
          id: t.id,
          session_id: t.session_id,
          name: t.name,
          is_current: t.is_current,
        })),
        classes: snap.aux.classes.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          level_order: c.level_order,
        })),
        sections: snap.aux.sections.map((s) => ({
          id: s.id,
          class_id: s.class_id,
          name: s.name,
          capacity: s.capacity,
        })),
        students: snap.data.students.map((st) => ({
          id: st.id,
          student_code: str(st['studentCode']),
          full_name: str(st['fullName']),
          email: nullableStr(st['email']),
          status: str(st['status'], 'active'),
        })),
        questionSets,
      };
    },

    async listExams(input: {
      institutionId: string;
      search?: string;
      status?: ExamSummaryItem['status'];
      courseId?: string;
    }): Promise<ExamSummaryItem[]> {
      const snap = repo.read();
      const q = (input.search ?? '').trim().toLowerCase();
      return snap.data.exams
        .map((ex) => toExamSummaryItem(ex, snap, input.institutionId))
        .filter((ex) => {
          if (input.status && ex.status !== input.status) return false;
          if (input.courseId && ex.course_id !== input.courseId) return false;
          if (q) {
            const hay = `${ex.title} ${ex.description ?? ''} ${ex.courseCode ?? ''} ${ex.courseTitle ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
    },

    async getExamDetail(input: { institutionId: string; examId: string }): Promise<ExamDetail> {
      return buildExamDetailFromSnap(repo.read(), input.institutionId, input.examId);
    },

    async createExamDraft(raw: SaveExamConfigInput): Promise<ExamDetail> {
      const input = saveExamConfigSchema.parse(raw);
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const examId = makeId('exam');
        snap.data.exams = [
          {
            id: examId,
            title: input.title,
            description: input.description ?? null,
            courseId: input.courseId ?? null,
            academicSessionId: input.academicSessionId ?? null,
            academicTermId: input.academicTermId ?? null,
            instructions: input.instructions ?? null,
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            durationMinutes: input.durationMinutes,
            passingMarks: input.passingMarks ?? null,
            passingPercentage: input.passingPercentage ?? null,
            negativeMarkingEnabled: input.negativeMarkingEnabled,
            defaultNegativeMarks: input.defaultNegativeMarks,
            shuffleQuestions: input.shuffleQuestions,
            shuffleOptions: input.shuffleOptions,
            status: 'draft',
            totalMarks: 0,
            questionIds: [],
            currentVersionNumber: 0,
            latestPublishedVersionId: null,
            publishedAt: null,
            closedAt: null,
            createdBy: 'local-user-teacher',
            createdAt: now,
            updatedAt: now,
          },
          ...snap.data.exams,
        ];
        appendAudit(snap, 'exam.draft_created', 'exam', examId, { title: input.title });
        return buildExamDetailFromSnap(snap, input.institutionId, examId);
      });
    },

    async updateExamDraft(raw: SaveExamConfigInput & { examId: string }): Promise<ExamDetail> {
      const input = saveExamConfigSchema.extend({ examId: idSchema }).parse(raw);
      return repo.mutate((snap) => {
        const idx = snap.data.exams.findIndex((e) => e.id === input.examId);
        if (idx < 0) throw new Error('Exam not found');
        const current = snap.data.exams[idx]!;
        if (str(current['status']) !== 'draft') {
          throw new Error('Only draft exams can be edited. Create a draft revision first.');
        }
        snap.data.exams[idx] = {
          ...current,
          title: input.title,
          description: input.description ?? null,
          courseId: input.courseId ?? null,
          academicSessionId: input.academicSessionId ?? null,
          academicTermId: input.academicTermId ?? null,
          instructions: input.instructions ?? null,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          durationMinutes: input.durationMinutes,
          passingMarks: input.passingMarks ?? null,
          passingPercentage: input.passingPercentage ?? null,
          negativeMarkingEnabled: input.negativeMarkingEnabled,
          defaultNegativeMarks: input.defaultNegativeMarks,
          shuffleQuestions: input.shuffleQuestions,
          shuffleOptions: input.shuffleOptions,
          updatedAt: new Date().toISOString(),
        };
        appendAudit(snap, 'exam.draft_updated', 'exam', input.examId, { title: input.title });
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async addExamSection(input: {
      institutionId: string;
      examId: string;
      title: string;
      description?: string | null;
      sectionType: 'mcq' | 'descriptive' | 'mixed';
      shuffleQuestions?: boolean;
    }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        const existing = snap.aux.examSections.filter((s) => s.exam_id === input.examId);
        const sec: LocalExamSectionRecord = {
          id: makeId('sec'),
          institution_id: input.institutionId,
          exam_id: input.examId,
          title: input.title,
          description: input.description ?? null,
          section_type: input.sectionType,
          sort_order: existing.length,
          shuffle_questions: input.shuffleQuestions ?? false,
        };
        snap.aux.examSections.push(sec);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async deleteExamSection(input: { institutionId: string; examId: string; sectionId: string }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        snap.aux.examSections = snap.aux.examSections.filter((s) => s.id !== input.sectionId);
        snap.aux.examSectionQuestions = snap.aux.examSectionQuestions.filter((sq) => sq.section_id !== input.sectionId);
        syncExamEntityMarksAndQuestionIds(snap, input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async addQuestionsToExamSection(input: {
      institutionId: string;
      examId: string;
      sectionId: string;
      questionIds: string[];
    }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        const ex = snap.data.exams.find((e) => e.id === input.examId);
        const existingIds = new Set(
          snap.aux.examSectionQuestions.filter((sq) => sq.exam_id === input.examId).map((sq) => sq.question_id),
        );
        let sortBase = snap.aux.examSectionQuestions.filter((sq) => sq.section_id === input.sectionId).length;
        for (const qId of input.questionIds) {
          if (existingIds.has(qId)) continue;
          const q = snap.data.questionBank.find((item) => item.id === qId);
          if (!q) continue;
          const neg = bool(ex?.['negativeMarkingEnabled'], false)
            ? num(q['negativeMarks'], num(ex?.['defaultNegativeMarks'], 0))
            : 0;
          const rec: LocalExamSectionQuestionRecord = {
            id: makeId('esq'),
            exam_id: input.examId,
            section_id: input.sectionId,
            question_id: qId,
            sort_order: sortBase++,
            marks: num(q['marks'], 1),
            negative_marks: neg,
          };
          snap.aux.examSectionQuestions.push(rec);
          existingIds.add(qId);
        }
        syncExamEntityMarksAndQuestionIds(snap, input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async importQuestionSetToExamSection(input: {
      institutionId: string;
      examId: string;
      sectionId: string;
      questionSetId: string;
    }): Promise<{ detail: ExamDetail; addedCount: number; skippedCount: number }> {
      return repo.mutate((snap) => {
        const set = snap.aux.questionSets.find((s) => s.id === input.questionSetId);
        if (!set) throw new Error('Question set not found');
        const before = snap.aux.examSectionQuestions.filter((sq) => sq.exam_id === input.examId).length;
        const existingIds = new Set(
          snap.aux.examSectionQuestions.filter((sq) => sq.exam_id === input.examId).map((sq) => sq.question_id),
        );
        let sortBase = snap.aux.examSectionQuestions.filter((sq) => sq.section_id === input.sectionId).length;
        for (const item of set.items) {
          if (existingIds.has(item.question_id)) continue;
          const q = snap.data.questionBank.find((qb) => qb.id === item.question_id);
          if (!q) continue;
          snap.aux.examSectionQuestions.push({
            id: makeId('esq'),
            exam_id: input.examId,
            section_id: input.sectionId,
            question_id: item.question_id,
            sort_order: sortBase++,
            marks: num(q['marks'], 1),
            negative_marks: num(q['negativeMarks'], 0),
          });
          existingIds.add(item.question_id);
        }
        syncExamEntityMarksAndQuestionIds(snap, input.examId);
        const after = snap.aux.examSectionQuestions.filter((sq) => sq.exam_id === input.examId).length;
        const addedCount = after - before;
        return {
          detail: buildExamDetailFromSnap(snap, input.institutionId, input.examId),
          addedCount,
          skippedCount: Math.max(0, set.items.length - addedCount),
        };
      });
    },

    async updateExamQuestionConfig(input: {
      institutionId: string;
      examId: string;
      sectionQuestionId: string;
      marks: number;
      negativeMarks: number;
    }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        snap.aux.examSectionQuestions = snap.aux.examSectionQuestions.map((sq) =>
          sq.id === input.sectionQuestionId
            ? { ...sq, marks: input.marks, negative_marks: input.negativeMarks }
            : sq,
        );
        syncExamEntityMarksAndQuestionIds(snap, input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async removeExamQuestion(input: {
      institutionId: string;
      examId: string;
      sectionQuestionId: string;
    }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        snap.aux.examSectionQuestions = snap.aux.examSectionQuestions.filter(
          (sq) => sq.id !== input.sectionQuestionId,
        );
        syncExamEntityMarksAndQuestionIds(snap, input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async setExamAssignments(input: {
      institutionId: string;
      examId: string;
      classIds: string[];
      sectionIds: string[];
      studentIds: string[];
    }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const others = snap.aux.examAssignments.filter((a) => a.exam_id !== input.examId);
        const next = [
          ...others,
          ...input.classIds.map((class_id) => ({
            id: makeId('assign'),
            exam_id: input.examId,
            target_type: 'class' as const,
            class_id,
            class_section_id: null,
            student_id: null,
            created_at: now,
          })),
          ...input.sectionIds.map((class_section_id) => ({
            id: makeId('assign'),
            exam_id: input.examId,
            target_type: 'section' as const,
            class_id: null,
            class_section_id,
            student_id: null,
            created_at: now,
          })),
          ...input.studentIds.map((student_id) => ({
            id: makeId('assign'),
            exam_id: input.examId,
            target_type: 'student' as const,
            class_id: null,
            class_section_id: null,
            student_id,
            created_at: now,
          })),
        ];
        snap.aux.examAssignments = next;
        appendAudit(snap, 'exam.assignments_updated', 'exam', input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async previewExam(input: {
      institutionId: string;
      examId: string;
      mode: 'educator' | 'student';
    }): Promise<ExamPreviewData> {
      const snap = repo.read();
      const detail = buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      const warnings: string[] = [];
      if (detail.sections.length === 0) warnings.push('Add at least one section before publishing.');
      if (detail.exam.questionCount === 0) warnings.push('Add at least one question before publishing.');
      if (detail.assignments.length === 0) warnings.push('Assign at least one class, section, or student.');
      if (!detail.exam.starts_at || !detail.exam.ends_at) {
        warnings.push('Set start and end schedule dates before publishing.');
      }

      return {
        examId: detail.exam.id,
        title: detail.exam.title,
        description: detail.exam.description,
        instructions: detail.exam.instructions,
        courseLabel: detail.exam.courseCode ? `${detail.exam.courseCode} — ${detail.exam.courseTitle}` : null,
        status: detail.exam.status,
        versionNumber: detail.exam.current_version_number || null,
        startsAt: detail.exam.starts_at,
        endsAt: detail.exam.ends_at,
        durationMinutes: detail.exam.duration_minutes,
        totalMarks: detail.exam.total_marks,
        passingMarks: detail.exam.passing_marks,
        passingPercentage: detail.exam.passing_percentage,
        negativeMarkingEnabled: detail.exam.negative_marking_enabled,
        defaultNegativeMarks: detail.exam.default_negative_marks,
        shuffleQuestions: detail.exam.shuffle_questions,
        shuffleOptions: detail.exam.shuffle_options,
        mode: input.mode,
        sections: detail.sections.map((sec) => ({
          id: sec.id,
          title: sec.title,
          description: sec.description,
          section_type: sec.section_type,
          shuffle_questions: sec.shuffle_questions,
          questions: sec.questions.map((sq) => ({
            question: {
              id: sq.question.id,
              institution_id: input.institutionId,
              course_id: sq.question.course_id,
              question_type: sq.question.question_type,
              title: sq.question.title,
              prompt: sq.question.prompt,
              marks: sq.question.default_marks,
              negative_marks: sq.question.default_negative_marks,
              expected_word_count: sq.question.expected_word_count,
              options: sq.question.options,
            },
            effectiveMarks: sq.marks,
            effectiveNegativeMarks: sq.negative_marks,
            ...(input.mode === 'educator' ? { educatorAnswerKey: sq.question.answerKey } : {}),
          })),
        })),
        warnings,
      };
    },

    async publishExam(input: { institutionId: string; examId: string }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        const detail = buildExamDetailFromSnap(snap, input.institutionId, input.examId);
        if (detail.sections.length === 0 || detail.exam.questionCount === 0) {
          throw new Error('Cannot publish an exam without sections and questions.');
        }
        if (detail.assignments.length === 0) {
          throw new Error('Assign at least one class, section, or student before publishing.');
        }
        const now = new Date().toISOString();
        const startsAt = detail.exam.starts_at ?? now;
        const endsAt =
          detail.exam.ends_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const nextVersionNumber = detail.exam.current_version_number + 1;
        const versionId = makeId('ver');

        const answerKeys: Record<string, {
          correct_option_keys: string[];
          sample_answer: string | null;
          grading_rubric: string | null;
          explanation: string | null;
        }> = {};

        const snapshotPayload: ExamSnapshotPayload = {
          versionNumber: nextVersionNumber,
          publishedAt: now,
          examId: detail.exam.id,
          title: detail.exam.title,
          description: detail.exam.description,
          instructions: detail.exam.instructions,
          courseCode: detail.exam.courseCode,
          courseTitle: detail.exam.courseTitle,
          startsAt,
          endsAt,
          durationMinutes: detail.exam.duration_minutes,
          totalMarks: detail.exam.total_marks,
          passingMarks: detail.exam.passing_marks,
          passingPercentage: detail.exam.passing_percentage,
          negativeMarkingEnabled: detail.exam.negative_marking_enabled,
          defaultNegativeMarks: detail.exam.default_negative_marks,
          shuffleQuestions: detail.exam.shuffle_questions,
          shuffleOptions: detail.exam.shuffle_options,
          sections: detail.sections.map((sec) => ({
            id: sec.id,
            title: sec.title,
            description: sec.description,
            section_type: sec.section_type,
            sort_order: sec.sort_order,
            shuffle_questions: sec.shuffle_questions,
            sectionTotalMarks: sec.sectionTotalMarks,
            questions: sec.questions.map((sq) => {
              answerKeys[sq.question_id] = sq.question.answerKey;
              return {
                id: sq.question.id,
                institution_id: input.institutionId,
                course_id: sq.question.course_id,
                section_question_id: sq.id,
                sort_order: sq.sort_order,
                question_type: sq.question.question_type,
                title: sq.question.title,
                prompt: sq.question.prompt,
                marks: sq.question.default_marks,
                negative_marks: sq.question.default_negative_marks,
                effective_marks: sq.marks,
                effective_negative_marks: sq.negative_marks,
                expected_word_count: sq.question.expected_word_count,
                options: sq.question.options,
              };
            }),
          })),
          assignments: detail.assignments.map((a) => ({
            target_type: a.target_type,
            target_id: a.class_id ?? a.class_section_id ?? a.student_id ?? a.id,
            label: a.targetLabel,
          })),
        };

        snap.aux.examVersions.push({
          id: versionId,
          institution_id: input.institutionId,
          exam_id: detail.exam.id,
          version_number: nextVersionNumber,
          title: detail.exam.title,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: detail.exam.duration_minutes,
          total_marks: detail.exam.total_marks,
          passing_marks: detail.exam.passing_marks,
          passing_percentage: detail.exam.passing_percentage,
          negative_marking_enabled: detail.exam.negative_marking_enabled,
          default_negative_marks: detail.exam.default_negative_marks,
          shuffle_questions: detail.exam.shuffle_questions,
          shuffle_options: detail.exam.shuffle_options,
          attempt_count: 0,
          published_by: 'local-user-teacher',
          published_at: now,
          snapshot_payload: snapshotPayload,
          answer_keys: answerKeys,
        });

        snap.data.exams = snap.data.exams.map((ex) =>
          ex.id === detail.exam.id
            ? {
                ...ex,
                startsAt,
                endsAt,
                status: 'published',
                currentVersionNumber: nextVersionNumber,
                latestPublishedVersionId: versionId,
                publishedAt: now,
                updatedAt: now,
              }
            : ex,
        );

        appendAudit(snap, 'exam.published', 'exam', detail.exam.id, {
          versionNumber: nextVersionNumber,
        });
        return buildExamDetailFromSnap(snap, input.institutionId, detail.exam.id);
      });
    },

    async createDraftRevision(input: { institutionId: string; examId: string }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        snap.data.exams = snap.data.exams.map((ex) =>
          ex.id === input.examId
            ? { ...ex, status: 'draft', updatedAt: new Date().toISOString() }
            : ex,
        );
        appendAudit(snap, 'exam.revision_started', 'exam', input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async closeExam(input: { institutionId: string; examId: string }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        snap.data.exams = snap.data.exams.map((ex) =>
          ex.id === input.examId
            ? { ...ex, status: 'closed', closedAt: now, updatedAt: now }
            : ex,
        );
        appendAudit(snap, 'exam.closed', 'exam', input.examId);
        return buildExamDetailFromSnap(snap, input.institutionId, input.examId);
      });
    },

    async cloneExam(input: { institutionId: string; examId: string }): Promise<ExamDetail> {
      return repo.mutate((snap) => {
        const orig = snap.data.exams.find((e) => e.id === input.examId);
        if (!orig) throw new Error('Exam not found');
        const now = new Date().toISOString();
        const newExamId = makeId('exam');
        snap.data.exams.unshift({
          ...orig,
          id: newExamId,
          title: `${str(orig['title'])} (Clone)`,
          status: 'draft',
          currentVersionNumber: 0,
          latestPublishedVersionId: null,
          publishedAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
          sample: false,
        });

        const sectionIdMap = new Map<string, string>();
        for (const sec of snap.aux.examSections.filter((s) => s.exam_id === orig.id)) {
          const newSecId = makeId('sec');
          sectionIdMap.set(sec.id, newSecId);
          snap.aux.examSections.push({ ...sec, id: newSecId, exam_id: newExamId });
        }
        for (const sq of snap.aux.examSectionQuestions.filter((q) => q.exam_id === orig.id)) {
          const newSecId = sectionIdMap.get(sq.section_id);
          if (!newSecId) continue;
          snap.aux.examSectionQuestions.push({
            ...sq,
            id: makeId('esq'),
            exam_id: newExamId,
            section_id: newSecId,
          });
        }
        appendAudit(snap, 'exam.cloned', 'exam', newExamId, { sourceExamId: orig.id });
        return buildExamDetailFromSnap(snap, input.institutionId, newExamId);
      });
    },

    async deleteExamDraft(input: { institutionId: string; examId: string }) {
      repo.mutate((snap) => {
        const hasVersions = snap.aux.examVersions.some((v) => v.exam_id === input.examId);
        if (hasVersions) {
          throw new Error('Cannot delete an exam that already has published version history.');
        }
        snap.data.exams = snap.data.exams.filter((e) => e.id !== input.examId);
        snap.aux.examSections = snap.aux.examSections.filter((s) => s.exam_id !== input.examId);
        snap.aux.examSectionQuestions = snap.aux.examSectionQuestions.filter((sq) => sq.exam_id !== input.examId);
        snap.aux.examAssignments = snap.aux.examAssignments.filter((a) => a.exam_id !== input.examId);
        appendAudit(snap, 'exam.draft_deleted', 'exam', input.examId);
      });
      return { ok: true };
    },

    // -------------------------------------------------------------------------
    // STUDENT EXAMINATION ENGINE
    // -------------------------------------------------------------------------
    async getStudentExamDashboard(input: { institutionId: string }): Promise<StudentExamDashboardData> {
      const nowMs = Date.now();
      const serverNow = new Date(nowMs).toISOString();
      return repo.mutate((snap) => {
        const identity = getLocalStudentIdentity(snap);
        const items: StudentExamSummaryItem[] = [];

        for (const ex of snap.data.exams) {
          if (ex['status'] !== 'published' && ex['status'] !== 'closed') continue;
          const version = resolveVersionForExam(snap, ex);
          if (!version) continue;

          const reason = isStudentAssignedToExam(
            snap,
            ex.id,
            identity.studentId,
            identity.enrolledSectionIds,
            identity.enrolledClassIds,
          );
          if (!reason) continue;

          const rawAttempt = snap.data.attempts.find(
            (a) => a['examId'] === ex.id && a['studentId'] === identity.studentId,
          );
          const attempt = rawAttempt ? finalizeAttemptIfExpired(snap, rawAttempt, nowMs) : null;
          const attRec = attempt ? toStudentAttemptRecord(attempt, input.institutionId) : null;

          const startsMs = Date.parse(version.starts_at);
          const endsMs = Date.parse(version.ends_at);
          let bucket: StudentExamBucket = 'active';
          if (attRec && attRec.status !== 'in_progress') {
            bucket = 'completed';
          } else if (str(ex['status']) === 'closed' || endsMs <= nowMs) {
            bucket = 'completed';
          } else if (startsMs > nowMs) {
            bucket = 'upcoming';
          } else {
            bucket = 'active';
          }

          items.push({
            examId: ex.id,
            versionId: version.id,
            versionNumber: version.version_number,
            title: version.title,
            description: version.snapshot_payload.description,
            courseId: nullableStr(ex['courseId']),
            courseCode: version.snapshot_payload.courseCode,
            courseTitle: version.snapshot_payload.courseTitle,
            startsAt: version.starts_at,
            endsAt: version.ends_at,
            durationMinutes: version.duration_minutes,
            totalMarks: version.total_marks,
            passingMarks: version.passing_marks,
            passingPercentage: version.passing_percentage,
            negativeMarkingEnabled: version.negative_marking_enabled,
            defaultNegativeMarks: version.default_negative_marks,
            totalQuestions: version.snapshot_payload.sections.reduce(
              (s, sec) => s + sec.questions.length,
              0,
            ),
            sectionCount: version.snapshot_payload.sections.length,
            examStatus: str(ex['status'], 'published') as StudentExamSummaryItem['examStatus'],
            bucket,
            eligibilityReason: reason,
            attempt: attRec
              ? {
                  ...attRec,
                  remainingSeconds:
                    attRec.status === 'in_progress'
                      ? computeRemainingSeconds(attRec.expiresAt, nowMs)
                      : 0,
                }
              : null,
          });
        }

        return {
          serverNow,
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
      });
    },

    async getStudentExamLobby(input: { institutionId: string; examId: string }): Promise<StudentExamLobbyData> {
      const nowMs = Date.now();
      const serverNow = new Date(nowMs).toISOString();
      return repo.mutate((snap) => {
        const identity = getLocalStudentIdentity(snap);
        const ex = snap.data.exams.find((e) => e.id === input.examId);
        if (!ex) throw new Error('Exam not found');
        const version = resolveVersionForExam(snap, ex);
        if (!version) throw new Error('Exam has no published version yet.');

        const reason = isStudentAssignedToExam(
          snap,
          ex.id,
          identity.studentId,
          identity.enrolledSectionIds,
          identity.enrolledClassIds,
        );
        if (!reason) throw new Error('You are not assigned to this examination.');

        const rawAtt = snap.data.attempts.find(
          (a) => a['examId'] === ex.id && a['studentId'] === identity.studentId,
        );
        const finalAtt = rawAtt ? finalizeAttemptIfExpired(snap, rawAtt, nowMs) : null;
        const attRec = finalAtt ? toStudentAttemptRecord(finalAtt, input.institutionId) : null;

        const startsMs = Date.parse(version.starts_at);
        const endsMs = Date.parse(version.ends_at);
        const isCompleted = Boolean(attRec && attRec.status !== 'in_progress');
        const canResume = Boolean(attRec && attRec.status === 'in_progress');
        let canStart = false;
        let blockReason: string | null = null;
        if (!attRec) {
          if (str(ex['status']) === 'closed') blockReason = 'This examination has been closed.';
          else if (nowMs < startsMs) blockReason = 'Examination window has not started yet.';
          else if (nowMs >= endsMs) blockReason = 'Examination window has ended.';
          else canStart = true;
        }

        const totalQuestions = version.snapshot_payload.sections.reduce(
          (s, sec) => s + sec.questions.length,
          0,
        );

        return {
          serverNow,
          exam: {
            examId: ex.id,
            versionId: version.id,
            versionNumber: version.version_number,
            title: version.title,
            description: version.snapshot_payload.description,
            instructions: version.snapshot_payload.instructions,
            courseCode: version.snapshot_payload.courseCode,
            courseTitle: version.snapshot_payload.courseTitle,
            startsAt: version.starts_at,
            endsAt: version.ends_at,
            durationMinutes: version.duration_minutes,
            totalMarks: version.total_marks,
            passingMarks: version.passing_marks,
            passingPercentage: version.passing_percentage,
            negativeMarkingEnabled: version.negative_marking_enabled,
            defaultNegativeMarks: version.default_negative_marks,
            shuffleQuestions: version.shuffle_questions,
            shuffleOptions: version.shuffle_options,
            sectionCount: version.snapshot_payload.sections.length,
            totalQuestions,
            examStatus: str(ex['status'], 'published') as StudentExamLobbyData['exam']['examStatus'],
          },
          attempt: attRec,
          canStart,
          canResume,
          isCompleted,
          blockReason,
          remainingSeconds:
            attRec && attRec.status === 'in_progress'
              ? computeRemainingSeconds(attRec.expiresAt, nowMs)
              : 0,
        };
      });
    },

    async startOrResumeExamAttempt(input: {
      institutionId: string;
      examId: string;
    }): Promise<ExamAttemptSessionData> {
      const nowMs = Date.now();
      const serverNow = new Date(nowMs).toISOString();
      return repo.mutate((snap) => {
        const identity = getLocalStudentIdentity(snap);
        const ex = snap.data.exams.find((e) => e.id === input.examId);
        if (!ex) throw new Error('Exam not found');
        const version = resolveVersionForExam(snap, ex);
        if (!version) throw new Error('Exam is not published yet.');

        let att = snap.data.attempts.find(
          (a) => a['examId'] === ex.id && a['studentId'] === identity.studentId,
        );

        const totalQuestions = version.snapshot_payload.sections.reduce(
          (s, sec) => s + sec.questions.length,
          0,
        );

        if (!att) {
          const endsMs = Date.parse(version.ends_at);
          const expiresMs = Math.min(
            nowMs + version.duration_minutes * 60 * 1000,
            Number.isFinite(endsMs) ? endsMs : nowMs + version.duration_minutes * 60 * 1000,
          );
          att = {
            id: makeId('attempt'),
            examId: ex.id,
            examVersionId: version.id,
            studentId: identity.studentId,
            status: 'in_progress',
            startedAt: serverNow,
            expiresAt: new Date(expiresMs).toISOString(),
            submittedAt: null,
            submissionReason: null,
            lastSavedAt: null,
            answeredCount: 0,
            totalQuestions,
            answers: {},
          };
          snap.data.attempts.push(att);
          version.attempt_count = (version.attempt_count ?? 0) + 1;
          appendAudit(snap, 'exam.attempt_started', 'exam_attempt', att.id, { examId: ex.id });
        } else {
          att = finalizeAttemptIfExpired(snap, att, nowMs);
        }

        const attRec = toStudentAttemptRecord(att, input.institutionId);
        const rawAnswers = (att['answers'] as Record<string, Record<string, unknown>> | undefined) ?? {};
        const answersRecord: Record<string, StudentAttemptAnswerRecord> = {};

        const sections = version.snapshot_payload.sections.map((sec) => {
          const baseQuestions = sec.questions.map((q) => {
            const ans = rawAnswers[q.id];
            if (ans) {
              answersRecord[q.id] = {
                id: `${att!.id}-${q.id}`,
                attemptId: att!.id,
                questionId: q.id,
                sectionId: sec.id,
                questionType: q.question_type,
                selectedOptionKeys: Array.isArray(ans['selectedOptionKeys'])
                  ? (ans['selectedOptionKeys'] as unknown[]).map((k) => String(k))
                  : [],
                descriptiveText: nullableStr(ans['descriptiveText']),
                isFlagged: bool(ans['isFlagged'], false),
                clientUpdatedAt: nullableStr(ans['clientUpdatedAt']),
                revision: num(ans['revision'], 1),
                savedAt: str(ans['savedAt'], serverNow),
              };
            }
            const opts = version.shuffle_options
              ? seededShuffle(q.options, `${att!.id}:${q.id}`)
              : q.options;
            const attachments = snap.aux.attachments
              .filter((a) => a.question_id === q.id)
              .map((a) => ({
                id: a.id,
                attachment_kind: a.attachment_kind,
                file_name: a.file_name,
                mime_type: a.mime_type,
                byte_size: a.file_size_bytes,
                storage_path: a.storage_path,
                signedUrl: a.dataUrl,
              }));
            return {
              id: q.id,
              question_id: q.id,
              section_question_id: q.section_question_id,
              sort_order: q.sort_order,
              question_type: q.question_type,
              title: q.title,
              prompt: q.prompt,
              topic: 'Assessment',
              category: 'Question',
              difficulty: 'medium' as QuestionDifficulty,
              expected_word_count: q.expected_word_count,
              effective_marks: q.effective_marks,
              effective_negative_marks: q.effective_negative_marks,
              options: opts,
              attachments,
            };
          });
          const shouldShuffleQs = version.shuffle_questions || sec.shuffle_questions;
          return {
            id: sec.id,
            title: sec.title,
            description: sec.description,
            section_type: sec.section_type,
            sort_order: sec.sort_order,
            shuffle_questions: sec.shuffle_questions,
            sectionTotalMarks: sec.sectionTotalMarks,
            questions: shouldShuffleQs ? seededShuffle(baseQuestions, `${att!.id}:${sec.id}`) : baseQuestions,
          };
        });

        return {
          serverNow,
          remainingSeconds:
            attRec.status === 'in_progress' ? computeRemainingSeconds(attRec.expiresAt, nowMs) : 0,
          exam: {
            examId: ex.id,
            versionId: version.id,
            versionNumber: version.version_number,
            title: version.title,
            description: version.snapshot_payload.description,
            instructions: version.snapshot_payload.instructions,
            courseCode: version.snapshot_payload.courseCode,
            courseTitle: version.snapshot_payload.courseTitle,
            startsAt: version.starts_at,
            endsAt: version.ends_at,
            durationMinutes: version.duration_minutes,
            totalMarks: version.total_marks,
            passingMarks: version.passing_marks,
            passingPercentage: version.passing_percentage,
            negativeMarkingEnabled: version.negative_marking_enabled,
            defaultNegativeMarks: version.default_negative_marks,
            shuffleQuestions: version.shuffle_questions,
            shuffleOptions: version.shuffle_options,
            sectionCount: sections.length,
            totalQuestions,
            examStatus: str(ex['status'], 'published') as ExamAttemptSessionData['exam']['examStatus'],
          },
          attempt: attRec,
          sections,
          answers: answersRecord,
        };
      });
    },

    async saveExamAttemptAnswer(input: SaveExamAnswerInput): Promise<SaveExamAnswerResult> {
      const nowMs = Date.now();
      const serverNow = new Date(nowMs).toISOString();
      return repo.mutate((snap) => {
        let att = snap.data.attempts.find((a) => a.id === input.attemptId);
        if (!att) throw new Error('Attempt not found');
        att = finalizeAttemptIfExpired(snap, att, nowMs);
        if (str(att['status']) !== 'in_progress') {
          return {
            status: 'expired_auto_submitted',
            serverNow,
            remainingSeconds: 0,
            attempt: toStudentAttemptRecord(att, input.institutionId),
          };
        }

        const version = snap.aux.examVersions.find((v) => v.id === att!['examVersionId']);
        let qType: QuestionType = 'mcq_single';
        let sectionId = '';
        if (version) {
          for (const sec of version.snapshot_payload.sections) {
            const match = sec.questions.find((q) => q.id === input.questionId);
            if (match) {
              qType = match.question_type;
              sectionId = sec.id;
              break;
            }
          }
        }

        const answersMap = { ...((att['answers'] as Record<string, Record<string, unknown>>) ?? {}) };
        const prev = answersMap[input.questionId];
        const prevClientMs = prev?.['clientUpdatedAt'] ? Date.parse(str(prev['clientUpdatedAt'])) : 0;
        const nextClientMs = input.clientUpdatedAt ? Date.parse(input.clientUpdatedAt) : nowMs;
        if (prev && input.clientUpdatedAt && prevClientMs > nextClientMs) {
          const prevRec: StudentAttemptAnswerRecord = {
            id: `${att.id}-${input.questionId}`,
            attemptId: att.id,
            questionId: input.questionId,
            sectionId,
            questionType: qType,
            selectedOptionKeys: Array.isArray(prev['selectedOptionKeys'])
              ? (prev['selectedOptionKeys'] as unknown[]).map(String)
              : [],
            descriptiveText: nullableStr(prev['descriptiveText']),
            isFlagged: bool(prev['isFlagged'], false),
            clientUpdatedAt: nullableStr(prev['clientUpdatedAt']),
            revision: num(prev['revision'], 1),
            savedAt: str(prev['savedAt'], serverNow),
          };
          return {
            status: 'saved',
            serverNow,
            remainingSeconds: computeRemainingSeconds(str(att['expiresAt']), nowMs),
            answeredCount: num(att['answeredCount'], 0),
            staleIgnored: true,
            answer: prevRec,
          };
        }

        const selectedOptionKeys = input.selectedOptionKeys ?? [];
        const descriptiveText = input.descriptiveText ?? null;
        const isFlagged = input.isFlagged ?? false;
        const nextRev = num(prev?.['revision'], 0) + 1;

        answersMap[input.questionId] = {
          selectedOptionKeys,
          descriptiveText,
          isFlagged,
          clientUpdatedAt: input.clientUpdatedAt ?? serverNow,
          savedAt: serverNow,
          revision: nextRev,
          questionType: qType,
        };

        let answeredCount = 0;
        for (const [qId, val] of Object.entries(answersMap)) {
          const qt = (str(val['questionType']) ||
            snap.data.questionBank.find((q) => q.id === qId)?.['questionType'] ||
            'mcq_single') as QuestionType;
          const keys = Array.isArray(val['selectedOptionKeys'])
            ? (val['selectedOptionKeys'] as unknown[]).map(String)
            : [];
          const txt = nullableStr(val['descriptiveText']);
          if (isAnswerPopulated(qt, keys, txt)) answeredCount++;
        }

        const updatedAtt: LocalEntity = {
          ...att,
          lastSavedAt: serverNow,
          answeredCount,
          answers: answersMap as never,
        };
        snap.data.attempts = snap.data.attempts.map((a) => (a.id === att!.id ? updatedAtt : a));

        return {
          status: 'saved',
          serverNow,
          remainingSeconds: computeRemainingSeconds(str(att['expiresAt']), nowMs),
          answeredCount,
          staleIgnored: false,
          answer: {
            id: `${att.id}-${input.questionId}`,
            attemptId: att.id,
            questionId: input.questionId,
            sectionId,
            questionType: qType,
            selectedOptionKeys,
            descriptiveText,
            isFlagged,
            clientUpdatedAt: input.clientUpdatedAt ?? serverNow,
            revision: nextRev,
            savedAt: serverNow,
          },
        };
      });
    },

    async submitExamAttempt(input: {
      institutionId: string;
      attemptId: string;
      reason?: 'manual' | 'deadline_auto_submit';
      idempotencyKey?: string;
    }): Promise<SubmitExamAttemptResult> {
      const nowMs = Date.now();
      const serverNow = new Date(nowMs).toISOString();
      return repo.mutate((snap) => {
        const att = snap.data.attempts.find((a) => a.id === input.attemptId);
        if (!att) throw new Error('Attempt not found');
        if (str(att['status']) !== 'in_progress') {
          return {
            serverNow,
            alreadySubmitted: true,
            attempt: toStudentAttemptRecord(att, input.institutionId),
          };
        }

        const reason = input.reason ?? 'manual';
        const finalStatus = reason === 'deadline_auto_submit' ? 'auto_submitted' : 'submitted';
        const updated: LocalEntity = {
          ...att,
          status: finalStatus,
          submittedAt: serverNow,
          submissionReason: reason,
        };
        snap.data.attempts = snap.data.attempts.map((a) => (a.id === att.id ? updated : a));
        gradeAttemptInSnap(snap, att.id);
        appendAudit(snap, 'exam.attempt_submitted', 'exam_attempt', att.id, {
          reason,
        });
        return {
          serverNow,
          alreadySubmitted: false,
          attempt: toStudentAttemptRecord(updated, input.institutionId),
        };
      });
    },

    async heartbeatExamAttempt(input: {
      institutionId: string;
      attemptId: string;
    }): Promise<ExamHeartbeatResult> {
      const nowMs = Date.now();
      const serverNow = new Date(nowMs).toISOString();
      return repo.mutate((snap) => {
        const att = snap.data.attempts.find((a) => a.id === input.attemptId);
        if (!att) throw new Error('Attempt not found');
        const finalAtt = finalizeAttemptIfExpired(snap, att, nowMs);
        const rec = toStudentAttemptRecord(finalAtt, input.institutionId);
        return {
          serverNow,
          remainingSeconds:
            rec.status === 'in_progress' ? computeRemainingSeconds(rec.expiresAt, nowMs) : 0,
          attempt: rec,
        };
      });
    },

    // -------------------------------------------------------------------------
    // GRADING & RESULTS
    // -------------------------------------------------------------------------
    async getTeacherExamGradingDashboard(input: {
      institutionId: string;
      examId: string;
    }): Promise<TeacherExamGradingDashboardData> {
      const snap = repo.read();
      const ex = snap.data.exams.find((e) => e.id === input.examId);
      if (!ex) throw new Error('Exam not found');
      const course = snap.data.courses.find((c) => c.id === ex['courseId']);
      const attempts = snap.data.attempts.filter((a) => a['examId'] === ex.id);
      const totalMarks = computeExamTotalMarks(snap, ex.id);

      const rows = attempts.map((a) => {
        const student = snap.data.students.find((s) => s.id === a['studentId']);
        const grade = snap.data.grades.find((g) => g['attemptId'] === a.id) as unknown as LocalGrade | undefined;
        const gradedQuestionsCount = grade
          ? Object.values(grade.questionGrades ?? {}).filter((qg) => !qg.pendingManual).length
          : 0;
        const totalQuestions = num(a['totalQuestions'], grade ? Object.keys(grade.questionGrades ?? {}).length : 0);

        return {
          attemptId: a.id,
          studentId: str(a['studentId']),
          studentCode: student ? str(student['studentCode']) : 'STU-?',
          studentFullName: student ? str(student['fullName']) : 'Local Student',
          studentEmail: student ? nullableStr(student['email']) : null,
          status: str(a['status'], 'submitted') as 'in_progress' | 'submitted' | 'auto_submitted',
          startedAt: str(a['startedAt']),
          submittedAt: nullableStr(a['submittedAt']),
          gradeStatus: (grade?.status as ExamGradeStatus) ?? null,
          totalAwardedMarks: grade?.totalAwardedMarks ?? 0,
          maxPossibleMarks: grade?.maxPossibleMarks ?? totalMarks,
          percentage: grade?.percentage ?? 0,
          isPassing: grade?.isPassing ?? false,
          gradedQuestionsCount,
          totalQuestions,
        };
      });

      const submittedCount = rows.filter((r) => r.status !== 'in_progress').length;
      const gradedRows = rows.filter((r) => r.gradeStatus !== null);
      const publishedCount = rows.filter((r) => r.gradeStatus === 'published').length;
      const averageScore =
        gradedRows.length > 0
          ? Number((gradedRows.reduce((s, r) => s + r.totalAwardedMarks, 0) / gradedRows.length).toFixed(2))
          : 0;
      const averagePercentage =
        gradedRows.length > 0
          ? Number((gradedRows.reduce((s, r) => s + r.percentage, 0) / gradedRows.length).toFixed(1))
          : 0;

      return {
        exam: {
          examId: ex.id,
          title: str(ex['title']),
          courseCode: course ? str(course['code']) : null,
          courseTitle: course ? str(course['title']) : null,
          totalMarks,
          passingMarks: nullableNum(ex['passingMarks']),
          passingPercentage: nullableNum(ex['passingPercentage']),
          negativeMarkingEnabled: bool(ex['negativeMarkingEnabled'], false),
          defaultNegativeMarks: num(ex['defaultNegativeMarks'], 0),
        },
        summary: {
          totalAttempts: rows.length,
          submittedCount,
          gradedCount: gradedRows.length,
          publishedCount,
          averageScore,
          averagePercentage,
        },
        attempts: rows,
      };
    },

    async getTeacherAttemptGradingDetail(input: {
      institutionId: string;
      attemptId: string;
    }): Promise<TeacherAttemptGradingDetail> {
      const snap = repo.mutate((s) => {
        const att = s.data.attempts.find((a) => a.id === input.attemptId);
        if (!att) throw new Error('Attempt not found');
        if (!s.data.grades.some((g) => g['attemptId'] === input.attemptId) && str(att['status']) !== 'in_progress') {
          gradeAttemptInSnap(s, input.attemptId);
        }
        return s;
      });
      const att = snap.data.attempts.find((a) => a.id === input.attemptId)!;
      const ex = snap.data.exams.find((e) => e.id === att['examId']);
      if (!ex) throw new Error('Exam not found');
      const version = resolveVersionForExam(snap, ex);
      const student = snap.data.students.find((s) => s.id === att['studentId']);
      const grade = snap.data.grades.find((g) => g['attemptId'] === att.id) as unknown as LocalGrade | undefined;
      const rawAnswers = (att['answers'] as Record<string, Record<string, unknown>> | undefined) ?? {};

      const questions: TeacherAttemptQuestionDetail[] = [];
      if (version) {
        for (const sec of version.snapshot_payload.sections) {
          for (const q of sec.questions) {
            const ans = rawAnswers[q.id];
            const qg: LocalQuestionGrade | undefined = grade?.questionGrades?.[q.id];
            const keyInfo = version.answer_keys[q.id];
            questions.push({
              questionId: q.id,
              sectionTitle: sec.title,
              questionTitle: q.title,
              prompt: q.prompt,
              questionType: q.question_type,
              maxMarks: qg?.maxMarks ?? q.effective_marks,
              awardedMarks: qg?.awardedMarks ?? 0,
              negativeDeduction: qg?.negativeDeduction ?? 0,
              isCorrect: qg?.isCorrect ?? null,
              options: q.options.map((o) => ({ optionKey: o.option_key, optionText: o.option_text })),
              selectedOptionKeys: ans && Array.isArray(ans['selectedOptionKeys']) ? (ans['selectedOptionKeys'] as unknown[]).map(String) : [],
              correctOptionKeys: keyInfo?.correct_option_keys ?? [],
              descriptiveText: ans ? nullableStr(ans['descriptiveText']) : null,
              sampleAnswer: keyInfo?.sample_answer ?? null,
              gradingRubric: keyInfo?.grading_rubric ?? null,
              teacherFeedback: qg?.feedback ?? null,
              rubricBreakdown: qg?.rubricBreakdown ?? {},
            });
          }
        }
      }

      return {
        attemptId: att.id,
        examId: ex.id,
        examTitle: str(ex['title']),
        studentId: str(att['studentId']),
        studentCode: student ? str(student['studentCode']) : 'STU-?',
        studentFullName: student ? str(student['fullName']) : 'Local Student',
        status: str(att['status'], 'submitted'),
        startedAt: str(att['startedAt']),
        submittedAt: nullableStr(att['submittedAt']),
        totalAwardedMarks: grade?.totalAwardedMarks ?? 0,
        maxPossibleMarks: grade?.maxPossibleMarks ?? computeExamTotalMarks(snap, ex.id),
        percentage: grade?.percentage ?? 0,
        isPassing: grade?.isPassing ?? false,
        gradeStatus: (grade?.status as ExamGradeStatus) ?? null,
        teacherNotes: grade?.teacherNotes ?? null,
        questions,
      };
    },

    async calculateGrades(input: { institutionId: string; attemptId: string }) {
      return repo.mutate((snap) => {
        const g = gradeAttemptInSnap(snap, input.attemptId);
        appendAudit(snap, 'grading.calculated', 'exam_attempt', input.attemptId, {
          totalAwarded: g.totalAwardedMarks,
          maxPossible: g.maxPossibleMarks,
        });
        return {
          totalAwarded: g.totalAwardedMarks,
          maxPossible: g.maxPossibleMarks,
          percentage: g.percentage,
          isPassing: g.isPassing,
        };
      });
    },

    async saveManualQuestionGrade(input: {
      institutionId: string;
      attemptId: string;
      questionId: string;
      awardedMarks: number;
      teacherFeedback?: string | null;
      rubricBreakdown?: Record<string, string>;
    }) {
      repo.mutate((snap) => {
        let existing = snap.data.grades.find((g) => g['attemptId'] === input.attemptId) as unknown as LocalGrade | undefined;
        if (!existing) {
          existing = gradeAttemptInSnap(snap, input.attemptId);
        }
        const updated = saveLocalQuestionGrade(
          existing,
          input.questionId,
          input.awardedMarks,
          input.teacherFeedback ?? null,
          input.rubricBreakdown ?? {},
        );
        snap.data.grades = snap.data.grades.map((g) =>
          g['attemptId'] === input.attemptId
            ? ({ ...(updated as unknown as Record<string, never>), id: updated.id } as LocalEntity)
            : g,
        );
        appendAudit(snap, 'grading.manual_grade_saved', 'exam_attempt', input.attemptId, {
          questionId: input.questionId,
          awardedMarks: input.awardedMarks,
        });
      });
    },

    async publishExamResults(input: {
      institutionId: string;
      examId: string;
      attemptIds?: string[];
    }): Promise<number> {
      return repo.mutate((snap) => {
        const targetSet = input.attemptIds && input.attemptIds.length > 0 ? new Set(input.attemptIds) : null;
        const now = new Date().toISOString();
        let count = 0;

        // Ensure all submitted attempts for this exam have grade records before publishing
        for (const att of snap.data.attempts) {
          if (att['examId'] !== input.examId) continue;
          if (str(att['status']) === 'in_progress') continue;
          if (targetSet && !targetSet.has(att.id)) continue;
          if (!snap.data.grades.some((g) => g['attemptId'] === att.id)) {
            gradeAttemptInSnap(snap, att.id);
          }
        }

        snap.data.grades = snap.data.grades.map((g) => {
          if (g['examId'] !== input.examId) return g;
          if (targetSet && !targetSet.has(str(g['attemptId']))) return g;
          count++;
          return { ...g, status: 'published', publishedAt: now };
        });

        appendAudit(snap, 'grading.results_published', 'exam', input.examId, { count });
        return count;
      });
    },

    async getStudentResultReport(input: {
      institutionId: string;
      examId: string;
    }): Promise<StudentResultReport | null> {
      const snap = repo.read();
      const identity = getLocalStudentIdentity(snap);
      const att = snap.data.attempts.find(
        (a) => a['examId'] === input.examId && a['studentId'] === identity.studentId,
      );
      if (!att) return null;
      const grade = snap.data.grades.find((g) => g['attemptId'] === att.id) as unknown as LocalGrade | undefined;
      if (!grade || grade.status !== 'published') return null;

      const ex = snap.data.exams.find((e) => e.id === input.examId);
      if (!ex) return null;
      const version = resolveVersionForExam(snap, ex);
      if (!version) return null;

      const rawAnswers = (att['answers'] as Record<string, Record<string, unknown>> | undefined) ?? {};
      const items: StudentResultDetailItem[] = [];
      for (const sec of version.snapshot_payload.sections) {
        for (const q of sec.questions) {
          const ans = rawAnswers[q.id];
          const qg = grade.questionGrades?.[q.id];
          items.push({
            questionId: q.id,
            sectionTitle: sec.title,
            questionTitle: q.title,
            prompt: q.prompt,
            questionType: q.question_type,
            maxMarks: qg?.maxMarks ?? q.effective_marks,
            awardedMarks: qg?.awardedMarks ?? 0,
            negativeDeduction: qg?.negativeDeduction ?? 0,
            isCorrect: qg?.isCorrect ?? null,
            selectedOptionKeys: ans && Array.isArray(ans['selectedOptionKeys']) ? (ans['selectedOptionKeys'] as unknown[]).map(String) : [],
            descriptiveText: ans ? nullableStr(ans['descriptiveText']) : null,
            teacherFeedback: qg?.feedback ?? null,
            rubricBreakdown: qg?.rubricBreakdown ?? {},
          });
        }
      }

      return {
        examId: ex.id,
        examTitle: version.title,
        courseCode: version.snapshot_payload.courseCode,
        courseTitle: version.snapshot_payload.courseTitle,
        versionNumber: version.version_number,
        attemptId: att.id,
        status: grade.status,
        startedAt: str(att['startedAt']),
        submittedAt: nullableStr(att['submittedAt']),
        totalAwardedMarks: grade.totalAwardedMarks,
        maxPossibleMarks: grade.maxPossibleMarks,
        percentage: grade.percentage,
        isPassing: grade.isPassing,
        passingMarks: version.passing_marks,
        passingPercentage: version.passing_percentage,
        teacherNotes: grade.teacherNotes,
        publishedAt: grade.publishedAt ?? null,
        questions: items,
      };
    },

    async getExamAnalytics(input: { institutionId: string; examId: string }): Promise<ExamAnalyticsData> {
      const snap = repo.read();
      const ex = snap.data.exams.find((e) => e.id === input.examId);
      if (!ex) throw new Error('Exam not found');
      const version = resolveVersionForExam(snap, ex);
      const grades = snap.data.grades
        .filter((g) => g['examId'] === ex.id)
        .map((g) => ({
          attempt_id: str(g['attemptId']),
          total_awarded_marks: num(g['totalAwardedMarks'], 0),
          max_possible_marks: num(g['maxPossibleMarks'], 0),
          percentage: num(g['percentage'], 0),
          is_passing: bool(g['isPassing'], false),
        }));
      const qGrades = snap.data.grades
        .filter((g) => g['examId'] === ex.id)
        .flatMap((g) => {
          const map = ((g as unknown as LocalGrade).questionGrades ?? {}) as Record<string, LocalQuestionGrade>;
          return Object.entries(map).map(([qId, qg]) => ({
            attempt_id: str(g['attemptId']),
            question_id: qId,
            awarded_marks: qg.awardedMarks,
            max_marks: qg.maxMarks,
            is_correct: qg.isCorrect,
          }));
        });
      const snapshotQuestions =
        version?.snapshot_payload.sections.flatMap((sec) =>
          sec.questions.map((q) => ({
            id: q.id,
            title: q.title,
            question_type: q.question_type,
            effective_marks: q.effective_marks,
          })),
        ) ?? [];

      return computeExamAnalytics(
        { examId: ex.id, examTitle: str(ex['title']) },
        grades,
        qGrades,
        snapshotQuestions,
      );
    },

    // -------------------------------------------------------------------------
    // PROCTORING & INVIGILATOR REVIEW
    // -------------------------------------------------------------------------
    async recordProctoringEvent(input: {
      institutionId: string;
      attemptId: string;
      studentId: string;
      eventType: ProctoringEventType;
      severity: ProctoringSeverity;
      details?: Record<string, string>;
    }): Promise<ProctoringEventItem> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const item: ProctoringEventItem = {
          id: makeId('proc'),
          attemptId: input.attemptId,
          studentId: input.studentId,
          eventType: input.eventType,
          severity: input.severity,
          details: input.details ?? {},
          createdAt: now,
        };
        snap.aux.proctoringEvents.push(item);

        // Automatically create or update review record to 'flagged' if critical or warning
        if (input.severity === 'critical' || input.severity === 'warning') {
          const existingRev = snap.aux.attemptReviews.find((r) => r.attemptId === input.attemptId);
          if (!existingRev) {
            snap.aux.attemptReviews.push({
              id: makeId('rev'),
              attemptId: input.attemptId,
              reviewerId: null,
              reviewStatus: 'flagged',
              reviewNotes: null,
              updatedAt: now,
            });
          }
        }
        return item;
      });
    },

    async getInvigilatorDashboard(input: {
      institutionId: string;
      examId?: string | null | undefined;
    }): Promise<{ attempts: InvigilatorDashboardAttemptRow[] }> {
      const snap = repo.read();
      const filteredAttempts = snap.data.attempts.filter(
        (a) => !input.examId || a['examId'] === input.examId,
      );
      const rows: InvigilatorDashboardAttemptRow[] = filteredAttempts.map((att) => {
        const ex = snap.data.exams.find((e) => e.id === att['examId']);
        const student = snap.data.students.find((s) => s.id === att['studentId']);
        const events = snap.aux.proctoringEvents
          .filter((ev) => ev.attemptId === att.id)
          .slice()
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        const review = snap.aux.attemptReviews.find((r) => r.attemptId === att.id);
        return {
          attemptId: att.id,
          examId: str(att['examId']),
          examTitle: ex ? str(ex['title']) : 'Sample Exam',
          studentId: str(att['studentId']),
          studentCode: student ? str(student['studentCode']) : 'STU-?',
          studentFullName: student ? str(student['fullName']) : 'Local Student',
          status: str(att['status'], 'submitted'),
          startedAt: str(att['startedAt']),
          submittedAt: nullableStr(att['submittedAt']),
          eventCount: events.length,
          criticalEventCount: events.filter((e) => e.severity === 'critical').length,
          reviewStatus: review?.reviewStatus ?? (events.length > 0 ? 'flagged' : 'cleared'),
          reviewNotes: review?.reviewNotes ?? null,
          events,
        };
      });
      return { attempts: rows };
    },

    async saveAttemptReview(input: {
      institutionId: string;
      attemptId: string;
      reviewStatus: AttemptReviewStatus;
      reviewNotes?: string | null;
    }): Promise<AttemptReviewRecord> {
      return repo.mutate((snap) => {
        const now = new Date().toISOString();
        const idx = snap.aux.attemptReviews.findIndex((r) => r.attemptId === input.attemptId);
        const rec: AttemptReviewRecord = {
          id: idx >= 0 ? snap.aux.attemptReviews[idx]!.id : makeId('rev'),
          attemptId: input.attemptId,
          reviewerId: 'member-invigilator',
          reviewStatus: input.reviewStatus,
          reviewNotes: input.reviewNotes ?? null,
          updatedAt: now,
        };
        if (idx >= 0) {
          snap.aux.attemptReviews[idx] = rec;
        } else {
          snap.aux.attemptReviews.push(rec);
        }
        appendAudit(snap, 'proctoring.review_saved', 'exam_attempt', input.attemptId, {
          reviewStatus: input.reviewStatus,
        });
        return rec;
      });
    },
  };
}

export const localDataAdapter = createLocalDataAdapter(localRepository);
