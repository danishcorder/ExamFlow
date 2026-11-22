import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/app/app-shell';
import { useAuth } from '@/lib/auth';

export const Route = createFileRoute('/app')({ component: AppRoute });

function AppRoute() {
  const { user, loading } = useAuth();
  if (!loading && user?.user_metadata?.['must_change_password'] === true) {
    return <Navigate to="/auth/change-password" replace />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
