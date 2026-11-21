import { describe, expect, it } from 'vitest';
import { buildAuthHeaders } from '@/lib/attach-supabase-auth';

describe('buildAuthHeaders', () => {
  it('returns a bearer header when a session exists', async () => {
    const h = await buildAuthHeaders(async () => ({ data: { session: { access_token: 'a.b.c' } } }));
    expect(h).toEqual({ Authorization: 'Bearer a.b.c' });
  });
  it('returns no header when signed out', async () => {
    expect(await buildAuthHeaders(async () => ({ data: { session: null } }))).toEqual({});
  });
  it('never throws if session lookup fails', async () => {
    expect(await buildAuthHeaders(async () => { throw new Error('boom'); })).toEqual({});
  });
});
