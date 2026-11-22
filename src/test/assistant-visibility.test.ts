import { describe, expect, it } from 'vitest';
import { isAssistantHiddenOn } from '@/lib/assistant-visibility';

describe('isAssistantHiddenOn', () => {
  it('hides the assistant during live and sample exams', () => {
    expect(isAssistantHiddenOn('/app/exam-session/3f1c2b9e-0000-4000-8000-000000000000')).toBe(true);
    expect(isAssistantHiddenOn('/demo-exam')).toBe(true);
    expect(isAssistantHiddenOn('/demo-exam/')).toBe(true);
  });

  it('keeps the assistant on other pages', () => {
    expect(isAssistantHiddenOn('/')).toBe(false);
    expect(isAssistantHiddenOn('/app/student')).toBe(false);
    expect(isAssistantHiddenOn('/demo')).toBe(false);
    expect(isAssistantHiddenOn('/demo-examples')).toBe(false);
  });
});
