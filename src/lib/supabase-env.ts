/**
 * Browser-safe cleaning of Supabase env values pasted into hosting dashboards.
 * A trailing newline, surrounding quotes or a stray non-ASCII character in the publishable key
 * makes `fetch` throw "Invalid value" when the key is sent as a request header.
 */
export function cleanEnvValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/^(["'`])(.*)\1$/s, '$2').trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Header values must be visible ASCII (no whitespace/control characters). */
export function isValidHeaderToken(value: string | undefined): value is string {
  return typeof value === 'string' && /^[\x21-\x7E]+$/.test(value);
}

export function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Returns the names of variables that are missing or malformed. */
export function findBadSupabaseEnv(url: string | undefined, key: string | undefined): string[] {
  return [
    ...(isValidHttpUrl(url) ? [] : ['VITE_SUPABASE_URL']),
    ...(isValidHeaderToken(key) ? [] : ['VITE_SUPABASE_PUBLISHABLE_KEY']),
  ];
}

export type EnvProblem = { name: string; reason: 'not set or empty' | 'contains spaces or unsupported characters' | 'is not a valid https URL' };

/** Explains WHY each variable is unusable, without ever echoing its value. */
export function describeSupabaseEnvProblems(rawUrl: unknown, rawKey: unknown): EnvProblem[] {
  const out: EnvProblem[] = [];
  const url = cleanEnvValue(rawUrl);
  const key = cleanEnvValue(rawKey);
  if (!url) out.push({ name: 'VITE_SUPABASE_URL', reason: 'not set or empty' });
  else if (!isValidHttpUrl(url)) out.push({ name: 'VITE_SUPABASE_URL', reason: 'is not a valid https URL' });
  if (!key) out.push({ name: 'VITE_SUPABASE_PUBLISHABLE_KEY', reason: 'not set or empty' });
  else if (!isValidHeaderToken(key)) out.push({ name: 'VITE_SUPABASE_PUBLISHABLE_KEY', reason: 'contains spaces or unsupported characters' });
  return out;
}

/** True when PostgREST/Auth rejected the API key itself (misconfiguration), not the user's credentials. */
export function isInvalidApiKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number; code?: string; message?: string; hint?: string };
  const text = `${e.message ?? ''} ${e.hint ?? ''} ${e.code ?? ''}`.toLowerCase();
  return e.status === 401 || e.status === 403 || /invalid api key|unauthorized_invalid_api_key|jwt|apikey/.test(text);
}
