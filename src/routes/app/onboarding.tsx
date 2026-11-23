import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Check, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/app/page-header';
import { ErrorState, DisabledInLocalModeCard } from '@/components/app/states';
import { StatusPill } from '@/components/app/status-pill';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/auth-mode';
import { acceptInvitationFn } from '@/lib/workspace.functions';
import { dbRoleToRoleKey, INSTITUTION_ROLE_LABELS, ROLES } from '@/lib/roles';

export const Route = createFileRoute('/app/onboarding')({
  head: () => ({
    meta: [
      { title: 'Workspace access — ExamFlow' },
      { name: 'description', content: 'Join an institution workspace.' },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { workspace, authHeaders, refreshWorkspace, setActiveInstitutionId } = useAuth();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingInvitations = workspace?.pendingInvitations ?? [];

  async function onAcceptInvite(token: string, id: string) {
    setError(null);
    setAcceptingId(id);
    try {
      const membership = await acceptInvitationFn({
        data: { token },
        headers: authHeaders(),
      });
      await refreshWorkspace();
      setActiveInstitutionId(membership.institution_id);
      toast.success('Invitation accepted');
      void navigate({ href: ROLES[dbRoleToRoleKey(membership.role)].path });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invitation');
    } finally {
      setAcceptingId(null);
    }
  }

  if (AUTH_MODE === 'none') {
    return (
      <>
        <PageHeader
          title="Workspace access"
          description="Institutions and accounts are set up by ExamFlow administrators."
        />
        <DisabledInLocalModeCard feature="Workspace onboarding" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Workspace access"
        description="Institutions and accounts are set up by ExamFlow administrators."
      />

      {error && <ErrorState title="Could not accept invitation" description={error} />}

      <Card className="mx-auto max-w-2xl shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailCheck className="h-4 w-4 text-primary" />
            Pending invitations
          </CardTitle>
          <CardDescription>
            Invitations for {workspace?.profile.email ?? 'your account'} appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingInvitations.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No pending invitations. Ask your Institution Admin to add your account to a workspace.
            </p>
          ) : (
            pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">{invitation.institution_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusPill tone="info">{INSTITUTION_ROLE_LABELS[invitation.role]}</StatusPill>
                    <span>Expires {new Date(invitation.expires_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={acceptingId !== null}
                  onClick={() => void onAcceptInvite(invitation.token, invitation.id)}
                >
                  {acceptingId === invitation.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Accept & join
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
