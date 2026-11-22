import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  requireSupabaseAuth,
  requireSupabasePasswordChange,
} from '@/integrations/supabase/auth-middleware';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be 32 characters or fewer')
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Use letters, numbers, dots, underscores, or hyphens')
  .transform((value) => value.toLowerCase());

const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Enter your password').max(72),
});

export const signInWithUsernameFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => signInSchema.parse(data))
  .handler(async ({ data }) => {
    const { signInWithUsername } = await import('./username-login.server');
    return signInWithUsername(data);
  });

const managedAccountSchema = z
  .object({
    institutionId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(255),
    username: usernameSchema,
    role: z.enum(['teacher', 'student']),
    studentCode: z.string().trim().max(50).optional(),
  })
  .superRefine((value, context) => {
    if (value.role === 'student' && !value.studentCode?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['studentCode'],
        message: 'Enter a student code for a student account',
      });
    }
  });

export const createManagedAccountFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => managedAccountSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { createManagedAccount } = await import('./provisioning.server');
    return createManagedAccount(context.userId, data);
  });

const institutionWithAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(80),
  institutionType: z.enum(['school', 'college', 'university', 'training_centre']),
  adminFullName: z.string().trim().min(2).max(100),
  adminEmail: z.string().trim().email().max(255),
  adminUsername: usernameSchema,
});

export const createInstitutionWithFirstAdminFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => institutionWithAdminSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { createInstitutionWithFirstAdmin } = await import('./provisioning.server');
    return createInstitutionWithFirstAdmin(context.userId, data);
  });

const resetPasswordSchema = z.object({
  institutionId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

export const resetManagedAccountPasswordFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resetPasswordSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { resetManagedAccountPassword } = await import('./provisioning.server');
    return resetManagedAccountPassword(context.userId, data);
  });

const changePasswordSchema = z.object({
  password: z.string().min(10, 'Use at least 10 characters').max(72),
});

export const changeOwnPasswordFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabasePasswordChange])
  .inputValidator((data: unknown) => changePasswordSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { changeOwnPassword } = await import('./provisioning.server');
    return changeOwnPassword(context.userId, data.password);
  });
