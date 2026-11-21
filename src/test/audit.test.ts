import { describe, expect, it } from 'vitest';
import {
  auditSearchSchema,
  auditEntriesToCsvRows,
  redactAuditMetadata,
  sanitizeSearchTerm,
} from '@/lib/audit.shared';

const id = '11111111-1111-4111-8111-111111111111';

describe('audit search validation', () => {
  it('applies defaults and bounds', () => {
    const v = auditSearchSchema.parse({ institutionId: id });
    expect(v.page).toBe(1);
    expect(v.pageSize).toBe(25);
    expect(() => auditSearchSchema.parse({ institutionId: id, pageSize: 5000 })).toThrow();
    expect(() => auditSearchSchema.parse({ institutionId: 'nope' })).toThrow();
  });
  it('rejects inverted date ranges', () => {
    expect(() =>
      auditSearchSchema.parse({ institutionId: id, from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
    ).toThrow();
  });
});

describe('sanitizeSearchTerm', () => {
  it('strips filter-injection and wildcard characters', () => {
    expect(sanitizeSearchTerm('a%,b)(c_*d')).toBe('a b c d');
    expect(sanitizeSearchTerm('x),institution_id.neq.0,(y')).not.toMatch(/[,()]/);
  });
});

describe('redactAuditMetadata', () => {
  it('redacts secret-like keys at any depth', () => {
    const out = redactAuditMetadata({ email: 'a@b.c', nested: { apiKey: 'k', password: 'p', ok: 1 } }) as any;
    expect(out.nested.apiKey).toBe('[redacted]');
    expect(out.nested.password).toBe('[redacted]');
    expect(out.nested.ok).toBe(1);
  });
});

describe('csv rows', () => {
  it('maps entries with system fallback', () => {
    const rows = auditEntriesToCsvRows([
      { id: '1', createdAt: 't', action: 'a', targetType: 'x', targetId: null, actorUserId: null, actorName: null, metadata: {} },
    ]);
    expect(rows[0]).toEqual(['t', 'system', 'a', 'x', '', '{}']);
  });
});
