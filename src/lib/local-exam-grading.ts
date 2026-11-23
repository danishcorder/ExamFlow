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
};

export type LocalGrade = {
  id: string;
  examId: string;
  attemptId: string;
  studentId: string;
  status: 'draft' | 'published';
  totalAwardedMarks: number;
  maxPossibleMarks: number;
  percentage: number;
  isPassing: boolean;
  teacherNotes: string | null;
  questionGrades: Record<string, LocalQuestionGrade>;
};

function sameKeys(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((key, index) => key === sortedRight[index]);
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

  for (const questionId of exam.questionIds) {
    const question = questionById.get(questionId);
    if (!question) continue;
    if (question.questionType === 'mcq_single' || question.questionType === 'mcq_multi') {
      const answer = answers[question.id];
      const selected = answer?.selectedOptionKeys ?? [];
      const isCorrect = sameKeys(selected, question.correctOptionKeys);
      const deduction = isCorrect ? 0 : Math.max(0, question.negativeMarks);
      questionGrades[question.id] = {
        maxMarks: question.marks,
        awardedMarks: isCorrect ? question.marks : 0,
        negativeDeduction: deduction,
        isCorrect,
        feedback: null,
        pendingManual: false,
      };
    } else {
      questionGrades[question.id] = {
        maxMarks: question.marks,
        awardedMarks: 0,
        negativeDeduction: 0,
        isCorrect: null,
        feedback: null,
        pendingManual: true,
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
  const questionGrades = {
    ...grade.questionGrades,
    [questionId]: {
      ...current,
      awardedMarks,
      feedback,
      pendingManual: false,
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
    isPassing: percentage >= 50,
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
    isPassing: percentage >= exam.passingPercentage,
    teacherNotes: null,
    questionGrades,
  };
}
