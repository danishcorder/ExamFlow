export const OAUTH_SCOPE_LABELS: Record<string, { title: string; description: string }> = {
  openid: {
    title: 'OpenID Identity',
    description: 'Verify your unique user identifier across applications.',
  },
  email: {
    title: 'Email Address',
    description: 'Read your verified email address.',
  },
  profile: {
    title: 'Profile Information',
    description: 'Read your basic profile details such as name.',
  },
  phone: {
    title: 'Phone Number',
    description: 'Read your verified phone number if present.',
  },
  offline_access: {
    title: 'Offline Access',
    description: 'Maintain access via refresh tokens while you are signed out.',
  },
};

export function safeAuthRedirectPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.startsWith('//')) return null;
  if (raw.startsWith('/app') || raw.startsWith('/oauth/consent')) return raw;
  return null;
}

export function parseOAuthScopes(scopeString: string | null | undefined): string[] {
  if (!scopeString) return [];
  return scopeString
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatOAuthServerError(
  err:
    | {
        message?: string | undefined;
        code?: string | undefined;
        status?: number | undefined;
      }
    | null
    | undefined,
): string {
  if (!err) return 'Unable to load OAuth authorization request.';
  const msg = err.message ?? '';
  if (
    err.code === 'feature_disabled' ||
    msg.toLowerCase().includes('oauth server is disabled')
  ) {
    return 'Supabase OAuth 2.1 Server is currently disabled on project cmweagrpneprbsoiuaek. Enable "OAuth Server" under Authentication → OAuth Server in your Supabase Dashboard.';
  }
  return msg || 'Unable to process OAuth authorization request.';
}
