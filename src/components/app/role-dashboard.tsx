import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  MailPlus,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from './page-header';
import { StatCard } from './stat-card';
import { ErrorState, LoadingState } from './states';
import { StatusPill } from './status-pill';
import { RoleGuard } from './role-guard';
import { useAuth } from '@/lib/auth';
import { getInstitutionWorkspaceFn } from '@/lib/workspace.functions';
import { getReportsOverviewFn } from '@/lib/reports.functions';
import { INSTITUTION_ROLE_LABELS, type RoleKey } from '@/lib/roles';

const QUICK_ACTIONS = [
  { to: '/app/exams', label: 'Create or schedule an exam', icon: FileText },
  { to: '/app/students', label: 'Import students (CSV)', icon: GraduationCap },
  { to: '/app/members', label: 'Invite teachers & staff', icon: MailPlus },
  { to: '/app/question-bank', label: 'Build the question bank', icon: BookOpen },
] as const;

type Attention = { key: string; text: string; to: string; cta: string };

export function RoleDashboard({ role }: { role: Exclude<RoleKey, 'super-admin'> }) {
  const { user, activeInstitutionId, activeMembership, authHeaders } = useAuth();
  const enabled = Boolean(user && activeInstitutionId);

  const workspaceQuery = useQuery({
    queryKey: ['institution-workspace', activeInstitutionId, user?.id],
    enabled,
    queryFn: async () => {
      if (!activeInstitutionId) throw new Error('No active institution');
      return getInstitutionWorkspaceFn({ data: { institutionId: activeInstitutionId }, headers: authHeaders() });
    },
  });

  const reportsQuery = useQuery({
    queryKey: ['reports-overview', activeInstitutionId, user?.id, '', ''],
    enabled,
    queryFn: async () => {
      if (!activeInstitutionId) throw new Error('No active institution');
      return getReportsOverviewFn({ data: { institutionId: activeInstitutionId }, headers: authHeaders() });
    },
  });

  const data = workspaceQuery.data;
  const reports = reportsQuery.data;
  const institutionName = activeMembership?.institution.name;

  const activeMembers = data?.members.filter((m) => m.status === 'active').length ?? 0;
  const pendingInvites = data?.invitations.filter((i) => i.status === 'pending').length ?? 0;

  const attention: Attention[] = [];
  if (reports && reports.totals.needsAction > 0) {
    attention.push({
      key: 'grading',
      text: `${reports.totals.needsAction} student attempt${reports.totals.needsAction === 1 ? '' : 's'} waiting for grading or publication`,
      to: '/app/grading-queue',
      cta: 'Open grading queue',
    });
  }
  if (pendingInvites > 0) {
    attention.push({
      key: 'invites',
      text: `${pendingInvites} invitation${pendingInvites === 1 ? '' : 's'} not yet accepted`,
      to: '/app/members',
      cta: 'Review invitations',
    });
  }

  return (
    <RoleGuard requiredRole={role}>
      <PageHeader
        title={institutionName ? `${institutionName} — overview` : 'Institution overview'}
        description="Your exams, people and what needs attention today."
        actions={
          <Button asChild>
            <Link to="/app/exams"><FileText className="h-4 w-4" /> New exam</Link>
          </Button>
        }
      />

      {workspaceQuery.isLoading || reportsQuery.isLoading ? (
        <LoadingState label="Loading your institution…" />
      ) : workspaceQuery.error || reportsQuery.error ? (
        <ErrorState
          title="Could not load the overview"
          description={(workspaceQuery.error ?? reportsQuery.error) instanceof Error
            ? ((workspaceQuery.error ?? reportsQuery.error) as Error).message
            : 'Something went wrong while loading your institution.'}
          onRetry={() => { void workspaceQuery.refetch(); void reportsQuery.refetch(); }}
        />
      ) : (
        <div className="space-y-6">
          {attention.length > 0 ? (
            <section aria-label="Needs your attention" className="rounded-xl border border-gold/50 bg-gold/10 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="h-4 w-4 text-gold-dark" aria-hidden /> Needs your attention
              </h2>
              <ul className="mt-3 space-y-2">
                {attention.map((a) => (
                  <li key={a.key} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>{a.text}</span>
                    <Button asChild size="sm" variant="outline" className="self-start bg-card sm:w-48 sm:justify-between">
                      <Link to={a.to}>{a.cta} <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              Nothing needs your attention right now.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Active members" value={String(activeMembers)} icon={Users} hint={`${data?.members.length ?? 0} records`} />
            <StatCard label="Exams run" value={String(reports?.totals.exams ?? 0)} icon={FileText} hint="published or closed" />
            <StatCard label="Submissions" value={String(reports?.totals.submissions ?? 0)} icon={ClipboardCheck} hint={`${reports?.totals.graded ?? 0} graded`} />
            <StatCard label="Pass rate" value={reports?.totals.passRate == null ? '—' : `${reports.totals.passRate}%`} icon={Trophy} hint="across graded work" />
          </div>

          <section aria-label="Quick actions">
            <h2 className="mb-3 text-sm font-semibold">Quick actions</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_ACTIONS.map((a) => (
                <li key={a.to}>
                  <Link to={a.to} className="flex h-full items-center gap-3 rounded-xl border bg-card p-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    <a.icon className="h-5 w-5 shrink-0 text-gold-dark" aria-hidden />
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Recent exams</CardTitle>
                <CardDescription>Most urgent first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(reports?.exams ?? []).slice(0, 5).map((e) => (
                  <div key={e.examId} className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.submitted} submitted · {e.passRate == null ? 'no results yet' : `${e.passRate}% pass`}
                      </p>
                    </div>
                    {e.submitted === 0 ? <StatusPill>No submissions</StatusPill>
                      : e.needsAction > 0 ? <StatusPill tone="warning">{e.needsAction} to do</StatusPill>
                      : <StatusPill tone="success">Done</StatusPill>}
                  </div>
                ))}
                {(reports?.exams.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No published exams yet. Create one to see results here.</p>
                )}
                <Button asChild variant="ghost" size="sm" className="px-0">
                  <Link to="/app/reports">Full report <ArrowRight className="h-3.5 w-3.5" /></Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">People</CardTitle>
                <CardDescription>Latest members of this institution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.members ?? []).slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.profile?.full_name || m.profile?.email || 'Member'}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.profile?.email ?? '—'}</p>
                    </div>
                    <StatusPill tone={m.status === 'active' ? 'success' : 'warning'}>{INSTITUTION_ROLE_LABELS[m.role]}{m.status !== 'active' ? ` · ${m.status}` : ''}</StatusPill>
                  </div>
                ))}
                {(data?.members.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No members yet. Invite your first teacher.</p>}
                <div className="flex gap-2">
                  <Button asChild variant="ghost" size="sm" className="px-0"><Link to="/app/members">Manage members <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
                  <Button asChild variant="ghost" size="sm"><Link to="/app/audit-log">Audit log</Link></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
