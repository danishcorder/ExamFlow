import { describe, expect, it } from 'vitest';
import { DEMO_REPORTS } from '@/lib/demo-workspace-data';

describe('demo workspace data', () => {
  it('is internally consistent', () => {
    expect(DEMO_REPORTS.exams).toHaveLength(4);
    for (const r of DEMO_REPORTS.exams) {
      expect(r.ungraded + r.draft + r.moderated + r.published).toBe(r.submitted);
      expect(r.needsAction).toBe(r.ungraded + r.draft + r.moderated);
    }
    expect(DEMO_REPORTS.totals.submissions).toBe(DEMO_REPORTS.exams.reduce((n, r) => n + r.submitted, 0));
  });
  it('has work that needs action and some finished exams', () => {
    expect(DEMO_REPORTS.totals.needsAction).toBeGreaterThan(0);
    expect(DEMO_REPORTS.exams.some((r) => r.needsAction === 0 && r.submitted > 0)).toBe(true);
    expect(DEMO_REPORTS.totals.passRate).not.toBeNull();
  });
});
