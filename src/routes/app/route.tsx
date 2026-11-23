import { createFileRoute, Navigate, Outlet, useLocation } from '@tanstack/react-router';
import { AppShell } from '@/components/app/app-shell';
import { NoLoginRolePicker } from '@/components/app/no-login-workspace';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/auth-mode';
import { ROLES } from '@/lib/roles';

export const Route = createFileRoute('/app')({ component: AppRoute });

function AppRoute() {
  const { user, loading, localRole } = useAuth();
  const { pathname } = useLocation();

  if (AUTH_MODE === 'none') {
    if (!localRole) {
      return <NoLoginRolePicker />;
    }
    if (pathname === '/app' || pathname === '/app/') {
      return <Navigate to={ROLES[localRole].path} replace />;
    }
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  if (!loading && user?.user_metadata?.['must_change_password'] === true) {
    return <Navigate to="/auth/change-password" replace />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
