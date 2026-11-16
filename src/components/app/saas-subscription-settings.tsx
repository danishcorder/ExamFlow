import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, CheckCircle2, CreditCard, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from './stat-card';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StatusPill } from './status-pill';
import { useAuth } from '@/lib/auth';
import { getInstitutionSubscriptionFn, updateInstitutionSubscriptionPlanFn } from '@/lib/saas.functions';
import type { SubscriptionPlanTier } from '@/lib/saas.server';

type SaasSubscriptionSettingsProps = {
  institutionId: string;
};

export function SaasSubscriptionSettings({ institutionId }: SaasSubscriptionSettingsProps) {
  const { authHeaders } = useAuth();
  const queryClient = useQueryClient();
  const [updatingPlan, setUpdatingPlan] = useState<SubscriptionPlanTier | null>(null);

  const subQuery = useQuery({
    queryKey: ['institution-subscription', institutionId],
    queryFn: async () => getInstitutionSubscriptionFn({ data: { institutionId }, headers: authHeaders() }),
  });

  async function handleUpgrade(tier: SubscriptionPlanTier) {
    setUpdatingPlan(tier);
    try {
      await updateInstitutionSubscriptionPlanFn({
        data: { institutionId, planTier: tier },
        headers: authHeaders(),
      });
      toast.success(`Successfully upgraded to ${tier.toUpperCase()} plan`);
      await queryClient.invalidateQueries({ queryKey: ['institution-subscription', institutionId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setUpdatingPlan(null);
    }
  }

  const sub = subQuery.data;

  if (subQuery.isLoading) {
    return <LoadingState label="Loading institution subscription details…" />;
  }
  if (subQuery.error || !sub) {
    return (
      <ErrorState
        title="Could not load subscription details"
        description={subQuery.error instanceof Error ? subQuery.error.message : 'Unknown error'}
        onRetry={() => void subQuery.refetch()}
      />
    );
  }

  const plans: Array<{
    tier: SubscriptionPlanTier;
    name: string;
    price: string;
    exams: string;
    students: string;
    teachers: string;
  }> = [
    { tier: 'free', name: 'Free Trial', price: '$0 / mo', exams: '5 active exams', students: '100 students', teachers: '10 teachers' },
    { tier: 'starter', name: 'Starter', price: '$49 / mo', exams: '25 active exams', students: '500 students', teachers: '25 teachers' },
    { tier: 'professional', name: 'Professional', price: '$199 / mo', exams: '100 active exams', students: '2,500 students', teachers: '100 teachers' },
    { tier: 'enterprise', name: 'Enterprise', price: '$499 / mo', exams: 'Unlimited exams', students: 'Unlimited students', teachers: 'Unlimited teachers' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Current Plan" value={sub.planTier.toUpperCase()} icon={Zap} />
        <StatCard label="Active Exams" value={`${sub.activeExamsCount} / ${sub.maxActiveExams}`} icon={Building} />
        <StatCard label="Student Records" value={`${sub.studentsCount} / ${sub.maxStudents}`} icon={Shield} />
        <StatCard label="Teacher Accounts" value={`${sub.teachersCount} / ${sub.maxTeachers}`} icon={CreditCard} />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Subscription Plans & Limits</CardTitle>
          <CardDescription>
            Manage your institution quota, tier entitlements, and billing cycles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => {
              const isCurrent = sub.planTier === p.tier;
              return (
                <div
                  key={p.tier}
                  className={`flex flex-col justify-between rounded-xl border p-5 ${
                    isCurrent ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{p.name}</h3>
                      {isCurrent && <StatusPill tone="success">Active</StatusPill>}
                    </div>
                    <p className="text-2xl font-bold">{p.price}</p>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{p.exams}</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{p.students}</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{p.teachers}</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-6">
                    <Button
                      size="sm"
                      variant={isCurrent ? 'outline' : 'default'}
                      className="w-full"
                      disabled={isCurrent || updatingPlan === p.tier}
                      onClick={() => void handleUpgrade(p.tier)}
                    >
                      {isCurrent ? 'Current Plan' : updatingPlan === p.tier ? 'Updating...' : 'Select Plan'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
