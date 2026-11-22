import { useEffect, useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Loader2, RotateCcw, UserPlus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/app/page-header';
import { RoleGuard } from '@/components/app/role-guard';
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states';
import { StatusPill } from '@/components/app/status-pill';
import { useAuth } from '@/lib/auth';
import {
  createManagedAccountFn,
  resetManagedAccountPasswordFn,
} from '@/lib/provisioning.functions';
import { getInstitutionWorkspaceFn, getPlatformOverviewFn } from '@/lib/workspace.functions';
import type { InstitutionRole } from '@/integrations/supabase/types';

export const Route = createFileRoute('/app/accounts')({
  head: () => ({
    meta: [
      { title: 'Manage accounts — ExamFlow' },
      { name: 'description', content: 'Create teacher and student accounts.' },
    ],
  }),
  component: AccountsPage,
});

type Credentials = { username: string; temporaryPassword: string; role: string; fullName?: string };

function AccountsPage() {
  const { user, workspace, activeInstitutionId, activeMembership, authHeaders } = useAuth();
  const queryClient = useQueryClient();
  const isPlatformAdmin = workspace?.isSuperAdmin ?? false;
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'teacher' | 'student'>('teacher');
  const [studentCode, setStudentCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const platformQuery = useQuery({
    queryKey: ['platform-overview', user?.id],
    enabled: Boolean(user && isPlatformAdmin),
    queryFn: async () => getPlatformOverviewFn({ headers: authHeaders() }),
  });

  useEffect(() => {
    if (!isPlatformAdmin && activeInstitutionId) {
      setSelectedInstitutionId(activeInstitutionId);
      return;
    }
    if (isPlatformAdmin && !selectedInstitutionId) {
      const firstActive = platformQuery.data?.institutions.find((item) => item.status === 'active');
      if (firstActive) setSelectedInstitutionId(firstActive.id);
    }
  }, [activeInstitutionId, isPlatformAdmin, platformQuery.data, selectedInstitutionId]);

  const institutionId = isPlatformAdmin ? selectedInstitutionId : activeInstitutionId ?? '';
  const institutionQuery = useQuery({
    queryKey: ['institution-workspace', institutionId, user?.id],
    enabled: Boolean(user && institutionId),
    queryFn: async () =>
      getInstitutionWorkspaceFn({
        data: { institutionId },
        headers: authHeaders(),
      }),
  });

  async function refreshAccounts() {
    await queryClient.invalidateQueries({ queryKey: ['institution-workspace', institutionId, user?.id] });
    await queryClient.invalidateQueries({ queryKey: ['workspace-bootstrap', user?.id] });
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCredentials(null);
    if (!institutionId) {
      setError('Choose an active institution first.');
      return;
    }
    setBusy(true);
    try {
      const created = await createManagedAccountFn({
        data: {
          institutionId,
          fullName: fullName.trim(),
          email: email.trim(),
          username: username.trim(),
          role,
          ...(role === 'student' ? { studentCode: studentCode.trim() } : {}),
        },
        headers: authHeaders(),
      });
      setCredentials(created);
      setFullName('');
      setEmail('');
      setUsername('');
      setStudentCode('');
      await refreshAccounts();
      toast.success(`${role === 'teacher' ? 'Teacher' : 'Student'} account created`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword(membershipId: string) {
    if (!institutionId) return;
    setError(null);
    setCredentials(null);
    setBusyMembershipId(membershipId);
    try {
      const result = await resetManagedAccountPasswordFn({
        data: { institutionId, membershipId },
        headers: authHeaders(),
      });
      setCredentials({ ...result, role: 'account reset' });
      toast.success('Temporary password created');
      await refreshAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
    } finally {
      setBusyMembershipId(null);
    }
  }

  async function onCopyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Username: ${credentials.username}\nTemporary password: ${credentials.temporaryPassword}`,
      );
      toast.success('Credentials copied');
    } catch {
      setError('Could not copy credentials. Select and copy them manually.');
    }
  }

  const selectedInstitution = isPlatformAdmin
    ? platformQuery.data?.institutions.find((item) => item.id === institutionId)
    : activeMembership?.institution;

  return (
    <RoleGuard allowedRoles={['institution', 'super-admin']}>
      <PageHeader
        title="Manage accounts"
        description="Create teacher and student accounts and issue temporary passwords."
      />

      {isPlatformAdmin && (
        <div className="mb-4 max-w-2xl">
          <Label htmlFor="account-institution">Institution</Label>
          <Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
            <SelectTrigger id="account-institution" className="mt-1.5">
              <SelectValue placeholder="Choose an active institution" />
            </SelectTrigger>
            <SelectContent>
              {(platformQuery.data?.institutions ?? [])
                .filter((institution) => institution.status === 'active')
                .map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {platformQuery.error && (
            <ErrorState
              title="Could not load institutions"
              description={platformQuery.error instanceof Error ? platformQuery.error.message : 'Unknown error'}
              onRetry={() => void platformQuery.refetch()}
            />
          )}
        </div>
      )}

      {isPlatformAdmin && platformQuery.isLoading ? (
        <LoadingState label="Loading institutions…" />
      ) : !institutionId ? (
        <EmptyState title="No active institution selected" description="Create an institution first, or select an active one." />
      ) : (
        <div className="space-y-6">
          <Card className="max-w-3xl shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                Create an account{selectedInstitution ? ` for ${selectedInstitution.name}` : ''}
              </CardTitle>
              <CardDescription>
                Each account receives a unique username and a temporary password. The new user must change it at first sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <ErrorState title="Account action failed" description={error} />}
              <form onSubmit={onCreate} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="account-full-name">Full name</Label>
                    <Input
                      id="account-full-name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      autoComplete="name"
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="account-email">Email for password recovery</Label>
                    <Input
                      id="account-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="account-username">Username</Label>
                    <Input
                      id="account-username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase())}
                      autoCapitalize="none"
                      spellCheck={false}
                      minLength={3}
                      maxLength={32}
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="account-role">Role</Label>
                    <Select value={role} onValueChange={(value) => setRole(value as 'teacher' | 'student')}>
                      <SelectTrigger id="account-role" className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teacher">Teacher / Examiner</SelectItem>
                        <SelectItem value="student">Student</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {role === 'student' && (
                    <div className="sm:col-span-2">
                      <Label htmlFor="account-student-code">Student code / roll number</Label>
                      <Input
                        id="account-student-code"
                        value={studentCode}
                        onChange={(event) => setStudentCode(event.target.value)}
                        required
                        maxLength={50}
                        className="mt-1.5"
                      />
                    </div>
                  )}
                </div>
                <Button type="submit" disabled={busy || !institutionId}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Create account
                </Button>
              </form>

              {credentials && (
                <div className="space-y-3 rounded-lg border p-4" role="status" aria-live="polite">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Temporary credentials</p>
                      <p className="text-xs text-muted-foreground">
                        Share these securely. This password is shown only in this result.
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void onCopyCredentials()}>
                      <Copy className="h-4 w-4" />
                      Copy credentials
                    </Button>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Username</dt>
                      <dd className="break-all font-mono">{credentials.username}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Temporary password</dt>
                      <dd className="break-all font-mono">{credentials.temporaryPassword}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="account-list-heading">
            <h2 id="account-list-heading" className="mb-3 text-base font-semibold">
              Institution members
            </h2>
            {institutionQuery.isLoading ? (
              <LoadingState label="Loading accounts…" />
            ) : institutionQuery.error ? (
              <ErrorState
                title="Could not load accounts"
                description={institutionQuery.error instanceof Error ? institutionQuery.error.message : 'Unknown error'}
                onRetry={() => void institutionQuery.refetch()}
              />
            ) : !institutionQuery.data || institutionQuery.data.members.length === 0 ? (
              <EmptyState title="No members in this institution yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {institutionQuery.data.members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <p className="font-medium">{member.profile?.full_name || member.profile?.email || member.user_id}</p>
                        <p className="text-xs text-muted-foreground">{member.profile?.email ?? '—'}</p>
                      </TableCell>
                      <TableCell>{member.role.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <StatusPill tone={member.status === 'active' ? 'success' : 'warning'}>
                          {member.status}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-right">
                        {(['teacher', 'student'] as InstitutionRole[]).includes(member.role) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyMembershipId !== null}
                            onClick={() => void onResetPassword(member.id)}
                          >
                            {busyMembershipId === member.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            Reset
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}
    </RoleGuard>
  );
}
