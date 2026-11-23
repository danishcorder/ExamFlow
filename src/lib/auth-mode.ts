export type AuthMode = 'supabase' | 'none';

/** Resolve the build-time auth mode. Unknown values fail closed to the existing auth flow. */
export function resolveAuthMode(value: string | undefined): AuthMode {
  return value === 'none' ? 'none' : 'supabase';
}

export const AUTH_MODE: AuthMode = resolveAuthMode((import.meta.env as Record<string, string | undefined>)['VITE_AUTH_MODE']);
export const isNoLoginMode = AUTH_MODE === 'none';
