import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { getInstitutionSubscription, updateInstitutionSubscriptionPlan } from './saas.server';

export const getInstitutionSubscriptionFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    getInstitutionSubscription(context.supabase, context.userId, data.institutionId),
  );

export const updateInstitutionSubscriptionPlanFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        planTier: z.enum(['free', 'starter', 'professional', 'enterprise']),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    updateInstitutionSubscriptionPlan(context.supabase, context.userId, data.institutionId, data.planTier),
  );
