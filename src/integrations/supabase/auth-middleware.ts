import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get('Authorization') === `Bearer ${supabaseKey}`
    ) {
      headers.delete('Authorization');
    }
    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createAuthMiddleware(allowTemporaryPassword: boolean) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const SUPABASE_URL = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'];
    const SUPABASE_PUBLISHABLE_KEY =
      process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }

    const request = getRequest();
    const authHeader = request?.headers?.get('authorization');
    if (!authHeader) throw new Error('Unauthorized: No authorization header provided');
    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }

    const token = authHeader.slice('Bearer '.length);
    if (!token || token.split('.').length !== 3) throw new Error('Unauthorized: Invalid token');

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) throw new Error('Unauthorized: Invalid token');
    const userId = data.claims.sub;
    if (!userId) throw new Error('Unauthorized: No user ID found in token');

    if (!allowTemporaryPassword) {
      const statusClient = supabase as unknown as SupabaseClient<any>;
      const { data: profile, error: profileError } = await statusClient
        .from('profiles')
        .select('must_change_password')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) throw new Error('Could not verify account password status');
      if (profile?.must_change_password) {
        throw new Error('Change your temporary password before continuing');
      }
    }

    return next({
      context: {
        supabase,
        userId,
        claims: data.claims,
      },
    });
  });
}

export const requireSupabaseAuth = createAuthMiddleware(false);
export const requireSupabasePasswordChange = createAuthMiddleware(true);
