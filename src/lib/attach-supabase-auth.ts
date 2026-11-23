import { createMiddleware } from '@tanstack/react-start';

/**
 * Read the current session when a server function runs. This middleware is only
 * installed in Supabase mode; the client import is lazy so local mode creates no
 * Supabase client.
 */
export async function buildAuthHeaders(
  getSession: () => Promise<{ data: { session: { access_token: string } | null } }>,
): Promise<Record<string, string>> {
  try {
    const { data } = await getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const { supabase } = await import('@/integrations/supabase/client');
  const headers = await buildAuthHeaders(() => supabase.auth.getSession());
  return next({ headers });
});
