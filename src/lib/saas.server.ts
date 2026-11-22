import type { AuthedSupabase } from './workspace.server';
import { verifyInstitutionAccess, AuthorizationError } from './workspace.server';

export type SubscriptionPlanTier = 'free' | 'starter' | 'professional' | 'enterprise';

export type InstitutionSubscriptionData = {
  institutionId: string;
  planTier: SubscriptionPlanTier;
  status: string;
  maxActiveExams: number;
  maxStudents: number;
  maxTeachers: number;
  currentPeriodEnd: string | null;
  activeExamsCount: number;
  studentsCount: number;
  teachersCount: number;
};

const DEFAULT_FREE_PLAN = {
  plan_tier: 'free',
  status: 'active',
  max_active_exams: 5,
  max_students: 100,
  max_teachers: 10,
  current_period_end: null,
} as const;

export async function getInstitutionSubscription(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
): Promise<InstitutionSubscriptionData> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
    'teacher',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Institution access required', 403);
  }

  const [subRes, examsCountRes, studentsCountRes, teachersCountRes] = await Promise.all([
    (supabase as any)
      .from('institution_subscriptions')
      .select('*')
      .eq('institution_id', institutionId)
      .maybeSingle(),
    supabase
      .from('exams')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'published'),
    supabase
      .from('student_records')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId),
    supabase
      .from('institution_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('role', 'teacher'),
  ]);

  if (subRes.error) throw new Error(`Could not load subscription: ${subRes.error.message}`);
  for (const res of [examsCountRes, studentsCountRes, teachersCountRes]) {
    if (res.error) throw new Error(`Could not load plan usage: ${res.error.message}`);
  }

  // Every institution gets a free plan from a database trigger. Never write plan rows with the
  // viewer's session: clients have no write access to subscriptions.
  const sub = (subRes.data ?? DEFAULT_FREE_PLAN) as any;

  return {
    institutionId,
    planTier: (sub.plan_tier as SubscriptionPlanTier) ?? 'free',
    status: sub.status ?? 'active',
    maxActiveExams: Number(sub.max_active_exams ?? 5),
    maxStudents: Number(sub.max_students ?? 100),
    maxTeachers: Number(sub.max_teachers ?? 10),
    currentPeriodEnd: sub.current_period_end ?? null,
    activeExamsCount: examsCountRes.count ?? 0,
    studentsCount: studentsCountRes.count ?? 0,
    teachersCount: teachersCountRes.count ?? 0,
  };
}

export async function updateInstitutionSubscriptionPlan(
  supabase: AuthedSupabase,
  userId: string,
  institutionId: string,
  planTier: SubscriptionPlanTier,
): Promise<InstitutionSubscriptionData> {
  const { isSuperAdmin, membership } = await verifyInstitutionAccess(supabase, userId, institutionId, [
    'institution_admin',
  ]);
  if (isSuperAdmin && !membership) {
    throw new AuthorizationError('Institution Admin access required to update subscription', 403);
  }
  // There is no billing provider or verified payment webhook in this project.
  // Never allow a client request to grant paid entitlements.
  void planTier;
  throw new Error('Plan changes are unavailable until subscription billing is configured.');
}
