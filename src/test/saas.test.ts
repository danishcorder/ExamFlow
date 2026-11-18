import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace.server', () => ({
  verifyInstitutionAccess: vi.fn().mockResolvedValue({
    isSuperAdmin: false,
    membership: { role: 'institution_admin' },
  }),
  AuthorizationError: class AuthorizationError extends Error {},
}));

import { updateInstitutionSubscriptionPlan } from '@/lib/saas.server';

describe('subscription plan safety', () => {
  it('does not grant paid tiers without a configured billing provider', async () => {
    const supabase = { from: vi.fn() };

    await expect(
      updateInstitutionSubscriptionPlan(
        supabase as never,
        'admin-user',
        'institution-id',
        'enterprise',
      ),
    ).rejects.toThrow('Plan changes are unavailable until subscription billing is configured.');

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
