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
