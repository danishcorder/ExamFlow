export type LocalQuestionType = 'mcq_single' | 'mcq_multi' | 'descriptive' | 'long_answer';

export type GradingQuestion = {
  id: string;
  questionType: LocalQuestionType;
  marks: number;
  negativeMarks: number;
  correctOptionKeys: string[];
};

export type GradingExam = {
  id: string;
  questionIds: string[];
  passingPercentage: number;
  passingMarks?: number | null;
};

export type GradingAnswer = {
  selectedOptionKeys: string[];
  descriptiveText: string | null;
};

export type LocalQuestionGrade = {
  maxMarks: number;
  awardedMarks: number;
  negativeDeduction: number;
  isCorrect: boolean | null;
  feedback: string | null;
  pendingManual: boolean;
  rubricBreakdown?: Record<string, string>;
  gradedAt?: string;
  revision?: number;
};

export type LocalGrade = {
  id: string;
  examId: string;
  attemptId: string;
  studentId: string;
  status: 'ungraded' | 'draft' | 'moderated' | 'published';
  totalAwardedMarks: number;
  maxPossibleMarks: number;
  percentage: number;
  isPassing: boolean;
  passingPercentage?: number | null;
  passingMarks?: number | null;
  teacherNotes: string | null;
  publishedAt?: string | null;
  questionGrades: Record<string, LocalQuestionGrade>;
};

function sameKeys(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((key, index) => key === sortedRight[index]);
}

function computeIsPassing(
  totalAwardedMarks: number,
  percentage: number,
  passingMarks?: number | null,
  passingPercentage?: number | null,
): boolean {
  if (passingMarks != null) {
    return totalAwardedMarks >= passingMarks;
  }
  if (passingPercentage != null) {
    return percentage >= passingPercentage;
  }
  return percentage >= 50;
}

export function gradeLocalExam(
  exam: GradingExam,
  questions: readonly GradingQuestion[],
  answers: Readonly<Record<string, GradingAnswer>>,
  attemptId: string,
  studentId: string,
): LocalGrade {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const questionGrades: Record<string, LocalQuestionGrade> = {};
  const now = new Date().toISOString();

  for (const questionId of exam.questionIds) {
    const question = questionById.get(questionId);
    if (!question) continue;
    if (question.questionType === 'mcq_single' || question.questionType === 'mcq_multi') {
      const answer = answers[question.id];
      const selected = answer?.selectedOptionKeys ?? [];
      const isCorrect = question.correctOptionKeys.length > 0 && sameKeys(selected, question.correctOptionKeys);
      const deduction = !isCorrect && selected.length > 0 ? Math.max(0, question.negativeMarks) : 0;
      questionGrades[question.id] = {
        maxMarks: question.marks,
        awardedMarks: isCorrect ? question.marks : 0,
        negativeDeduction: deduction,
        isCorrect,
        feedback: null,
        pendingManual: false,
        gradedAt: now,
        revision: 1,
      };
    } else {
      questionGrades[question.id] = {
        maxMarks: question.marks,
        awardedMarks: 0,
        negativeDeduction: 0,
        isCorrect: null,
        feedback: null,
        pendingManual: true,
        gradedAt: now,
        revision: 0,
      };
    }
  }

  return summarizeGrade(exam, attemptId, studentId, questionGrades);
}

export function applyLocalManualGrade(
  grade: LocalGrade,
  questionId: string,
  awardedMarks: number,
  feedback: string | null,
): LocalGrade {
  const current = grade.questionGrades[questionId];
  if (!current || !current.pendingManual) throw new Error('Question is not awaiting manual grading.');
  if (!Number.isFinite(awardedMarks) || awardedMarks < 0 || awardedMarks > current.maxMarks) {
    throw new RangeError(`Marks must be between 0 and ${current.maxMarks}.`);
  }
  const questionGrades: Record<string, LocalQuestionGrade> = {
    ...grade.questionGrades,
    [questionId]: {
      ...current,
      awardedMarks,
      feedback,
      pendingManual: false,
      gradedAt: new Date().toISOString(),
      revision: (current.revision ?? 0) + 1,
    },
  };
  const allGraded = Object.values(questionGrades).every((item) => !item.pendingManual);
  const totalAwardedMarks = Object.values(questionGrades).reduce((sum, item) => sum + item.awardedMarks, 0);
  const percentage = grade.maxPossibleMarks > 0
    ? Number(((totalAwardedMarks / grade.maxPossibleMarks) * 100).toFixed(1))
    : 0;
  return {
    ...grade,
    status: allGraded ? 'published' : 'draft',
    totalAwardedMarks,
    percentage,
    isPassing: computeIsPassing(totalAwardedMarks, percentage, grade.passingMarks, grade.passingPercentage),
    questionGrades,
  };
}

export function saveLocalQuestionGrade(
  grade: LocalGrade,
  questionId: string,
  awardedMarks: number,
  feedback: string | null,
  rubricBreakdown: Record<string, string> = {},
): LocalGrade {
  const current = grade.questionGrades[questionId];
  if (!current) throw new Error('Question is not part of this grade record.');
  if (!Number.isFinite(awardedMarks) || awardedMarks < 0 || awardedMarks > current.maxMarks) {
    throw new RangeError(`Marks must be between 0 and ${current.maxMarks}.`);
  }
  const questionGrades: Record<string, LocalQuestionGrade> = {
    ...grade.questionGrades,
    [questionId]: {
      ...current,
      awardedMarks,
      feedback,
      rubricBreakdown,
      pendingManual: false,
      gradedAt: new Date().toISOString(),
      revision: (current.revision ?? 0) + 1,
    },
  };
  const allGraded = Object.values(questionGrades).every((item) => !item.pendingManual);
  const totalAwardedMarks = Object.values(questionGrades).reduce((sum, item) => sum + item.awardedMarks, 0);
  const percentage = grade.maxPossibleMarks > 0
    ? Number(((totalAwardedMarks / grade.maxPossibleMarks) * 100).toFixed(1))
    : 0;
  const nextStatus = grade.status === 'published'
    ? 'published'
    : allGraded
      ? 'moderated'
      : 'draft';
  return {
    ...grade,
    status: nextStatus,
    totalAwardedMarks,
    percentage,
    isPassing: computeIsPassing(totalAwardedMarks, percentage, grade.passingMarks, grade.passingPercentage),
    questionGrades,
  };
}

function summarizeGrade(
  exam: GradingExam,
  attemptId: string,
  studentId: string,
  questionGrades: Record<string, LocalQuestionGrade>,
): LocalGrade {
  const values = Object.values(questionGrades);
  const maxPossibleMarks = values.reduce((sum, item) => sum + item.maxMarks, 0);
  const totalAwardedMarks = values.reduce((sum, item) => sum + item.awardedMarks, 0);
  const percentage = maxPossibleMarks > 0
    ? Number(((totalAwardedMarks / maxPossibleMarks) * 100).toFixed(1))
    : 0;
  const allGraded = values.every((item) => !item.pendingManual);
  return {
    id: `grade-${attemptId}`,
    examId: exam.id,
    attemptId,
    studentId,
    status: allGraded ? 'published' : 'draft',
    totalAwardedMarks,
    maxPossibleMarks,
    percentage,
    isPassing: computeIsPassing(totalAwardedMarks, percentage, exam.passingMarks, exam.passingPercentage),
    passingPercentage: exam.passingPercentage,
    passingMarks: exam.passingMarks ?? null,
    teacherNotes: null,
    publishedAt: allGraded ? new Date().toISOString() : null,
    questionGrades,
  };
}
