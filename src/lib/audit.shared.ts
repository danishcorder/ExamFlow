import { z } from 'zod';

export const AUDIT_PAGE_SIZE_MAX = 100;

export const auditSearchSchema = z
  .object({
    institutionId: z.string().uuid(),
    search: z.string().trim().max(80).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.number().int().min(1).max(10_000).default(1),
    pageSize: z.number().int().min(1).max(AUDIT_PAGE_SIZE_MAX).default(25),
  })
  .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), {
    message: 'Start date must be before end date',
    path: ['from'],
  });

export type AuditSearchInput = z.infer<typeof auditSearchSchema>;

/** Remove characters that carry meaning in PostgREST `or()` filters / LIKE patterns. */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()*\\"'`:;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|api[_-]?key|service[_-]?role|credential|otp|cookie/i;

/** Defence in depth: never surface secret-like metadata keys, even if one was logged. */
export function redactAuditMetadata(value: unknown, depth = 0): any {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactAuditMetadata(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redactAuditMetadata(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type AuditMetadata = Record<string, string | number | boolean | null | object>;

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: AuditMetadata;
};

export type AuditSearchResult = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export function auditEntriesToCsvRows(items: AuditLogEntry[]): unknown[][] {
  return items.map((e) => [
    e.createdAt,
    e.actorName ?? e.actorUserId ?? 'system',
    e.action,
    e.targetType,
    e.targetId ?? '',
    JSON.stringify(e.metadata ?? {}),
  ]);
}

export const AUDIT_CSV_HEADERS = ['Time (UTC)', 'Actor', 'Action', 'Resource type', 'Resource id', 'Details'];
