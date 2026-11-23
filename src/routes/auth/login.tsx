import { useEffect, useState, type FormEvent } from 'react';
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard, FieldError } from '@/components/app/auth-layout';
import { ErrorState } from '@/components/app/states';
import { AUTH_MODE } from '@/lib/auth-mode';
import { signInWithUsernameFn } from '@/lib/provisioning.functions';

export const Route = createFileRoute('/auth/login')({
  head: () => ({
    meta: [
      { title: 'Sign in — ExamFlow' },
      { name: 'description', content: 'Sign in to your ExamFlow account.' },
      { property: 'og:title', content: 'Sign in — ExamFlow' },
      { property: 'og:description', content: 'Sign in to your ExamFlow account.' },
    ],
  }),
  component: Login,
});

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Enter your username')
    .max(32, 'Username must be 32 characters or fewer'),
  password: z.string().min(1, 'Enter your password').max(72),
});

function Login() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(true);

  useEffect(() => {
    if (AUTH_MODE === 'none') return;
    let cancelled = false;
    void import('@/integrations/supabase/client').then(({ isSupabaseConfigured }) => {
      if (!cancelled) setSupabaseReady(isSupabaseConfigured);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (AUTH_MODE === 'none') {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const { isSupabaseConfigured, supabase } = await import('@/integrations/supabase/client');
    if (!isSupabaseConfigured) {
      setSupabaseReady(false);
      setError('Sign-in is unavailable until the deployment administrator connects a Supabase project.');
      return;
    }
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? ''), issue.message])),
      );
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const result = await signInWithUsernameFn({ data: parsed.data });
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (sessionError) throw new Error('Could not start your session. Please try again.');
      toast.success('Welcome back');
      const destination = result.mustChangePassword ? '/auth/change-password' : result.redirectTo;
      void navigate({ href: destination });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Check your username and password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      description="Use the username and password provided by your administrator."
      footer={
        <span className="text-sm text-muted-foreground">
          Need an account? Ask your Super Admin or Institution Admin to create one.
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!supabaseReady && (
          <ErrorState
            title="Sign-in unavailable"
            description="This deployment is missing its public Supabase settings. Ask the deployment administrator to finish setup."
          />
        )}
        {error && <ErrorState title="Could not sign in" description={error} />}
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1.5"
          />
          <FieldError msg={errors['username']} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/forgot-password" className="text-xs underline underline-offset-4">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="mt-1.5"
          />
          <FieldError msg={errors['password']} />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !supabaseReady}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
