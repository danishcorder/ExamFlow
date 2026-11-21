import { createMiddleware } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';

/**
 * Global client middleware: attaches the *current* Supabase access token to every
 * server-function call. Reading the session at call time (instead of from a React
 * closure) avoids stale or missing tokens after refresh. Headers passed explicitly
 * by a caller still take precedence. Authorization is still verified server-side
 * by `requireSupabaseAuth`; this only transports the token.
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
  const headers = await buildAuthHeaders(() => supabase.auth.getSession());
  return next({ headers });
});
