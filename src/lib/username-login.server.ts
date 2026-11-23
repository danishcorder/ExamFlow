import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { cleanEnvValue, isInvalidApiKeyError } from '@/lib/supabase-env';

const admin: any = supabaseAdmin;
const INVALID_LOGIN = 'Invalid username or password';

function authFetch(apiKey: string): typeof fetch {
  const isNewKey = apiKey.startsWith('sb_publishable_') || apiKey.startsWith('sb_secret_');
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (isNewKey && headers.get('Authorization') === `Bearer ${apiKey}`) {
      headers.delete('Authorization');
    }
    headers.set('apikey', apiKey);
    return fetch(input, { ...init, headers });
  };
}

function createPasswordAuthClient() {
  const url = cleanEnvValue(process.env['SUPABASE_URL']) ?? cleanEnvValue(process.env['VITE_SUPABASE_URL']);
  const key =
    cleanEnvValue(process.env['SUPABASE_PUBLISHABLE_KEY']) ?? cleanEnvValue(process.env['VITE_SUPABASE_PUBLISHABLE_KEY']);
  if (!url || !key) throw new Error('Supabase authentication is not configured');
  return createClient(url, key, {
    global: { fetch: authFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not verify workspace access');
  return Boolean(data);
}

export async function signInWithUsername(input: {
  username: string;
  password: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  redirectTo: string;
}> {
  const username = input.username.trim().toLowerCase();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,email,must_change_password')
    .eq('username', username)
    .maybeSingle();
  if (profileError && isInvalidApiKeyError(profileError)) {
    // Misconfiguration, not a wrong password: say so (no secrets are included).
    console.error('[sign-in] Supabase rejected SUPABASE_SERVICE_ROLE_KEY:', profileError.message);
    throw new Error(
      'Sign-in is unavailable: the server’s Supabase secret key (SUPABASE_SERVICE_ROLE_KEY) is invalid. Ask the administrator to re-copy it in Vercel and redeploy.',
    );
  }
  if (profileError || !profile?.email) throw new Error(INVALID_LOGIN);

  const auth = createPasswordAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({
    email: profile.email,
    password: input.password,
  });
  if (error || !data.session || !data.user) throw new Error(INVALID_LOGIN);

  let redirectTo = '/app/onboarding';
  if (await isPlatformAdmin(data.user.id)) {
    redirectTo = '/app/super-admin';
  } else {
    const { data: memberships, error: membershipsError } = await admin
      .from('institution_memberships')
      .select('institution_id,role,created_at')
      .eq('user_id', data.user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (membershipsError) throw new Error('Could not verify workspace access');

    const membershipRows = memberships ?? [];
    if (membershipRows.length) {
      const { data: institutions, error: institutionsError } = await admin
        .from('institutions')
        .select('id')
        .in('id', membershipRows.map((item: any) => item.institution_id))
        .eq('status', 'active');
      if (institutionsError) throw new Error('Could not verify workspace access');
      const activeIds = new Set((institutions ?? []).map((institution: any) => institution.id));
      const membership = membershipRows.find((item: any) => activeIds.has(item.institution_id));
      if (membership) {
        const paths: Record<string, string> = {
          institution_admin: '/app/institution',
          teacher: '/app/teacher',
          student: '/app/student',
          invigilator: '/app/invigilator',
        };
        redirectTo = paths[membership.role] ?? redirectTo;
      }
    }
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    mustChangePassword: Boolean(profile.must_change_password),
    redirectTo,
  };
}
