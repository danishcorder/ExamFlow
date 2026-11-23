import { describe, expect, it } from 'vitest';
import { resolveAuthMode } from '../lib/auth-mode';

describe('resolveAuthMode', () => {
  it('defaults to the existing Supabase mode', () => {
    expect(resolveAuthMode(undefined)).toBe('supabase');
    expect(resolveAuthMode('')).toBe('supabase');
    expect(resolveAuthMode('unexpected')).toBe('supabase');
  });

  it('enables local mode only for the exact value none', () => {
    expect(resolveAuthMode('none')).toBe('none');
    expect(resolveAuthMode('NONE')).toBe('supabase');
    expect(resolveAuthMode(' none ')).toBe('supabase');
  });
});
