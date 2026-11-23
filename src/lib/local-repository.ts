import { z } from 'zod';
import type {
  AcademicClassRow,
  AcademicSessionRow,
  AcademicTermRow,
  ClassSectionRow,
  CourseRow,
  CsvImportJobRow,
  DepartmentRow,
  ProgramRow,
  StudentEnrollmentRow,
  TeacherAssignmentRow,
} from './academic.server';
import type { ExamSnapshotPayload } from './exams.server';
import type { AttemptReviewRecord, ProctoringEventItem } from './proctoring.shared';

export const LOCAL_STORAGE_KEY = 'examflow:local-data';
export const LOCAL_SCHEMA_VERSION = 2;

export const LOCAL_COLLECTIONS = [
  'institution',
  'members',
  'departments',
  'programs',
  'courses',
  'students',
  'teachers',
  'questionBank',
  'exams',
  'attempts',
  'grades',
  'reports',
  'auditLog',
] as const;

export type LocalCollection = (typeof LOCAL_COLLECTIONS)[number];
export type LocalJsonValue =
  | null
  | boolean
  | number
  | string
  | LocalJsonValue[]
  | { [key: string]: LocalJsonValue };
export type LocalEntity = { id: string; [key: string]: LocalJsonValue };
export type LocalRole = 'institution' | 'teacher' | 'student' | 'invigilator';

export type LocalQuestionSetRecord = {
  id: string;
  institution_id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: string;
    question_id: string;
    sort_order: number;
  }>;
};

export type LocalExamSectionRecord = {
  id: string;
  institution_id: string;
  exam_id: string;
  title: string;
  description: string | null;
  section_type: 'mcq' | 'descriptive' | 'mixed';
  sort_order: number;
  shuffle_questions: boolean;
};

export type LocalExamSectionQuestionRecord = {
  id: string;
  exam_id: string;
  section_id: string;
  question_id: string;
  sort_order: number;
  marks: number;
  negative_marks: number;
};

export type LocalExamAssignmentRecord = {
  id: string;
  exam_id: string;
  target_type: 'class' | 'section' | 'student';
  class_id: string | null;
  class_section_id: string | null;
  student_id: string | null;
  created_at: string;
};

export type LocalExamAnswerKeyEntry = {
  correct_option_keys: string[];
  sample_answer: string | null;
  grading_rubric: string | null;
  explanation: string | null;
};

export type LocalExamVersionRecord = {
  id: string;
  institution_id: string;
  exam_id: string;
  version_number: number;
  title: string;
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
  attempt_count: number;
  published_by: string;
  published_at: string;
  snapshot_payload: ExamSnapshotPayload;
  answer_keys: Record<string, LocalExamAnswerKeyEntry>;
};

export type LocalAttachmentRecord = {
  id: string;
  institution_id: string;
  question_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  attachment_kind: 'image' | 'document';
  uploaded_by: string;
  created_at: string;
  dataUrl: string | null;
};

export type LocalAuxData = {
  sessions: AcademicSessionRow[];
  terms: AcademicTermRow[];
  classes: AcademicClassRow[];
  sections: ClassSectionRow[];
  teacherAssignments: TeacherAssignmentRow[];
  enrollments: StudentEnrollmentRow[];
  questionSets: LocalQuestionSetRecord[];
  examSections: LocalExamSectionRecord[];
  examSectionQuestions: LocalExamSectionQuestionRecord[];
  examAssignments: LocalExamAssignmentRecord[];
  examVersions: LocalExamVersionRecord[];
  proctoringEvents: ProctoringEventItem[];
  attemptReviews: AttemptReviewRecord[];
  csvImportJobs: CsvImportJobRow[];
  questionImportJobs: CsvImportJobRow[];
  attachments: LocalAttachmentRecord[];
};

export type LocalSnapshot = {
  schemaVersion: number;
  updatedAt: string;
  seeded: boolean;
  data: Record<LocalCollection, LocalEntity[]>;
  aux: LocalAuxData;
};

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExamRepository {
  read(): LocalSnapshot;
  list(collection: LocalCollection): LocalEntity[];
  get(collection: LocalCollection, id: string): LocalEntity | null;
  create(collection: LocalCollection, input: Omit<LocalEntity, 'id'> & { id?: string }): LocalEntity;
  update(collection: LocalCollection, id: string, patch: Partial<Omit<LocalEntity, 'id'>>): LocalEntity | null;
  delete(collection: LocalCollection, id: string): boolean;
  mutate<T>(fn: (snapshot: LocalSnapshot) => T): T;
  resetSampleData(): LocalSnapshot;
  exportJson(): string;
  importJson(json: string): LocalSnapshot;
}

const entitySchema = z.object({ id: z.string().min(1) }).passthrough();
const auxSchema = z
  .object({
    sessions: z.array(z.any()).optional(),
    terms: z.array(z.any()).optional(),
    classes: z.array(z.any()).optional(),
    sections: z.array(z.any()).optional(),
    teacherAssignments: z.array(z.any()).optional(),
    enrollments: z.array(z.any()).optional(),
    questionSets: z.array(z.any()).optional(),
    examSections: z.array(z.any()).optional(),
    examSectionQuestions: z.array(z.any()).optional(),
    examAssignments: z.array(z.any()).optional(),
    examVersions: z.array(z.any()).optional(),
    proctoringEvents: z.array(z.any()).optional(),
    attemptReviews: z.array(z.any()).optional(),
    csvImportJobs: z.array(z.any()).optional(),
    questionImportJobs: z.array(z.any()).optional(),
    attachments: z.array(z.any()).optional(),
  })
  .optional();

const envelopeSchema = z.object({
  schemaVersion: z.number().int().min(1).max(LOCAL_SCHEMA_VERSION),
  updatedAt: z.string().optional(),
  seeded: z.boolean().optional(),
  data: z.record(z.string(), z.array(entitySchema)),
  aux: auxSchema,
});

const EMPTY_DATA = (): Record<LocalCollection, LocalEntity[]> => ({
  institution: [],
  members: [],
  departments: [],
  programs: [],
  courses: [],
  students: [],
  teachers: [],
  questionBank: [],
  exams: [],
  attempts: [],
  grades: [],
  reports: [],
  auditLog: [],
});

const EMPTY_AUX = (): LocalAuxData => ({
  sessions: [],
  terms: [],
  classes: [],
  sections: [],
  teacherAssignments: [],
  enrollments: [],
  questionSets: [],
  examSections: [],
  examSectionQuestions: [],
  examAssignments: [],
  examVersions: [],
  proctoringEvents: [],
  attemptReviews: [],
  csvImportJobs: [],
  questionImportJobs: [],
  attachments: [],
});

export function createSampleData(now = new Date().toISOString()): LocalSnapshot {
  const nowMs = Date.parse(now) || Date.now();
  const startsAtIso = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const endsAtIso = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  const startedSampleIso = new Date(nowMs - 30 * 60 * 1000).toISOString();
  const submittedSampleIso = new Date(nowMs - 20 * 60 * 1000).toISOString();
  const eventSampleIso = new Date(nowMs - 24 * 60 * 1000).toISOString();
  const instId = 'sample-institution';

  const data = EMPTY_DATA();
  data.institution = [
    {
      id: instId,
      name: 'Riverside College (sample)',
      slug: 'riverside-sample',
      institution_type: 'college',
      status: 'active',
      created_at: now,
      updated_at: now,
      sample: true,
    },
  ];

  data.members = [
    {
      id: 'member-admin',
      userId: 'local-user-institution',
      name: 'Amina Khan',
      email: 'amina@example.test',
      role: 'institution_admin',
      status: 'active',
      createdAt: now,
      sample: true,
    },
    {
      id: 'member-teacher-1',
      userId: 'local-user-teacher',
      name: 'Samira Ali',
      email: 'samira@example.test',
      role: 'teacher',
      status: 'active',
      createdAt: now,
      sample: true,
    },
    {
      id: 'member-teacher-2',
      userId: 'local-user-teacher-2',
      name: 'Daniel Reed',
      email: 'daniel@example.test',
      role: 'teacher',
      status: 'active',
      createdAt: now,
      sample: true,
    },
    {
      id: 'member-student-1',
      userId: 'local-user-student',
      name: 'Student 014',
      email: 'student014@example.test',
      role: 'student',
      status: 'active',
      createdAt: now,
      sample: true,
    },
    {
      id: 'member-invigilator',
      userId: 'local-user-invigilator',
      name: 'Taylor Morgan',
      email: 'taylor@example.test',
      role: 'invigilator',
      status: 'active',
      createdAt: now,
      sample: true,
    },
  ];

  data.departments = [
    {
      id: 'dept-science',
      name: 'Science',
      code: 'SCI',
      description: 'Sample science department',
      created_at: now,
      sample: true,
    },
    {
      id: 'dept-computing',
      name: 'Computing',
      code: 'ICT',
      description: 'Sample computing department',
      created_at: now,
      sample: true,
    },
  ];

  data.programs = [
    {
      id: 'program-it',
      name: 'Information Technology',
      code: 'IT',
      departmentId: 'dept-computing',
      durationYears: 3,
      created_at: now,
      sample: true,
    },
  ];

  data.courses = [
    {
      id: 'course-ict101',
      code: 'ICT101',
      title: 'ICT Fundamentals',
      departmentId: 'dept-computing',
      programId: 'program-it',
      classId: 'class-year1',
      credits: 3,
      description: 'Core digital systems, data representation, and networking.',
      status: 'active',
      created_at: now,
      sample: true,
    },
    {
      id: 'course-math201',
      code: 'MATH201',
      title: 'Calculus',
      departmentId: 'dept-science',
      programId: null,
      classId: 'class-year1',
      credits: 4,
      description: 'Differential and integral calculus.',
      status: 'active',
      created_at: now,
      sample: true,
    },
  ];

  data.teachers = [
    {
      id: 'teacher-samira',
      membershipId: 'member-teacher-1',
      userId: 'local-user-teacher',
      fullName: 'Samira Ali',
      email: 'samira@example.test',
      departmentId: 'dept-computing',
      status: 'active',
      sample: true,
    },
    {
      id: 'teacher-daniel',
      membershipId: 'member-teacher-2',
      userId: 'local-user-teacher-2',
      fullName: 'Daniel Reed',
      email: 'daniel@example.test',
      departmentId: 'dept-science',
      status: 'active',
      sample: true,
    },
  ];

  data.students = [
    {
      id: 'student-014',
      userId: 'local-user-student',
      studentCode: 'ICT-014',
      fullName: 'Student 014',
      email: 'student014@example.test',
      phone: null,
      status: 'active',
      created_at: now,
      sample: true,
    },
    {
      id: 'student-015',
      userId: null,
      studentCode: 'ICT-015',
      fullName: 'Student 015',
      email: 'student015@example.test',
      phone: null,
      status: 'active',
      created_at: now,
      sample: true,
    },
    {
      id: 'student-016',
      userId: null,
      studentCode: 'MATH-016',
      fullName: 'Student 016',
      email: 'student016@example.test',
      phone: null,
      status: 'active',
      created_at: now,
      sample: true,
    },
  ];

  data.questionBank = [
    {
      id: 'q-ram',
      title: 'Volatile memory',
      prompt: 'Which component is the computer’s main volatile memory?',
      questionType: 'mcq_single',
      courseId: 'course-ict101',
      topic: 'Computer systems',
      category: 'Conceptual',
      difficulty: 'easy',
      marks: 2,
      negativeMarks: 0,
      status: 'active',
      tags: ['hardware', 'memory'],
      options: [
        { key: 'A', text: 'Hard disk' },
        { key: 'B', text: 'RAM' },
        { key: 'C', text: 'ROM' },
      ],
      correctOptionKeys: ['B'],
      explanation: 'RAM loses stored contents when power is removed.',
      createdAt: now,
      sample: true,
    },
    {
      id: 'q-byte',
      title: 'Bytes',
      prompt: 'How many bits are in one byte?',
      questionType: 'mcq_single',
      courseId: 'course-ict101',
      topic: 'Data representation',
      category: 'Conceptual',
      difficulty: 'easy',
      marks: 2,
      negativeMarks: 0,
      status: 'active',
      tags: ['binary'],
      options: [
        { key: 'A', text: '4' },
        { key: 'B', text: '8' },
        { key: 'C', text: '16' },
      ],
      correctOptionKeys: ['B'],
      explanation: 'One standard byte equals 8 bits.',
      createdAt: now,
      sample: true,
    },
    {
      id: 'q-https',
      title: 'Secure web traffic',
      prompt: 'Which protocol is used to carry web pages securely?',
      questionType: 'mcq_single',
      courseId: 'course-ict101',
      topic: 'Networking',
      category: 'Conceptual',
      difficulty: 'medium',
      marks: 2,
      negativeMarks: 0.5,
      status: 'active',
      tags: ['web', 'security'],
      options: [
        { key: 'A', text: 'HTTP' },
        { key: 'B', text: 'FTP' },
        { key: 'C', text: 'HTTPS' },
      ],
      correctOptionKeys: ['C'],
      explanation: 'HTTPS layers HTTP over TLS encryption.',
      createdAt: now,
      sample: true,
    },
    {
      id: 'q-ram-rom',
      title: 'RAM and ROM',
      prompt: 'Explain one key difference between RAM and ROM.',
      questionType: 'descriptive',
      courseId: 'course-ict101',
      topic: 'Computer systems',
      category: 'Written',
      difficulty: 'medium',
      marks: 5,
      negativeMarks: 0,
      expectedWordCount: 60,
      status: 'active',
      tags: ['hardware', 'essay'],
      options: [],
      correctOptionKeys: [],
      sampleAnswer: 'RAM is volatile working memory that clears on power-off; ROM is non-volatile firmware storage.',
      gradingRubric: 'Award 3 marks for volatility distinction and 2 marks for a concrete use-case.',
      explanation: null,
      createdAt: now,
      sample: true,
    },
  ];

  data.exams = [
    {
      id: 'exam-ict',
      title: 'ICT Fundamentals — Sample Exam',
      description: 'Clearly labelled sample MCQ exam with published sample results.',
      instructions: 'Answer all multiple-choice questions carefully.',
      courseId: 'course-ict101',
      academicSessionId: 'session-2026',
      academicTermId: 'term-fall-2026',
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      durationMinutes: 10,
      totalMarks: 6,
      questionIds: ['q-ram', 'q-byte', 'q-https'],
      status: 'published',
      passingPercentage: 50,
      passingMarks: 3,
      negativeMarkingEnabled: false,
      defaultNegativeMarks: 0,
      shuffleQuestions: false,
      shuffleOptions: false,
      currentVersionNumber: 1,
      latestPublishedVersionId: 'ver-exam-ict-1',
      publishedAt: startsAtIso,
      closedAt: null,
      createdBy: 'local-user-teacher',
      createdAt: now,
      updatedAt: now,
      sample: true,
    },
    {
      id: 'exam-mixed',
      title: 'ICT Short Answer — Sample Exam',
      description: 'Open sample assessment with 1 MCQ and 1 manually graded written question.',
      instructions: 'Complete both sections within 15 minutes and review before submitting.',
      courseId: 'course-ict101',
      academicSessionId: 'session-2026',
      academicTermId: 'term-fall-2026',
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      durationMinutes: 15,
      totalMarks: 7,
      questionIds: ['q-https', 'q-ram-rom'],
      status: 'published',
      passingPercentage: 50,
      passingMarks: null,
      negativeMarkingEnabled: true,
      defaultNegativeMarks: 0.5,
      shuffleQuestions: false,
      shuffleOptions: false,
      currentVersionNumber: 1,
      latestPublishedVersionId: 'ver-exam-mixed-1',
      publishedAt: startsAtIso,
      closedAt: null,
      createdBy: 'local-user-teacher',
      createdAt: now,
      updatedAt: now,
      sample: true,
    },
  ];

  data.attempts = [
    {
      id: 'attempt-sample-complete',
      examId: 'exam-ict',
      examVersionId: 'ver-exam-ict-1',
      studentId: 'student-014',
      status: 'submitted',
      startedAt: startedSampleIso,
      expiresAt: new Date(Date.parse(startedSampleIso) + 10 * 60 * 1000).toISOString(),
      submittedAt: submittedSampleIso,
      submissionReason: 'manual',
      lastSavedAt: submittedSampleIso,
      answeredCount: 3,
      totalQuestions: 3,
      answers: {
        'q-ram': { selectedOptionKeys: ['B'], descriptiveText: null, isFlagged: false, savedAt: submittedSampleIso, revision: 1 },
        'q-byte': { selectedOptionKeys: ['B'], descriptiveText: null, isFlagged: false, savedAt: submittedSampleIso, revision: 1 },
        'q-https': { selectedOptionKeys: ['A'], descriptiveText: null, isFlagged: false, savedAt: submittedSampleIso, revision: 1 },
      },
      sample: true,
    },
  ];

  data.grades = [
    {
      id: 'grade-sample-complete',
      examId: 'exam-ict',
      examVersionId: 'ver-exam-ict-1',
      attemptId: 'attempt-sample-complete',
      studentId: 'student-014',
      status: 'published',
      totalAwardedMarks: 4,
      maxPossibleMarks: 6,
      percentage: 66.7,
      isPassing: true,
      passingMarks: 3,
      passingPercentage: 50,
      teacherNotes: 'Good work. Review secure protocols.',
      publishedAt: submittedSampleIso,
      questionGrades: {
        'q-ram': { maxMarks: 2, awardedMarks: 2, negativeDeduction: 0, isCorrect: true, feedback: null, pendingManual: false, gradedAt: submittedSampleIso, revision: 1 },
        'q-byte': { maxMarks: 2, awardedMarks: 2, negativeDeduction: 0, isCorrect: true, feedback: null, pendingManual: false, gradedAt: submittedSampleIso, revision: 1 },
        'q-https': { maxMarks: 2, awardedMarks: 0, negativeDeduction: 0, isCorrect: false, feedback: 'HTTPS is used instead of plain HTTP.', pendingManual: false, gradedAt: submittedSampleIso, revision: 1 },
      },
      sample: true,
    },
  ];

  data.reports = [
    {
      id: 'report-sample',
      examId: 'exam-ict',
      examTitle: 'ICT Fundamentals — Sample Exam',
      submissions: 1,
      averagePercentage: 66.7,
      sample: true,
    },
  ];

  data.auditLog = [
    {
      id: 'audit-sample',
      time: now,
      createdAt: now,
      actor: 'Amina Khan (sample admin)',
      actorUserId: 'member-admin',
      action: 'sample.data.seeded',
      targetType: 'institution',
      targetId: instId,
      resource: 'Riverside College (sample)',
      metadata: { seeded: true, schemaVersion: LOCAL_SCHEMA_VERSION },
      sample: true,
    },
  ];

  const aux = EMPTY_AUX();
  aux.sessions = [
    {
      id: 'session-2026',
      institution_id: instId,
      name: '2026–2027 Academic Year',
      code: 'AY26-27',
      starts_on: '2026-09-01',
      ends_on: '2027-06-30',
      status: 'active',
      is_current: true,
      created_by: 'local-user-institution',
      created_at: now,
      updated_at: now,
    } as AcademicSessionRow,
  ];
  aux.terms = [
    {
      id: 'term-fall-2026',
      institution_id: instId,
      session_id: 'session-2026',
      name: 'Fall Term',
      starts_on: '2026-09-01',
      ends_on: '2026-12-20',
      status: 'active',
      is_current: true,
      created_at: now,
      updated_at: now,
    } as AcademicTermRow,
  ];
  aux.classes = [
    {
      id: 'class-year1',
      institution_id: instId,
      program_id: 'program-it',
      name: 'Year 1 Computing',
      code: 'Y1-IT',
      level_order: 1,
      created_at: now,
      updated_at: now,
    } as AcademicClassRow,
  ];
  aux.sections = [
    {
      id: 'section-ict-a',
      institution_id: instId,
      class_id: 'class-year1',
      name: 'Section A',
      capacity: 40,
      created_at: now,
      updated_at: now,
    } as ClassSectionRow,
  ];
  aux.teacherAssignments = [
    {
      id: 'ta-samira-ict101',
      institution_id: instId,
      membership_id: 'member-teacher-1',
      course_id: 'course-ict101',
      academic_session_id: 'session-2026',
      academic_term_id: 'term-fall-2026',
      class_section_id: 'section-ict-a',
      assigned_by: 'local-user-institution',
      created_at: now,
    } as TeacherAssignmentRow,
    {
      id: 'ta-daniel-math201',
      institution_id: instId,
      membership_id: 'member-teacher-2',
      course_id: 'course-math201',
      academic_session_id: 'session-2026',
      academic_term_id: 'term-fall-2026',
      class_section_id: 'section-ict-a',
      assigned_by: 'local-user-institution',
      created_at: now,
    } as TeacherAssignmentRow,
  ];
  aux.enrollments = [
    {
      id: 'enroll-014',
      institution_id: instId,
      student_id: 'student-014',
      academic_session_id: 'session-2026',
      academic_term_id: 'term-fall-2026',
      class_section_id: 'section-ict-a',
      status: 'enrolled',
      enrolled_by: 'local-user-institution',
      enrolled_at: now,
      updated_at: now,
    } as StudentEnrollmentRow,
    {
      id: 'enroll-015',
      institution_id: instId,
      student_id: 'student-015',
      academic_session_id: 'session-2026',
      academic_term_id: 'term-fall-2026',
      class_section_id: 'section-ict-a',
      status: 'enrolled',
      enrolled_by: 'local-user-institution',
      enrolled_at: now,
      updated_at: now,
    } as StudentEnrollmentRow,
  ];
  aux.questionSets = [
    {
      id: 'qset-ict-core',
      institution_id: instId,
      course_id: 'course-ict101',
      title: 'ICT Core Concepts Set',
      description: 'Reusable starter set covering hardware, bytes, and networking.',
      created_by: 'local-user-teacher',
      created_at: now,
      updated_at: now,
      items: [
        { id: 'qsi-1', question_id: 'q-ram', sort_order: 0 },
        { id: 'qsi-2', question_id: 'q-byte', sort_order: 1 },
        { id: 'qsi-3', question_id: 'q-https', sort_order: 2 },
      ],
    },
  ];
  aux.examSections = [
    {
      id: 'sec-ict-a',
      institution_id: instId,
      exam_id: 'exam-ict',
      title: 'Part A: Multiple Choice',
      description: 'Core digital concepts.',
      section_type: 'mcq',
      sort_order: 0,
      shuffle_questions: false,
    },
    {
      id: 'sec-mixed-a',
      institution_id: instId,
      exam_id: 'exam-mixed',
      title: 'Part A: Quick Check & Written Response',
      description: 'Includes one MCQ and one written answer.',
      section_type: 'mixed',
      sort_order: 0,
      shuffle_questions: false,
    },
  ];
  aux.examSectionQuestions = [
    { id: 'esq-1', exam_id: 'exam-ict', section_id: 'sec-ict-a', question_id: 'q-ram', sort_order: 0, marks: 2, negative_marks: 0 },
    { id: 'esq-2', exam_id: 'exam-ict', section_id: 'sec-ict-a', question_id: 'q-byte', sort_order: 1, marks: 2, negative_marks: 0 },
    { id: 'esq-3', exam_id: 'exam-ict', section_id: 'sec-ict-a', question_id: 'q-https', sort_order: 2, marks: 2, negative_marks: 0 },
    { id: 'esq-4', exam_id: 'exam-mixed', section_id: 'sec-mixed-a', question_id: 'q-https', sort_order: 0, marks: 2, negative_marks: 0.5 },
    { id: 'esq-5', exam_id: 'exam-mixed', section_id: 'sec-mixed-a', question_id: 'q-ram-rom', sort_order: 1, marks: 5, negative_marks: 0 },
  ];
  aux.examAssignments = [
    {
      id: 'assign-ict-sec-a',
      exam_id: 'exam-ict',
      target_type: 'section',
      class_id: null,
      class_section_id: 'section-ict-a',
      student_id: null,
      created_at: now,
    },
    {
      id: 'assign-mixed-sec-a',
      exam_id: 'exam-mixed',
      target_type: 'section',
      class_id: null,
      class_section_id: 'section-ict-a',
      student_id: null,
      created_at: now,
    },
  ];
  aux.examVersions = [
    {
      id: 'ver-exam-ict-1',
      institution_id: instId,
      exam_id: 'exam-ict',
      version_number: 1,
      title: 'ICT Fundamentals — Sample Exam',
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      duration_minutes: 10,
      total_marks: 6,
      passing_marks: 3,
      passing_percentage: 50,
      negative_marking_enabled: false,
      default_negative_marks: 0,
      shuffle_questions: false,
      shuffle_options: false,
      attempt_count: 1,
      published_by: 'local-user-teacher',
      published_at: startsAtIso,
      snapshot_payload: {
        versionNumber: 1,
        publishedAt: startsAtIso,
        examId: 'exam-ict',
        title: 'ICT Fundamentals — Sample Exam',
        description: 'Clearly labelled sample MCQ exam with published sample results.',
        instructions: 'Answer all multiple-choice questions carefully.',
        courseCode: 'ICT101',
        courseTitle: 'ICT Fundamentals',
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        durationMinutes: 10,
        totalMarks: 6,
        passingMarks: 3,
        passingPercentage: 50,
        negativeMarkingEnabled: false,
        defaultNegativeMarks: 0,
        shuffleQuestions: false,
        shuffleOptions: false,
        sections: [
          {
            id: 'sec-ict-a',
            title: 'Part A: Multiple Choice',
            description: 'Core digital concepts.',
            section_type: 'mcq',
            sort_order: 0,
            shuffle_questions: false,
            sectionTotalMarks: 6,
            questions: [
              {
                id: 'q-ram',
                institution_id: instId,
                course_id: 'course-ict101',
                section_question_id: 'esq-1',
                sort_order: 0,
                question_type: 'mcq_single',
                title: 'Volatile memory',
                prompt: 'Which component is the computer’s main volatile memory?',
                marks: 2,
                negative_marks: 0,
                effective_marks: 2,
                effective_negative_marks: 0,
                expected_word_count: null,
                options: [
                  { id: 'opt-ram-a', option_key: 'A', option_text: 'Hard disk', sort_order: 0 },
                  { id: 'opt-ram-b', option_key: 'B', option_text: 'RAM', sort_order: 1 },
                  { id: 'opt-ram-c', option_key: 'C', option_text: 'ROM', sort_order: 2 },
                ],
              },
              {
                id: 'q-byte',
                institution_id: instId,
                course_id: 'course-ict101',
                section_question_id: 'esq-2',
                sort_order: 1,
                question_type: 'mcq_single',
                title: 'Bytes',
                prompt: 'How many bits are in one byte?',
                marks: 2,
                negative_marks: 0,
                effective_marks: 2,
                effective_negative_marks: 0,
                expected_word_count: null,
                options: [
                  { id: 'opt-byte-a', option_key: 'A', option_text: '4', sort_order: 0 },
                  { id: 'opt-byte-b', option_key: 'B', option_text: '8', sort_order: 1 },
                  { id: 'opt-byte-c', option_key: 'C', option_text: '16', sort_order: 2 },
                ],
              },
              {
                id: 'q-https',
                institution_id: instId,
                course_id: 'course-ict101',
                section_question_id: 'esq-3',
                sort_order: 2,
                question_type: 'mcq_single',
                title: 'Secure web traffic',
                prompt: 'Which protocol is used to carry web pages securely?',
                marks: 2,
                negative_marks: 0,
                effective_marks: 2,
                effective_negative_marks: 0,
                expected_word_count: null,
                options: [
                  { id: 'opt-https-a', option_key: 'A', option_text: 'HTTP', sort_order: 0 },
                  { id: 'opt-https-b', option_key: 'B', option_text: 'FTP', sort_order: 1 },
                  { id: 'opt-https-c', option_key: 'C', option_text: 'HTTPS', sort_order: 2 },
                ],
              },
            ],
          },
        ],
        assignments: [{ target_type: 'section', target_id: 'section-ict-a', label: 'Year 1 Computing — Section A' }],
      },
      answer_keys: {
        'q-ram': { correct_option_keys: ['B'], sample_answer: null, grading_rubric: null, explanation: 'RAM loses stored contents when power is removed.' },
        'q-byte': { correct_option_keys: ['B'], sample_answer: null, grading_rubric: null, explanation: 'One standard byte equals 8 bits.' },
        'q-https': { correct_option_keys: ['C'], sample_answer: null, grading_rubric: null, explanation: 'HTTPS layers HTTP over TLS encryption.' },
      },
    },
    {
      id: 'ver-exam-mixed-1',
      institution_id: instId,
      exam_id: 'exam-mixed',
      version_number: 1,
      title: 'ICT Short Answer — Sample Exam',
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      duration_minutes: 15,
      total_marks: 7,
      passing_marks: null,
      passing_percentage: 50,
      negative_marking_enabled: true,
      default_negative_marks: 0.5,
      shuffle_questions: false,
      shuffle_options: false,
      attempt_count: 0,
      published_by: 'local-user-teacher',
      published_at: startsAtIso,
      snapshot_payload: {
        versionNumber: 1,
        publishedAt: startsAtIso,
        examId: 'exam-mixed',
        title: 'ICT Short Answer — Sample Exam',
        description: 'Open sample assessment with 1 MCQ and 1 manually graded written question.',
        instructions: 'Complete both sections within 15 minutes and review before submitting.',
        courseCode: 'ICT101',
        courseTitle: 'ICT Fundamentals',
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        durationMinutes: 15,
        totalMarks: 7,
        passingMarks: null,
        passingPercentage: 50,
        negativeMarkingEnabled: true,
        defaultNegativeMarks: 0.5,
        shuffleQuestions: false,
        shuffleOptions: false,
        sections: [
          {
            id: 'sec-mixed-a',
            title: 'Part A: Quick Check & Written Response',
            description: 'Includes one MCQ and one written answer.',
            section_type: 'mixed',
            sort_order: 0,
            shuffle_questions: false,
            sectionTotalMarks: 7,
            questions: [
              {
                id: 'q-https',
                institution_id: instId,
                course_id: 'course-ict101',
                section_question_id: 'esq-4',
                sort_order: 0,
                question_type: 'mcq_single',
                title: 'Secure web traffic',
                prompt: 'Which protocol is used to carry web pages securely?',
                marks: 2,
                negative_marks: 0.5,
                effective_marks: 2,
                effective_negative_marks: 0.5,
                expected_word_count: null,
                options: [
                  { id: 'opt-m-https-a', option_key: 'A', option_text: 'HTTP', sort_order: 0 },
                  { id: 'opt-m-https-b', option_key: 'B', option_text: 'FTP', sort_order: 1 },
                  { id: 'opt-m-https-c', option_key: 'C', option_text: 'HTTPS', sort_order: 2 },
                ],
              },
              {
                id: 'q-ram-rom',
                institution_id: instId,
                course_id: 'course-ict101',
                section_question_id: 'esq-5',
                sort_order: 1,
                question_type: 'descriptive',
                title: 'RAM and ROM',
                prompt: 'Explain one key difference between RAM and ROM.',
                marks: 5,
                negative_marks: 0,
                effective_marks: 5,
                effective_negative_marks: 0,
                expected_word_count: 60,
                options: [],
              },
            ],
          },
        ],
        assignments: [{ target_type: 'section', target_id: 'section-ict-a', label: 'Year 1 Computing — Section A' }],
      },
      answer_keys: {
        'q-https': { correct_option_keys: ['C'], sample_answer: null, grading_rubric: null, explanation: 'HTTPS layers HTTP over TLS encryption.' },
        'q-ram-rom': {
          correct_option_keys: [],
          sample_answer: 'RAM is volatile working memory that clears on power-off; ROM is non-volatile firmware storage.',
          grading_rubric: 'Award 3 marks for volatility distinction and 2 marks for a concrete use-case.',
          explanation: null,
        },
      },
    },
  ];
  aux.proctoringEvents = [
    {
      id: 'proc-sample-1',
      attemptId: 'attempt-sample-complete',
      studentId: 'student-014',
      eventType: 'tab_visibility_hidden',
      severity: 'warning',
      details: { note: 'Sample focus shift event recorded during demo attempt' },
      createdAt: eventSampleIso,
    },
  ];
  aux.attemptReviews = [
    {
      id: 'rev-sample-1',
      attemptId: 'attempt-sample-complete',
      reviewerId: 'member-invigilator',
      reviewStatus: 'flagged',
      reviewNotes: 'Brief tab switch detected in sample attempt; awaiting review.',
      updatedAt: submittedSampleIso,
    },
  ];

  return { schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: now, seeded: true, data, aux };
}

function migrateSnapshot(parsed: z.infer<typeof envelopeSchema>): LocalSnapshot {
  const data = EMPTY_DATA();
  for (const collection of LOCAL_COLLECTIONS) {
    const records = parsed.data[collection] ?? [];
    data[collection] = records as LocalEntity[];
  }

  const aux = EMPTY_AUX();
  if (parsed.aux) {
    if (Array.isArray(parsed.aux.sessions)) aux.sessions = parsed.aux.sessions;
    if (Array.isArray(parsed.aux.terms)) aux.terms = parsed.aux.terms;
    if (Array.isArray(parsed.aux.classes)) aux.classes = parsed.aux.classes;
    if (Array.isArray(parsed.aux.sections)) aux.sections = parsed.aux.sections;
    if (Array.isArray(parsed.aux.teacherAssignments)) aux.teacherAssignments = parsed.aux.teacherAssignments;
    if (Array.isArray(parsed.aux.enrollments)) aux.enrollments = parsed.aux.enrollments;
    if (Array.isArray(parsed.aux.questionSets)) aux.questionSets = parsed.aux.questionSets;
    if (Array.isArray(parsed.aux.examSections)) aux.examSections = parsed.aux.examSections;
    if (Array.isArray(parsed.aux.examSectionQuestions)) aux.examSectionQuestions = parsed.aux.examSectionQuestions;
    if (Array.isArray(parsed.aux.examAssignments)) aux.examAssignments = parsed.aux.examAssignments;
    if (Array.isArray(parsed.aux.examVersions)) aux.examVersions = parsed.aux.examVersions;
    if (Array.isArray(parsed.aux.proctoringEvents)) aux.proctoringEvents = parsed.aux.proctoringEvents;
    if (Array.isArray(parsed.aux.attemptReviews)) aux.attemptReviews = parsed.aux.attemptReviews;
    if (Array.isArray(parsed.aux.csvImportJobs)) aux.csvImportJobs = parsed.aux.csvImportJobs;
    if (Array.isArray(parsed.aux.questionImportJobs)) aux.questionImportJobs = parsed.aux.questionImportJobs;
    if (Array.isArray(parsed.aux.attachments)) aux.attachments = parsed.aux.attachments;
  }

  // v1 -> v2 schema migration: backfill missing questionIds / timestamps cleanly
  if (parsed.schemaVersion === 1) {
    data.grades = data.grades.map((grade) => ({
      passingPercentage: 50,
      ...grade,
    }));
  }

  return {
    schemaVersion: LOCAL_SCHEMA_VERSION,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    seeded: parsed.seeded ?? false,
    data,
    aux,
  };
}

function normalizeSnapshot(value: unknown): LocalSnapshot {
  const parsed = envelopeSchema.parse(value);
  return migrateSnapshot(parsed);
}

const browserStorage: StorageAdapter = {
  getItem(key) {
    try { return typeof window === 'undefined' ? null : window.localStorage.getItem(key); }
    catch { return null; }
  },
  setItem(key, value) {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); }
    catch { /* The in-memory copy remains usable if browser storage is unavailable. */ }
  },
  removeItem(key) {
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(key); }
    catch { /* Ignore unavailable browser storage. */ }
  },
};

export function createLocalRepository(storage: StorageAdapter = browserStorage): ExamRepository {
  let memorySnapshot: LocalSnapshot | null = null;

  const persist = (snapshot: LocalSnapshot): LocalSnapshot => {
    const updated: LocalSnapshot = {
      ...snapshot,
      schemaVersion: LOCAL_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };
    memorySnapshot = updated;
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  };

  const read = (): LocalSnapshot => {
    if (memorySnapshot) return memorySnapshot;
    const raw = storage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return persist(createSampleData());
    try {
      const rawJson = JSON.parse(raw) as unknown;
      const parsed = normalizeSnapshot(rawJson);
      memorySnapshot = parsed;
      if ((rawJson as { schemaVersion?: unknown })?.schemaVersion !== LOCAL_SCHEMA_VERSION) {
        return persist(parsed);
      }
      return parsed;
    } catch {
      return persist(createSampleData());
    }
  };

  return {
    read,
    list(collection) { return [...read().data[collection]]; },
    get(collection, id) { return read().data[collection].find((record) => record.id === id) ?? null; },
    create(collection, input) {
      const snapshot = read();
      const record = { ...input, id: input.id ?? `local-${crypto.randomUUID()}` } as LocalEntity;
      snapshot.data[collection] = [...snapshot.data[collection], record];
      persist(snapshot);
      return record;
    },
    update(collection, id, patch) {
      const snapshot = read();
      const current = snapshot.data[collection].find((record) => record.id === id);
      if (!current) return null;
      const updated = { ...current, ...patch, id } as LocalEntity;
      snapshot.data[collection] = snapshot.data[collection].map((record) => record.id === id ? updated : record);
      persist(snapshot);
      return updated;
    },
    delete(collection, id) {
      const snapshot = read();
      const next = snapshot.data[collection].filter((record) => record.id !== id);
      if (next.length === snapshot.data[collection].length) return false;
      snapshot.data[collection] = next;
      persist(snapshot);
      return true;
    },
    mutate<T>(fn: (snapshot: LocalSnapshot) => T): T {
      const snapshot = read();
      const result = fn(snapshot);
      persist(snapshot);
      return result;
    },
    resetSampleData() {
      memorySnapshot = null;
      storage.removeItem(LOCAL_STORAGE_KEY);
      return persist(createSampleData());
    },
    exportJson() { return JSON.stringify(read(), null, 2); },
    importJson(json) {
      const imported = normalizeSnapshot(JSON.parse(json) as unknown);
      return persist({ ...imported, seeded: false });
    },
  };
}

export const localRepository = createLocalRepository();
