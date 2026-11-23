import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/app' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe('No-login mode UI & Supabase isolation', () => {
  it('renders permanent local-mode warning banner and Role Picker without creating any Supabase client', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_AUTH_MODE', 'none');

    const supabaseClientFactory = vi.fn(() => {
      throw new Error('Supabase client must never be initialized in no-login mode');
    });
    vi.doMock('@/integrations/supabase/client', () => ({
      get supabase() {
        return supabaseClientFactory();
      },
      isSupabaseBrowserConfigured: () => false,
    }));

    const { AuthProvider, useAuth } = await import('@/lib/auth');
    const { AUTH_MODE } = await import('@/lib/auth-mode');
    const { NoLoginRolePicker } = await import('@/components/app/no-login-workspace');
    const { dataRepository } = await import('@/lib/data-repository');

    expect(AUTH_MODE).toBe('none');

    function Probe() {
      const { user, activeInstitutionId } = useAuth();
      return (
        <div>
          <span data-testid="local-user">{user?.id ?? 'none'}</span>
          <span data-testid="local-inst">{activeInstitutionId ?? 'none'}</span>
          <NoLoginRolePicker />
        </div>
      );
    }

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText('Local mode: no login. Data stays in this browser only. Not for real examinations.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose a role workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Institution Admin/i })).toBeInTheDocument();
    const teacherBtn = screen.getByRole('button', { name: /Open Teacher \/ Examiner/i });
    expect(teacherBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Student/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Invigilator/i })).toBeInTheDocument();

    expect(screen.getByTestId('local-user').textContent).toBe('none');
    fireEvent.click(teacherBtn);

    expect(screen.getByTestId('local-user').textContent).not.toBe('none');
    expect(screen.getByTestId('local-inst').textContent).not.toBe('none');
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/app/teacher' });

    const ws = await dataRepository.getInstitutionWorkspace({
      data: { institutionId: screen.getByTestId('local-inst').textContent || 'inst-sample' },
      headers: {},
    });
    expect(ws.institution.name.length).toBeGreaterThan(0);
    expect(supabaseClientFactory).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
