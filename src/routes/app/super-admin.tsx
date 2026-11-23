import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { StatCard } from '@/components/app/stat-card';
import { EmptyState, ErrorState, LoadingState, DisabledInLocalModeCard } from '@/components/app/states';
import { StatusPill } from '@/components/app/status-pill';
import { InstitutionProvisioningPanel } from '@/components/app/institution-provisioning-panel';
import { useAuth } from '@/lib/auth';
import { AUTH_MODE } from '@/lib/auth-mode';
import { getPlatformOverviewFn, updateInstitutionStatusFn } from '@/lib/workspace.functions';
import type { InstitutionStatus } from '@/integrations/supabase/types';

export const Route = createFileRoute('/app/super-admin')({
  head: () => ({
    meta: [
      { title: 'Platform Super Admin — ExamFlow' },
      { name: 'description', content: 'Platform-wide institution oversight.' },
    ],
  }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const { user, authHeaders } = useAuth();
  const queryClient = useQueryClient();
  const [busyInstId, setBusyInstId] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['platform-overview', user?.id],
    enabled: AUTH_MODE === 'supabase' && Boolean(user),
    queryFn: async () => getPlatformOverviewFn({ headers: authHeaders() }),
  });

  async function onToggleInstitution(institutionId: string, current: InstitutionStatus) {
    const next: InstitutionStatus = current === 'active' ? 'suspended' : 'active';
    setBusyInstId(institutionId);
    try {
      await updateInstitutionStatusFn({
        data: { institutionId, status: next },
        headers: authHeaders(),
      });
      toast.success(`Institution marked ${next}`);
      await queryClient.invalidateQueries({ queryKey: ['platform-overview', user?.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update institution');
    } finally {
      setBusyInstId(null);
    }
  }

  const data = overviewQuery.data;

  if (AUTH_MODE === 'none') {
    return (
      <>
        <PageHeader
          title="Platform Super Admin"
          description="Verified platform-level governance across registered institutions."
        />
        <DisabledInLocalModeCard feature="Platform Super Admin" />
      </>
    );
  }

  return (
    <RoleGuard requiredRole="super-admin">
      <PageHeader
        title="Platform Super Admin"
        description="Verified platform-level governance across registered institutions."
      />

      {overviewQuery.isLoading ? (
        <LoadingState label="Loading platform overview…" />
      ) : overviewQuery.error ? (
        <ErrorState
          title="Could not load platform overview"
          description={
            overviewQuery.error instanceof Error ? overviewQuery.error.message : 'Unknown error'
          }
          onRetry={() => {
            void overviewQuery.refetch();
          }}
        />
      ) : !data ? (
        <EmptyState title="No platform data" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total institutions"
              value={String(data.institutions.length)}
              icon={Building2}
            />
            <StatCard
              label="Active memberships"
              value={String(data.totalMemberships)}
              icon={Users}
            />
            <StatCard
              label="Active tenants"
              value={String(data.institutions.filter((institution) => institution.status === 'active').length)}
              icon={ShieldCheck}
            />
          </div>

          <InstitutionProvisioningPanel
            onCreated={() => void queryClient.invalidateQueries({ queryKey: ['platform-overview', user?.id] })}
          />

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Registered institutions</CardTitle>
              <CardDescription>
                Only the single Platform Super Admin can inspect or suspend institutions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.institutions.length === 0 ? (
                <EmptyState title="No institutions created yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Active members</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.institutions.map((institution) => (
                      <TableRow key={institution.id}>
                        <TableCell>
                          <p className="font-medium">{institution.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{institution.slug}</p>
                        </TableCell>
                        <TableCell className="capitalize">
                          {institution.institution_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell>{institution.memberCount}</TableCell>
                        <TableCell>
                          <StatusPill tone={institution.status === 'active' ? 'success' : 'danger'}>
                            {institution.status}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={institution.status === 'active' ? 'outline' : 'default'}
                            disabled={busyInstId === institution.id}
                            onClick={() => void onToggleInstitution(institution.id, institution.status)}
                          >
                            {institution.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </RoleGuard>
  );
}
