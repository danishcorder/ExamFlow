/**
 * Sample data for the public demo workspace (/demo). Entirely static and clearly
 * labelled in the UI; never read from or written to the database.
 */
import {
  buildReportsOverview,
  type ReportAttemptInput,
  type ReportExamInput,
  type ReportGradeInput,
} from './reports.shared';

export const DEMO_INSTITUTION = 'Riverside College (demo)';

const exams: ReportExamInput[] = [
  { id: 'd1', title: 'ICT Fundamentals — Midterm', status: 'published', starts_at: '2026-10-12T09:00:00Z', created_at: '2026-10-01T00:00:00Z', total_marks: 50, course_label: 'ICT101 — ICT Fundamentals' },
  { id: 'd2', title: 'Mathematics — Final', status: 'closed', starts_at: '2026-09-20T09:00:00Z', created_at: '2026-09-01T00:00:00Z', total_marks: 100, course_label: 'MATH201 — Calculus' },
  { id: 'd3', title: 'Physics — Quiz 3', status: 'published', starts_at: '2026-11-05T09:00:00Z', created_at: '2026-10-25T00:00:00Z', total_marks: 20, course_label: 'PHY110 — Mechanics' },
  { id: 'd4', title: 'English Composition — Essay Test', status: 'published', starts_at: '2026-11-15T09:00:00Z', created_at: '2026-11-01T00:00:00Z', total_marks: 40, course_label: 'ENG150 — Composition' },
];

/** Plan: [submitted, ungraded, draft, moderated, published, passes-in-graded, avg-percentage] */
const plan: Record<string, [number, number, number, number, number, number, number]> = {
  d1: [64, 6, 14, 4, 40, 0, 66],
  d2: [92, 0, 0, 0, 92, 0, 58],
  d3: [48, 0, 5, 0, 43, 0, 74],
  d4: [37, 37, 0, 0, 0, 0, 0],
};

function build() {
  const attempts: ReportAttemptInput[] = [];
  const grades: ReportGradeInput[] = [];
  for (const ex of exams) {
    const [submitted, ungraded, draft, moderated, published, , avg] = plan[ex.id]!;
    const graded = submitted - ungraded;
    for (let i = 0; i < submitted; i += 1) {
      const attempt_id = `${ex.id}-a${i}`;
      attempts.push({ exam_id: ex.id, attempt_id, status: 'submitted' });
      if (i < graded) {
        const status: ReportGradeInput['status'] =
          i < published ? 'published' : i < published + moderated ? 'moderated' : 'draft';
        // deterministic spread around the target average
        const pct = Math.max(8, Math.min(98, avg + ((i * 37) % 41) - 20));
        grades.push({ exam_id: ex.id, attempt_id, status, percentage: pct, is_passing: pct >= 50 });
      }
    }
    void draft;
  }
  return { attempts, grades };
}

const built = build();
export const DEMO_REPORTS = buildReportsOverview(exams, built.attempts, built.grades);

export const DEMO_KPIS = { students: 412, teachers: 18, activeExams: 3, departments: 6 };

export const DEMO_AUDIT = [
  { time: '2026-11-20 10:12', actor: 'A. Khan (Admin)', action: 'invite.created', resource: 'Teacher invitation' },
  { time: '2026-11-19 16:40', actor: 'S. Ali (Teacher)', action: 'exam.published', resource: 'Physics — Quiz 3' },
  { time: '2026-11-18 09:05', actor: 'A. Khan (Admin)', action: 'students.imported', resource: 'CSV · 58 students' },
  { time: '2026-11-17 14:22', actor: 'S. Ali (Teacher)', action: 'results.published', resource: 'Mathematics — Final' },
];

export const DEMO_STUDENT_EXAMS = {
  active: [{ title: 'Physics — Quiz 3', course: 'PHY110', window: 'Closes today 17:00', minutes: 30 }],
  upcoming: [{ title: 'English Composition — Essay Test', course: 'ENG150', window: 'Mon 24 Nov, 09:00', minutes: 60 }],
  completed: [
    { title: 'Mathematics — Final', course: 'MATH201', score: '71 / 100', pct: 71, feedback: 'Strong working in integration. Revisit series convergence tests.' },
    { title: 'ICT Fundamentals — Midterm', course: 'ICT101', score: '38 / 50', pct: 76, feedback: 'Good grasp of networking. Review binary arithmetic.' },
  ],
};

export const DEMO_GRADING_SAMPLE = {
  exam: 'ICT Fundamentals — Midterm',
  student: 'Student 014',
  question: 'Explain the difference between RAM and ROM, with one example use of each.',
  answer:
    'RAM is temporary memory that the computer uses while programs run, and it is erased when power is off. ROM keeps its data permanently, for example the startup instructions (BIOS). RAM is used by a web browser with many open tabs.',
  maxMarks: 5,
  suggestedMarks: 4,
  rubric: ['Defines RAM as volatile (1)', 'Defines ROM as non-volatile (1)', 'Example of RAM use (1)', 'Example of ROM use (1)', 'Clear, accurate wording (1)'],
};
