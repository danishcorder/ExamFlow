import type { StudentExamDashboardData, StudentExamSummaryItem } from './exam-engine.shared';

export type NextStep = {
  kind: 'resume' | 'start' | 'upcoming' | 'idle';
  headline: string;
  detail: string;
  examId?: string;
};

/** "2 days 3 h", "45 min", "under a minute". */
export function formatRelativeDuration(ms: number): string {
  const mins = Math.floor(Math.max(0, ms) / 60_000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const m = mins % 60;
    return m ? `${hours} h ${m} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return `${days} day${days === 1 ? '' : 's'}${h ? ` ${h} h` : ''}`;
}

/** What should the student do next? Pure and based on the server clock. */
export function describeNextStep(data: Pick<StudentExamDashboardData, 'serverNow' | 'exams'>): NextStep {
  const now = Date.parse(data.serverNow);
  const inProgress = data.exams.find((e) => e.bucket === 'active' && e.attempt?.status === 'in_progress');
  if (inProgress) {
    return {
      kind: 'resume',
      examId: inProgress.examId,
      headline: `Resume “${inProgress.title}”`,
      detail: `Your answers are saved. ${formatRelativeDuration((inProgress.attempt?.remainingSeconds ?? 0) * 1000)} left on the clock.`,
    };
  }
  const open = data.exams.filter((e) => e.bucket === 'active' && !e.attempt)
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))[0];
  if (open) {
    return {
      kind: 'start',
      examId: open.examId,
      headline: `“${open.title}” is open now`,
      detail: `${open.durationMinutes} minutes · closes in ${formatRelativeDuration(Date.parse(open.endsAt) - now)}.`,
    };
  }
  const next: StudentExamSummaryItem | undefined = data.exams.filter((e) => e.bucket === 'upcoming')
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  if (next) {
    return {
      kind: 'upcoming',
      headline: `Next: “${next.title}”`,
      detail: `Opens in ${formatRelativeDuration(Date.parse(next.startsAt) - now)} · ${next.durationMinutes} minutes.`,
    };
  }
  return { kind: 'idle', headline: 'You’re all caught up', detail: 'No exams are open or scheduled right now.' };
}
