import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
  Bell,
  Building2,
  LogIn,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Brand } from './brand';
import { NoLoginBanner, NoLoginLocalControls } from './no-login-workspace';
import { ErrorState, LoadingState } from './states';
import {
  dbRoleToRoleKey,
  ROLES,
  WORKSPACE_UTILITY_NAV,
  type NavItem,
  type RoleKey,
} from '@/lib/roles';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/auth-mode';
import { cn } from '@/lib/utils';

const SUPER_ADMIN_OPTION = '__platform_super_admin__';
const HIDDEN_LOCAL_PATHS = new Set(['/app/members', '/app/accounts', '/app/invitations', '/app/settings', '/app/super-admin', '/app/onboarding']);

function useEffectiveRole(): RoleKey | null {
  const { pathname } = useLocation();
  const { workspace, activeMembership, localRole } = useAuth();
  if (AUTH_MODE === 'none') {
    return localRole;
  }
  if (pathname.startsWith('/app/super-admin') && workspace?.isSuperAdmin) {
    return 'super-admin';
  }
  if (activeMembership) {
    return dbRoleToRoleKey(activeMembership.role);
  }
  if (workspace?.isSuperAdmin) {
    return 'super-admin';
  }
  return null;
}

function NavLink({
  item,
  badge,
  onNavigate,
}: {
  item: NavItem;
  badge?: number | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const { pathname } = useLocation();
  const Icon = item.icon;
  const base = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors';
  if (item.soon || !item.to) {
    return (
      <div
        className={cn(base, 'cursor-not-allowed text-sidebar-foreground/45')}
        title="Coming in a later phase"
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          Soon
        </span>
      </div>
    );
  }
  const active = pathname === item.to;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        base,
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}

function SidebarBody({
  role,
  pendingInviteCount,
  institutionName,
  onNavigate,
}: {
  role: RoleKey | null;
  pendingInviteCount: number;
  institutionName: string | null;
  onNavigate?: (() => void) | undefined;
}) {
  const isLocal = AUTH_MODE === 'none';
  const rawNavItems = role ? ROLES[role].nav : [];
  const navItems = isLocal
    ? rawNavItems.filter((item) => !item.to || !HIDDEN_LOCAL_PATHS.has(item.to))
    : rawNavItems;
  const headerLabel =
    role === 'super-admin'
      ? ROLES['super-admin'].label
      : institutionName
        ? `${institutionName} · ${role ? ROLES[role].short : ''}`
        : isLocal
          ? 'Local mode'
          : 'Onboarding';

  return (
    <div className="workspace-sidebar flex h-full flex-col bg-sidebar">
      <div className="flex min-h-16 shrink-0 items-center px-5 py-3">
        <Brand inverted />
      </div>
      <div className="shrink-0 truncate px-5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
        {headerLabel}
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
        {navItems.map((i) => (
          <NavLink key={i.label} item={i} onNavigate={onNavigate} />
        ))}
        {navItems.length === 0 && !isLocal && (
          <NavLink
            item={{ label: 'Set up institution', icon: PlusCircle, to: '/app/onboarding' }}
            onNavigate={onNavigate}
          />
        )}
      </nav>
      {!isLocal && (
        <div className="shrink-0 space-y-1 border-t border-sidebar-border px-3 py-3">
          {WORKSPACE_UTILITY_NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              badge={item.to === '/app/invitations' ? pendingInviteCount : undefined}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 border-t border-sidebar-border px-5 py-3 text-[10px] font-semibold uppercase tracking-[.12em] text-sidebar-foreground/50">
        <ShieldCheck className="h-3.5 w-3.5 text-gold" /> {isLocal ? 'Local browser workspace' : 'Secure workspace'}
      </div>
    </div>
  );
}

function ProfileMenu() {
  const { user, workspace, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />;
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link to="/auth/login">
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
      </Button>
    );
  }

  const name =
    workspace?.profile.full_name ||
    (user.user_metadata?.['full_name'] as string | undefined) ||
    user.email ||
    'Account';
  const initials = name
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open profile menu"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate">{name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/settings">
            <User className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/invitations">
            <Building2 className="h-4 w-4" />
            Invitations
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/settings">
            <Settings className="h-4 w-4" />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            toast.success('Signed out');
            navigate({ to: '/' });
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const role = useEffectiveRole();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    user,
    loading,
    workspace,
    workspaceLoading,
    workspaceError,
    activeInstitutionId,
    activeMembership,
    setActiveInstitutionId,
    refreshWorkspace,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const isLocal = AUTH_MODE === 'none';

  const pendingInviteCount = workspace?.pendingInvitations.length ?? 0;
  const memberships = workspace?.memberships ?? [];
  const isSuperAdmin = workspace?.isSuperAdmin ?? false;
  const activeNavItem = role
    ? ROLES[role].nav.find((item) => item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`)))
    : undefined;
  const pageLabel = pathname.startsWith('/app/exam-session')
    ? 'Examination session'
    : activeNavItem?.label ?? (isSuperAdmin ? 'Platform overview' : isLocal ? 'Local workspace' : 'Institution setup');

  const switcherValue =
    pathname.startsWith('/app/super-admin') && isSuperAdmin
      ? SUPER_ADMIN_OPTION
      : activeInstitutionId ?? '';

  function handleWorkspaceSwitch(value: string) {
    if (value === SUPER_ADMIN_OPTION) {
      if (isSuperAdmin) {
        void navigate({ to: '/app/super-admin' });
      }
      return;
    }
    const target = memberships.find((m) => m.institution_id === value);
    if (!target) return;
    setActiveInstitutionId(target.institution_id);
    const targetRole = dbRoleToRoleKey(target.role);
    void navigate({ to: ROLES[targetRole].path });
  }

  const currentSearch =
    typeof window !== 'undefined' ? window.location.search : '';
  const redirectTarget = `${pathname}${currentSearch}`;

  return (
    <div className="workspace-canvas flex min-h-screen flex-col">
      {isLocal && (
        <div className="sticky top-0 z-40">
          <NoLoginBanner />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            'fixed bottom-0 left-0 z-30 hidden w-64 lg:block xl:w-[272px]',
            isLocal ? 'top-[33px] sm:top-[37px]' : 'top-0',
          )}
        >
          <SidebarBody
            role={role}
            pendingInviteCount={pendingInviteCount}
            institutionName={activeMembership?.institution.name ?? null}
          />
        </aside>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="workspace-sidebar w-64 border-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody
              role={role}
              pendingInviteCount={pendingInviteCount}
              institutionName={activeMembership?.institution.name ?? null}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1 lg:pl-64 xl:pl-[272px]">
          <header
            className={cn(
              'workspace-topbar sticky z-20 flex min-h-16 flex-wrap items-center gap-3 bg-background/95 px-4 py-2 backdrop-blur sm:px-6',
              isLocal ? 'top-[33px] sm:top-[37px]' : 'top-0',
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
              <span className="text-xs font-semibold text-muted-foreground">Workspace</span>
              <span className="h-4 w-px bg-border" />
              <span className="truncate text-sm font-semibold text-navy">{pageLabel}</span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {isLocal ? (
                <NoLoginLocalControls />
              ) : (
                <>
                  {user && (memberships.length > 0 || isSuperAdmin) && (
                    <Select value={switcherValue} onValueChange={handleWorkspaceSwitch}>
                      <SelectTrigger className="h-9 w-[230px]" aria-label="Switch institution workspace">
                        <SelectValue placeholder="Select institution" />
                      </SelectTrigger>
                      <SelectContent>
                        {isSuperAdmin && (
                          <SelectItem value={SUPER_ADMIN_OPTION}>
                            <span className="inline-flex items-center gap-1.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                              Platform Super Admin
                            </span>
                          </SelectItem>
                        )}
                        {memberships.map((m) => (
                          <SelectItem key={m.institution_id} value={m.institution_id}>
                            {m.institution.name} ({ROLES[dbRoleToRoleKey(m.role)].short})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl border border-transparent hover:border-gold/35 hover:bg-gold/10"
                    aria-label="Invitations and notifications"
                    onClick={() => {
                      if (pendingInviteCount > 0) {
                        void navigate({ to: '/app/invitations' });
                      } else {
                        toast('No pending invitations', {
                          description: 'System notifications arrive in a later phase.',
                        });
                      }
                    }}
                  >
                    <Bell className="h-5 w-5" />
                  </Button>
                  <ProfileMenu />
                </>
              )}
            </div>
          </header>
          <main className="mx-auto max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-8 xl:p-10">
            {loading ? (
              <LoadingState label="Checking session…" />
            ) : !user && !isLocal ? (
              <Card className="shadow-none">
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <h2 className="font-display text-xl font-semibold">Sign in to continue</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Your session has ended or you are not signed in. Sign in to access your institution workspace.
                  </p>
                  <div className="mt-5 flex gap-2">
                    <Button asChild>
                      <Link to="/auth/login" search={{ redirect: redirectTarget }}>
                        Sign in
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/auth/register" search={{ redirect: redirectTarget }}>
                        Create account
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : workspaceError && !workspace && !workspaceLoading ? (
              <ErrorState
                title="Database connection unavailable"
                description={workspaceError}
                onRetry={() => {
                  void refreshWorkspace();
                }}
              />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
