import type { QuestionType } from '@/integrations/supabase/types';

export type ExamGradeStatus = 'ungraded' | 'draft' | 'moderated' | 'published';

export type ExamAttemptGradeRecord = {
  id: string;
  institutionId: string;
  examId: string;
  examVersionId: string;
  attemptId: string;
  studentId: string;
  status: ExamGradeStatus;
  totalAwardedMarks: number;
  maxPossibleMarks: number;
  percentage: number;
  isPassing: boolean;
  teacherNotes: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExamQuestionGradeRecord = {
  id: string;
  institutionId: string;
  attemptId: string;
  questionId: string;
  maxMarks: number;
  awardedMarks: number;
  negativeDeduction: number;
  isCorrect: boolean | null;
  teacherFeedback: string | null;
  rubricBreakdown: Record<string, string>;
  gradedBy: string | null;
  gradedAt: string;
  revision: number;
};

export type StudentResultDetailItem = {
  questionId: string;
  sectionTitle: string;
  questionTitle: string;
  prompt: string;
  questionType: QuestionType;
  maxMarks: number;
  awardedMarks: number;
  negativeDeduction: number;
  isCorrect: boolean | null;
  selectedOptionKeys: string[];
  descriptiveText: string | null;
  teacherFeedback: string | null;
  rubricBreakdown: Record<string, string>;
};

export type StudentResultReport = {
  examId: string;
  examTitle: string;
  courseCode: string | null;
  courseTitle: string | null;
  versionNumber: number;
  attemptId: string;
  status: ExamGradeStatus;
  startedAt: string;
  submittedAt: string | null;
  totalAwardedMarks: number;
  maxPossibleMarks: number;
  percentage: number;
  isPassing: boolean;
  passingMarks: number | null;
  passingPercentage: number | null;
  teacherNotes: string | null;
  publishedAt: string | null;
  questions: StudentResultDetailItem[];
};

export type TeacherAttemptGradingRow = {
  attemptId: string;
  studentId: string;
  studentCode: string;
  studentFullName: string;
  studentEmail: string | null;
  status: 'in_progress' | 'submitted' | 'auto_submitted';
  startedAt: string;
  submittedAt: string | null;
  gradeStatus: ExamGradeStatus | null;
  totalAwardedMarks: number;
  maxPossibleMarks: number;
  percentage: number;
  isPassing: boolean;
  gradedQuestionsCount: number;
  totalQuestions: number;
};

export type TeacherExamGradingDashboardData = {
  exam: {
    examId: string;
    title: string;
    courseCode: string | null;
    courseTitle: string | null;
    totalMarks: number;
    passingMarks: number | null;
    passingPercentage: number | null;
    negativeMarkingEnabled: boolean;
    defaultNegativeMarks: number;
  };
  summary: {
    totalAttempts: number;
    submittedCount: number;
    gradedCount: number;
    publishedCount: number;
    averageScore: number;
    averagePercentage: number;
  };
  attempts: TeacherAttemptGradingRow[];
};

export type QuestionStatItem = {
  questionId: string;
  title: string;
  questionType: QuestionType;
  maxMarks: number;
  attemptCount: number;
  correctCount: number;
  averageAwarded: number;
  successRate: number;
};

export type ExamAnalyticsData = {
  examId: string;
  examTitle: string;
  totalSubmissions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passCount: number;
  failCount: number;
  passRate: number;
  questionStats: QuestionStatItem[];
};

export type TeacherAttemptQuestionDetail = {
  questionId: string;
  sectionTitle: string;
  questionTitle: string;
  prompt: string;
  questionType: QuestionType;
  maxMarks: number;
  awardedMarks: number;
  negativeDeduction: number;
  isCorrect: boolean | null;
  options: Array<{ optionKey: string; optionText: string }>;
  selectedOptionKeys: string[];
  correctOptionKeys: string[];
  descriptiveText: string | null;
  sampleAnswer: string | null;
  gradingRubric: string | null;
  teacherFeedback: string | null;
  rubricBreakdown: Record<string, string>;
};

export type TeacherAttemptGradingDetail = {
  attemptId: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentCode: string;
  studentFullName: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  totalAwardedMarks: number;
  maxPossibleMarks: number;
  percentage: number;
  isPassing: boolean;
  gradeStatus: ExamGradeStatus | null;
  teacherNotes: string | null;
  questions: TeacherAttemptQuestionDetail[];
};
