import { describe, expect, it } from 'vitest';
import { cleanEnvValue, findBadSupabaseEnv, isValidHeaderToken } from '@/lib/supabase-env';

describe('cleanEnvValue', () => {
  it('trims whitespace, newlines and wrapping quotes', () => {
    expect(cleanEnvValue('  abc\n')).toBe('abc');
    expect(cleanEnvValue('"abc"')).toBe('abc');
    expect(cleanEnvValue("'abc'\r\n")).toBe('abc');
    expect(cleanEnvValue('')).toBeUndefined();
    expect(cleanEnvValue('   ')).toBeUndefined();
    expect(cleanEnvValue(undefined)).toBeUndefined();
  });
});

describe('findBadSupabaseEnv', () => {
  it('accepts a clean URL and key', () => {
    expect(findBadSupabaseEnv('https://abc.supabase.co', 'sb_publishable_AbC123-_')).toEqual([]);
  });
  it('flags missing, malformed and header-unsafe values', () => {
    expect(findBadSupabaseEnv(undefined, undefined)).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
    expect(findBadSupabaseEnv('abc.supabase.co', 'ok')).toEqual(['VITE_SUPABASE_URL']);
    expect(isValidHeaderToken('has space')).toBe(false);
    expect(isValidHeaderToken('keyé')).toBe(false);
    expect(isValidHeaderToken('line\nbreak')).toBe(false);
    expect(findBadSupabaseEnv('https://x.supabase.co', 'two words')).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY']);
  });
});
