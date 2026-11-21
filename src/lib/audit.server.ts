import { verifyInstitutionAccess, type AuthedSupabase } from './workspace.server';
import {
  redactAuditMetadata,
  sanitizeSearchTerm,
  type AuditMetadata,
  type AuditSearchInput,
  type AuditSearchResult,
} from './audit.shared';

/**
 * Institution-scoped, paginated audit search. Only institution admins (or platform
 * admins) may read. RLS additionally scopes rows to the institution.
 */
export async function searchAuditLogs(
  supabase: AuthedSupabase,
  userId: string,
  input: AuditSearchInput,
): Promise<AuditSearchResult> {
  await verifyInstitutionAccess(supabase, userId, input.institutionId, ['institution_admin']);

  let query = supabase
    .from('institution_audit_logs')
    .select('*', { count: 'exact' })
    .eq('institution_id', input.institutionId)
    .order('created_at', { ascending: false });

  const term = input.search ? sanitizeSearchTerm(input.search) : '';
  if (term) query = query.or(`action.ilike.%${term}%,target_type.ilike.%${term}%`);
  if (input.from) query = query.gte('created_at', input.from);
  if (input.to) query = query.lte('created_at', input.to);

  const start = (input.page - 1) * input.pageSize;
  const { data, error, count } = await query.range(start, start + input.pageSize - 1);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v)));
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds);
    if (pErr) throw new Error(pErr.message);
    for (const p of profiles ?? []) names.set(p.id, p.full_name || p.email || p.id);
  }

  return {
    total: count ?? 0,
    page: input.page,
    pageSize: input.pageSize,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      actorUserId: r.actor_user_id,
      actorName: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
      metadata: (redactAuditMetadata(r.metadata) ?? {}) as AuditMetadata,
    })),
  };
}
