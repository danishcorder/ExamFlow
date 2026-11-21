import { describe, expect, it } from 'vitest';
import { chunk, computeExamAnalytics, fetchAllPages, SUPABASE_PAGE } from '@/lib/grading.analytics';

const base = { examId: 'e', examTitle: 'T' };

describe('computeExamAnalytics', () => {
  it('returns zeros for an empty dataset', () => {
    const r = computeExamAnalytics(base, [], [], []);
    expect(r).toMatchObject({ totalSubmissions: 0, averageScore: 0, highestScore: 0, lowestScore: 0, passRate: 0, failCount: 0 });
  });
  it('handles a lowest score above the old sentinel and all-zero scores', () => {
    const g = [
      { attempt_id: 'a', total_awarded_marks: '0', is_passing: false },
      { attempt_id: 'b', total_awarded_marks: '0', is_passing: false },
    ];
    const r = computeExamAnalytics(base, g, [], []);
    expect(r.lowestScore).toBe(0);
    expect(r.highestScore).toBe(0);
    expect(r.failCount).toBe(2);
  });
  it('computes pass rate, average and per-question success from graded max marks', () => {
    const grades = [
      { attempt_id: 'a', total_awarded_marks: 8, is_passing: true },
      { attempt_id: 'b', total_awarded_marks: 3, is_passing: false },
    ];
    const qg = [
      { question_id: 'q1', awarded_marks: 4, max_marks: 5, is_correct: true },
      { question_id: 'q1', awarded_marks: 0, max_marks: 5, is_correct: false },
    ];
    const r = computeExamAnalytics(base, grades, qg, [
      { id: 'q1', title: 'Q1', question_type: 'mcq_single' as never },
      { id: 'q2', title: 'Q2', question_type: 'mcq_single' as never, effective_marks: 2 },
    ]);
    expect(r.averageScore).toBe(5.5);
    expect(r.passRate).toBe(50);
    expect(r.questionStats[0]).toMatchObject({ maxMarks: 5, averageAwarded: 2, successRate: 40, correctCount: 1, attemptCount: 2 });
    expect(r.questionStats[1]).toMatchObject({ maxMarks: 2, attemptCount: 0, successRate: 0 });
  });
});

describe('fetchAllPages', () => {
  it('pages past the 1000-row cap', async () => {
    const total = SUPABASE_PAGE * 2 + 5;
    const rows = Array.from({ length: total }, (_, i) => i);
    const got = await fetchAllPages<number>(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(got).toHaveLength(total);
  });
  it('surfaces errors', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: { message: 'bad' } }))).rejects.toThrow('bad');
  });
});

describe('chunk', () => {
  it('splits evenly', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
