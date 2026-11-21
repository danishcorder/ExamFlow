import type { ExamAnalyticsData } from './grading.shared';

export type AnalyticsGradeRow = {
  attempt_id: string;
  total_awarded_marks: number | string;
  is_passing: boolean;
};

export type AnalyticsQuestionGradeRow = {
  question_id: string;
  awarded_marks: number | string;
  max_marks: number | string;
  is_correct: boolean | null;
};

export type AnalyticsSnapshotQuestion = {
  id: string;
  title: string;
  question_type: ExamAnalyticsData['questionStats'][number]['questionType'];
  effective_marks?: number | null;
};

const round1 = (n: number) => Number(n.toFixed(1));

/** Pure aggregation so results are testable and independent of how rows were fetched. */
export function computeExamAnalytics(
  base: { examId: string; examTitle: string },
  grades: AnalyticsGradeRow[],
  questionGrades: AnalyticsQuestionGradeRow[],
  snapshotQuestions: AnalyticsSnapshotQuestion[],
): ExamAnalyticsData {
  const total = grades.length;
  const scores = grades.map((g) => Number(g.total_awarded_marks));
  const passCount = grades.filter((g) => g.is_passing).length;
  const sum = scores.reduce((a, b) => a + b, 0);

  const byQuestion = new Map<string, { awarded: number; max: number; count: number; correct: number }>();
  for (const qg of questionGrades) {
    const cur = byQuestion.get(qg.question_id) ?? { awarded: 0, max: Number(qg.max_marks), count: 0, correct: 0 };
    cur.awarded += Number(qg.awarded_marks);
    cur.count += 1;
    if (qg.is_correct) cur.correct += 1;
    byQuestion.set(qg.question_id, cur);
  }

  const questionStats = snapshotQuestions.map((q) => {
    const s = byQuestion.get(q.id);
    const count = s?.count ?? 0;
    const avg = count > 0 && s ? s.awarded / count : 0;
    // Prefer the max actually graded; fall back to the snapshot's marks. No invented default.
    const maxMarks = s?.max ?? Number(q.effective_marks ?? 0);
    return {
      questionId: q.id,
      title: q.title,
      questionType: q.question_type,
      maxMarks,
      attemptCount: count,
      correctCount: s?.correct ?? 0,
      averageAwarded: round1(avg),
      successRate: maxMarks > 0 ? round1((avg / maxMarks) * 100) : 0,
    };
  });

  return {
    examId: base.examId,
    examTitle: base.examTitle,
    totalSubmissions: total,
    averageScore: total > 0 ? round1(sum / total) : 0,
    highestScore: total > 0 ? Math.max(...scores) : 0,
    lowestScore: total > 0 ? Math.min(...scores) : 0,
    passCount,
    failCount: total - passCount,
    passRate: total > 0 ? round1((passCount / total) * 100) : 0,
    questionStats,
  };
}

export const SUPABASE_PAGE = 1000;

/** Fetch every row of a query, paging past PostgREST's default 1000-row cap. */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE) {
    const { data, error } = await page(from, from + SUPABASE_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < SUPABASE_PAGE) return out;
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
