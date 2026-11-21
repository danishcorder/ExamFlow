import { describe, expect, it } from 'vitest';
import { buildReportsOverview, reportsInputSchema, reportRowsToCsv } from '@/lib/reports.shared';

const ex = (id: string, extra: object = {}) => ({
  id, title: `E-${id}`, status: 'published' as const, starts_at: '2026-03-10T00:00:00.000Z',
  created_at: '2026-03-01T00:00:00.000Z', total_marks: 100, course_label: null, ...extra,
});
const at = (exam_id: string, attempt_id: string, status = 'submitted') => ({ exam_id, attempt_id, status });
const gr = (exam_id: string, attempt_id: string, status: any, percentage: number, is_passing: boolean) =>
  ({ exam_id, attempt_id, status, percentage, is_passing });

describe('buildReportsOverview', () => {
  it('handles empty input', () => {
    const r = buildReportsOverview([], [], []);
    expect(r.totals).toMatchObject({ exams: 0, submissions: 0, averagePercentage: null, passRate: null });
  });
  it('counts ungraded, draft, moderated and published separately; ignores in-progress', () => {
    const r = buildReportsOverview(
      [ex('1')],
      [at('1', 'a'), at('1', 'b'), at('1', 'c'), at('1', 'd'), at('1', 'e', 'in_progress')],
      [gr('1', 'a', 'published', 80, true), gr('1', 'b', 'draft', 40, false), gr('1', 'c', 'moderated', 60, true)],
    );
    const row = r.exams[0]!;
    expect(row).toMatchObject({ started: 5, submitted: 4, ungraded: 1, draft: 1, moderated: 1, published: 1, needsAction: 3 });
    expect(row.averagePercentage).toBe(60);
    expect(row.passRate).toBeCloseTo(66.7, 1);
  });
  it('sorts exams needing action first and weights totals by graded count', () => {
    const r = buildReportsOverview(
      [ex('1'), ex('2')],
      [at('1', 'a'), at('2', 'b'), at('2', 'c')],
      [gr('1', 'a', 'published', 100, true), gr('2', 'b', 'published', 50, false), gr('2', 'c', 'draft', 50, false)],
    );
    expect(r.exams[0]!.examId).toBe('2');
    expect(r.totals.averagePercentage).toBe(66.7);
  });
  it('filters by exam date range', () => {
    const r = buildReportsOverview([ex('1'), ex('2', { starts_at: '2026-09-01T00:00:00.000Z' })], [], [],
      { from: '2026-08-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' });
    expect(r.exams.map((e) => e.examId)).toEqual(['2']);
  });
  it('ignores grades for attempts not submitted (no phantom results)', () => {
    const r = buildReportsOverview([ex('1')], [at('1', 'a', 'in_progress')], [gr('1', 'a', 'draft', 90, true)]);
    expect(r.exams[0]!.averagePercentage).toBeNull();
  });
  it('exports blank for missing averages', () => {
    const r = buildReportsOverview([ex('1')], [], []);
    expect(reportRowsToCsv(r.exams)[0]!.slice(-2)).toEqual(['', '']);
  });
});

describe('reportsInputSchema', () => {
  it('rejects inverted ranges', () => {
    expect(() => reportsInputSchema.parse({ institutionId: '11111111-1111-4111-8111-111111111111',
      from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' })).toThrow();
  });
});
