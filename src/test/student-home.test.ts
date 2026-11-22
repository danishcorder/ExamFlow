import { describe, expect, it } from 'vitest';
import { describeNextStep, formatRelativeDuration } from '@/lib/student-home.shared';

const now = '2026-11-22T10:00:00.000Z';
const ex = (over: Record<string, unknown>) => ({
  examId: 'e1', title: 'Physics', bucket: 'upcoming', startsAt: '2026-11-24T10:00:00.000Z',
  endsAt: '2026-11-24T12:00:00.000Z', durationMinutes: 60, attempt: null, ...over,
}) as never;

describe('formatRelativeDuration', () => {
  it('formats ranges', () => {
    expect(formatRelativeDuration(30_000)).toBe('under a minute');
    expect(formatRelativeDuration(45 * 60_000)).toBe('45 min');
    expect(formatRelativeDuration(90 * 60_000)).toBe('1 h 30 min');
    expect(formatRelativeDuration(51 * 3_600_000)).toBe('2 days 3 h');
    expect(formatRelativeDuration(-5)).toBe('under a minute');
  });
});

describe('describeNextStep', () => {
  it('prefers resuming an in-progress attempt', () => {
    const r = describeNextStep({ serverNow: now, exams: [ex({ examId: 'a', bucket: 'active', attempt: { status: 'in_progress', remainingSeconds: 1200 } }), ex({ examId: 'b', bucket: 'active' })] });
    expect(r).toMatchObject({ kind: 'resume', examId: 'a' });
    expect(r.detail).toContain('20 min');
  });
  it('offers the soonest-closing open exam', () => {
    const r = describeNextStep({ serverNow: now, exams: [ex({ examId: 'x', bucket: 'active', endsAt: '2026-11-22T14:00:00.000Z' }), ex({ examId: 'y', bucket: 'active', endsAt: '2026-11-22T11:00:00.000Z' })] });
    expect(r).toMatchObject({ kind: 'start', examId: 'y' });
  });
  it('falls back to the earliest upcoming exam, then idle', () => {
    expect(describeNextStep({ serverNow: now, exams: [ex({ examId: 'late', startsAt: '2026-11-30T10:00:00.000Z' }), ex({ examId: 'soon' })] }).headline).toContain('Physics');
    expect(describeNextStep({ serverNow: now, exams: [] }).kind).toBe('idle');
  });
});
