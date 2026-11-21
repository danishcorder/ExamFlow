import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { auditSearchSchema } from './audit.shared';
import { searchAuditLogs } from './audit.server';

export const searchAuditLogsFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => auditSearchSchema.parse(data))
  .handler(async ({ context, data }) => searchAuditLogs(context.supabase, context.userId, data));
