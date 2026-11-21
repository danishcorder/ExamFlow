import { describe, expect, it } from 'vitest';
import { DEMO_QUESTIONS, formatClock, scoreDemoExam } from '@/lib/demo-ict-exam';

describe('demo ICT exam', () => {
  it('has well-formed questions', () => {
    expect(DEMO_QUESTIONS).toHaveLength(10);
    for (const q of DEMO_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
    expect(new Set(DEMO_QUESTIONS.map((q) => q.id)).size).toBe(10);
  });
  it('scores all correct, all wrong and blank', () => {
    const all = DEMO_QUESTIONS.map((q) => q.correctIndex);
    expect(scoreDemoExam(all)).toMatchObject({ correct: 10, percentage: 100, passed: true });
    const wrong = DEMO_QUESTIONS.map((q) => (q.correctIndex + 1) % q.options.length);
    expect(scoreDemoExam(wrong)).toMatchObject({ correct: 0, percentage: 0, passed: false, attempted: 10 });
    expect(scoreDemoExam(DEMO_QUESTIONS.map(() => null))).toMatchObject({ attempted: 0, marks: 0, passed: false });
  });
  it('passes exactly at 50%', () => {
    const half = DEMO_QUESTIONS.map((q, i) => (i < 5 ? q.correctIndex : null));
    expect(scoreDemoExam(half)).toMatchObject({ percentage: 50, passed: true });
  });
  it('formats the clock', () => {
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(59.9)).toBe('00:59');
    expect(formatClock(-5)).toBe('00:00');
  });
});
