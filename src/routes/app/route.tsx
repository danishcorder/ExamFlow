import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/app/app-shell';
import { NoLoginWorkspace } from '@/components/app/no-login-workspace';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/auth-mode';

export const Route = createFileRoute('/app')({ component: AppRoute });

function AppRoute() {
  const { user, loading } = useAuth();
  if (AUTH_MODE === 'none') return <NoLoginWorkspace />;
  if (!loading && user?.user_metadata?.['must_change_password'] === true) {
    return <Navigate to="/auth/change-password" replace />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
