import { describe, expect, it } from 'vitest';
import {
  formatOAuthServerError,
  parseOAuthScopes,
  safeAuthRedirectPath,
} from '@/lib/oauth-consent';

describe('Supabase OAuth 2.1 Server helpers', () => {
  it('validates internal auth redirect paths safely while allowing /oauth/consent', () => {
    expect(safeAuthRedirectPath('/app/teacher')).toBe('/app/teacher');
    expect(safeAuthRedirectPath('/oauth/consent?authorization_id=req-123')).toBe(
      '/oauth/consent?authorization_id=req-123',
    );
    expect(safeAuthRedirectPath('//evil.example/steal')).toBeNull();
    expect(safeAuthRedirectPath('https://evil.example/steal')).toBeNull();
    expect(safeAuthRedirectPath('/unrelated')).toBeNull();
    expect(safeAuthRedirectPath(undefined)).toBeNull();
  });

  it('parses space-separated OAuth scopes', () => {
    expect(parseOAuthScopes('openid  email   profile ')).toEqual(['openid', 'email', 'profile']);
    expect(parseOAuthScopes('')).toEqual([]);
    expect(parseOAuthScopes(undefined)).toEqual([]);
  });

  it('explains when Supabase OAuth 2.1 Server is disabled', () => {
    expect(
      formatOAuthServerError({
        code: 'feature_disabled',
        message: 'OAuth server is disabled',
      }),
    ).toMatch(/Enable "OAuth Server"/);

    expect(formatOAuthServerError({ message: 'Authorization expired' })).toBe(
      'Authorization expired',
    );
  });
});
