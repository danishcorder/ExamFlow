import { z } from 'zod';

export const reportsInputSchema = z
  .object({
    institutionId: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), {
    message: 'Start date must be before end date',
    path: ['from'],
  });

export type ReportsInput = z.infer<typeof reportsInputSchema>;

export type ReportExamInput = {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'closed' | 'archived';
  starts_at: string | null;
  created_at: string;
  total_marks: number;
  course_label: string | null;
};
export type ReportAttemptInput = { exam_id: string; attempt_id: string; status: string };
export type ReportGradeInput = {
  exam_id: string;
  attempt_id: string;
  status: 'ungraded' | 'draft' | 'moderated' | 'published';
  percentage: number | string;
  is_passing: boolean;
};

export type ExamReportRow = {
  examId: string;
  title: string;
  courseLabel: string | null;
  status: ReportExamInput['status'];
  examDate: string;
  started: number;
  submitted: number;
  /** Submitted attempts with no grade record yet (auto-grading not run / not started). */
  ungraded: number;
  draft: number;
  moderated: number;
  published: number;
  /** Submitted work that still needs an examiner action before students can see it. */
  needsAction: number;
  averagePercentage: number | null;
  passRate: number | null;
};

export type ReportsOverview = {
  totals: {
    exams: number;
    submissions: number;
    graded: number;
    needsAction: number;
    averagePercentage: number | null;
    passRate: number | null;
  };
  exams: ExamReportRow[];
};

const r1 = (n: number) => Number(n.toFixed(1));

export function inDateRange(iso: string, from?: string, to?: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (from && t < Date.parse(from)) return false;
  if (to && t > Date.parse(to)) return false;
  return true;
}

/** Pure aggregation: one row per exam plus institution totals. */
export function buildReportsOverview(
  exams: ReportExamInput[],
  attempts: ReportAttemptInput[],
  grades: ReportGradeInput[],
  range: { from?: string | undefined; to?: string | undefined } = {},
): ReportsOverview {
  const attemptsByExam = new Map<string, ReportAttemptInput[]>();
  for (const a of attempts) {
    const list = attemptsByExam.get(a.exam_id) ?? [];
    list.push(a);
    attemptsByExam.set(a.exam_id, list);
  }
  const gradesByExam = new Map<string, ReportGradeInput[]>();
  for (const g of grades) {
    const list = gradesByExam.get(g.exam_id) ?? [];
    list.push(g);
    gradesByExam.set(g.exam_id, list);
  }

  const rows: ExamReportRow[] = [];
  for (const ex of exams) {
    const examDate = ex.starts_at ?? ex.created_at;
    if (!inDateRange(examDate, range.from, range.to)) continue;

    const at = attemptsByExam.get(ex.id) ?? [];
    const gr = gradesByExam.get(ex.id) ?? [];
    const submittedIds = new Set(at.filter((a) => a.status !== 'in_progress').map((a) => a.attempt_id));
    const gradedSubmitted = gr.filter((g) => submittedIds.has(g.attempt_id));
    const gradedIds = new Set(gradedSubmitted.map((g) => g.attempt_id));
    const ungraded = [...submittedIds].filter((id) => !gradedIds.has(id)).length;
    const count = (s: ReportGradeInput['status']) => gradedSubmitted.filter((g) => g.status === s).length;
    const draft = count('draft') + count('ungraded');
    const moderated = count('moderated');
    const published = count('published');

    const pct = gradedSubmitted.map((g) => Number(g.percentage));
    rows.push({
      examId: ex.id,
      title: ex.title,
      courseLabel: ex.course_label,
      status: ex.status,
      examDate,
      started: at.length,
      submitted: submittedIds.size,
      ungraded,
      draft,
      moderated,
      published,
      needsAction: ungraded + draft + moderated,
      averagePercentage: pct.length ? r1(pct.reduce((a, b) => a + b, 0) / pct.length) : null,
      passRate: gradedSubmitted.length
        ? r1((gradedSubmitted.filter((g) => g.is_passing).length / gradedSubmitted.length) * 100)
        : null,
    });
  }
  rows.sort((a, b) => b.needsAction - a.needsAction || Date.parse(b.examDate) - Date.parse(a.examDate));

  const allGraded = rows.reduce((n, r) => n + (r.submitted - r.ungraded), 0);
  const weightedPct = rows.reduce((n, r) => n + (r.averagePercentage ?? 0) * (r.submitted - r.ungraded), 0);
  const weightedPass = rows.reduce((n, r) => n + (r.passRate ?? 0) * (r.submitted - r.ungraded), 0);

  return {
    totals: {
      exams: rows.length,
      submissions: rows.reduce((n, r) => n + r.submitted, 0),
      graded: allGraded,
      needsAction: rows.reduce((n, r) => n + r.needsAction, 0),
      averagePercentage: allGraded ? r1(weightedPct / allGraded) : null,
      passRate: allGraded ? r1(weightedPass / allGraded) : null,
    },
    exams: rows,
  };
}

export const REPORT_CSV_HEADERS = [
  'Exam', 'Course', 'Status', 'Exam date', 'Started', 'Submitted', 'Not yet graded',
  'Draft grades', 'Moderated', 'Published', 'Average %', 'Pass rate %',
];

export function reportRowsToCsv(rows: ExamReportRow[]): unknown[][] {
  return rows.map((r) => [
    r.title, r.courseLabel ?? '', r.status, r.examDate, r.started, r.submitted, r.ungraded,
    r.draft, r.moderated, r.published, r.averagePercentage ?? '', r.passRate ?? '',
  ]);
}
