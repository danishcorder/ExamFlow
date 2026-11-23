import { useState, type FormEvent } from 'react';
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard, FieldError } from '@/components/app/auth-layout';
import { ErrorState } from '@/components/app/states';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/auth-mode';
import { changeOwnPasswordFn } from '@/lib/provisioning.functions';
import { getWorkspaceBootstrapFn } from '@/lib/workspace.functions';
import { dbRoleToRoleKey, ROLES } from '@/lib/roles';

export const Route = createFileRoute('/auth/change-password')({
  head: () => ({
    meta: [
      { title: 'Change temporary password — ExamFlow' },
      { name: 'description', content: 'Choose a new password before entering your workspace.' },
    ],
  }),
  component: ChangePasswordPage,
});

const schema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters').max(72),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, loading, refreshWorkspace } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (AUTH_MODE === 'none') {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const parsed = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? ''), issue.message])),
      );
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await changeOwnPasswordFn({ data: { password: parsed.data.password } });
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !sessionData.session) {
        throw new Error('Your password was changed, but your session could not be refreshed. Sign in again with your new password.');
      }
      await refreshWorkspace();
      const bootstrap = await getWorkspaceBootstrapFn({
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      const membership = bootstrap.memberships[0];
      const destination = membership
        ? ROLES[dbRoleToRoleKey(membership.role)].path
        : bootstrap.isSuperAdmin
          ? ROLES['super-admin'].path
          : '/app/onboarding';
      void navigate({ href: destination });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!user) {
    return (
      <AuthCard title="Sign in required" description="Sign in with the temporary password provided by your administrator.">
        <Button asChild className="w-full">
          <Link to="/auth/login">Go to sign in</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="For account security, change the temporary password before continuing."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <ErrorState title="Could not update password" description={error} />}
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            className="mt-1.5"
          />
          <FieldError msg={errors['password']} />
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="mt-1.5"
          />
          <FieldError msg={errors['confirmPassword']} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}
