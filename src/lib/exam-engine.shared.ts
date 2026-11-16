import type {
  ExamAttemptStatus,
  ExamSectionType,
  ExamStatus,
  QuestionDifficulty,
  QuestionType,
} from '@/integrations/supabase/types';

export type StudentIdentity = {
  userId: string;
  institutionId: string;
  membershipId: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  email: string | null;
  enrolledSectionIds: string[];
  enrolledClassIds: string[];
};

export type StudentExamBucket = 'active' | 'upcoming' | 'completed';

export type StudentExamSummaryItem = {
  examId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  courseId: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number | null;
  passingPercentage: number | null;
  negativeMarkingEnabled: boolean;
  defaultNegativeMarks: number;
  totalQuestions: number;
  sectionCount: number;
  examStatus: ExamStatus;
  bucket: StudentExamBucket;
  eligibilityReason: 'student' | 'section' | 'class';
  attempt: {
    id: string;
    status: ExamAttemptStatus;
    startedAt: string;
    expiresAt: string;
    submittedAt: string | null;
    submissionReason: string | null;
    lastSavedAt: string | null;
    answeredCount: number;
    totalQuestions: number;
    remainingSeconds: number;
  } | null;
};

export type StudentExamDashboardData = {
  serverNow: string;
  student: {
    studentId: string;
    studentCode: string;
    fullName: string;
    email: string | null;
  };
  summary: {
    eligibleCount: number;
    activeCount: number;
    inProgressCount: number;
    upcomingCount: number;
    completedCount: number;
  };
  exams: StudentExamSummaryItem[];
};

export type StudentSafeExamOption = {
  id: string;
  option_key: string;
  option_text: string;
  sort_order: number;
};

export type StudentSafeExamAttachment = {
  id: string;
  attachment_kind: 'image' | 'document';
  file_name: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  signedUrl: string | null;
};

export type StudentSafeExamQuestion = {
  id: string;
  question_id: string;
  section_question_id: string;
  sort_order: number;
  question_type: QuestionType;
  title: string;
  prompt: string;
  topic: string;
  category: string;
  difficulty: QuestionDifficulty;
  expected_word_count: number | null;
  effective_marks: number;
  effective_negative_marks: number;
  options: StudentSafeExamOption[];
  attachments: StudentSafeExamAttachment[];
};

export type StudentSafeExamSection = {
  id: string;
  title: string;
  description: string | null;
  section_type: ExamSectionType;
  sort_order: number;
  shuffle_questions: boolean;
  sectionTotalMarks: number;
  questions: StudentSafeExamQuestion[];
};

export type StudentAttemptAnswerRecord = {
  id: string;
  attemptId: string;
  questionId: string;
  sectionId: string;
  questionType: QuestionType;
  selectedOptionKeys: string[];
  descriptiveText: string | null;
  isFlagged: boolean;
  clientUpdatedAt: string | null;
  revision: number;
  savedAt: string;
};

export type StudentAttemptRecord = {
  id: string;
  institutionId: string;
  examId: string;
  examVersionId: string;
  studentId: string;
  status: ExamAttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  submissionReason: string | null;
  lastSavedAt: string | null;
  answeredCount: number;
  totalQuestions: number;
};

export type StudentExamLobbyData = {
  serverNow: string;
  exam: {
    examId: string;
    versionId: string;
    versionNumber: number;
    title: string;
    description: string | null;
    instructions: string | null;
    courseCode: string | null;
    courseTitle: string | null;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
    totalMarks: number;
    passingMarks: number | null;
    passingPercentage: number | null;
    negativeMarkingEnabled: boolean;
    defaultNegativeMarks: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    sectionCount: number;
    totalQuestions: number;
    examStatus: ExamStatus;
  };
  attempt: StudentAttemptRecord | null;
  canStart: boolean;
  canResume: boolean;
  isCompleted: boolean;
  blockReason: string | null;
  remainingSeconds: number;
};

export type ExamAttemptSessionData = {
  serverNow: string;
  remainingSeconds: number;
  exam: StudentExamLobbyData['exam'];
  attempt: StudentAttemptRecord;
  sections: StudentSafeExamSection[];
  answers: Record<string, StudentAttemptAnswerRecord>;
};

export type SaveExamAnswerInput = {
  institutionId: string;
  attemptId: string;
  questionId: string;
  selectedOptionKeys?: string[] | undefined;
  descriptiveText?: string | null | undefined;
  isFlagged?: boolean | undefined;
  clientUpdatedAt?: string | null | undefined;
};

export type SaveExamAnswerResult =
  | {
      status: 'saved';
      serverNow: string;
      remainingSeconds: number;
      answeredCount: number;
      staleIgnored: boolean;
      answer: StudentAttemptAnswerRecord;
    }
  | {
      status: 'expired_auto_submitted';
      serverNow: string;
      remainingSeconds: 0;
      attempt: StudentAttemptRecord;
    };

export type SubmitExamAttemptResult = {
  serverNow: string;
  alreadySubmitted: boolean;
  attempt: StudentAttemptRecord;
};

export type ExamHeartbeatResult = {
  serverNow: string;
  remainingSeconds: number;
  attempt: StudentAttemptRecord;
};

function deterministicHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seedKey: string): T[] {
  const copy = [...items];
  const rand = mulberry32(deterministicHash(seedKey));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function computeRemainingSeconds(expiresAtIso: string, nowMs: number): number {
  const expiresMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresMs)) return 0;
  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}

export function isAnswerPopulated(
  questionType: QuestionType,
  selectedOptionKeys: string[],
  descriptiveText: string | null,
): boolean {
  if (questionType === 'mcq_single' || questionType === 'mcq_multi') {
    return selectedOptionKeys.length > 0;
  }
  return Boolean(descriptiveText && descriptiveText.trim().length > 0);
}
