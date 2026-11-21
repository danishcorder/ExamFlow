import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { reportsInputSchema } from './reports.shared';
import { loadReportsOverview } from './reports.server';

export const getReportsOverviewFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reportsInputSchema.parse(data))
  .handler(async ({ context, data }) => loadReportsOverview(context.supabase, context.userId, data));
