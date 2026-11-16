import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  getStudentExamLobby,
  heartbeatExamAttempt,
  loadStudentExamDashboard,
  saveExamAttemptAnswer,
  startOrResumeExamAttempt,
  submitExamAttempt,
} from './exam-engine.server';

const instSchema = z.object({ institutionId: z.string().uuid() });
const examRefSchema = z.object({
  institutionId: z.string().uuid(),
  examId: z.string().uuid(),
});
const attemptRefSchema = z.object({
  institutionId: z.string().uuid(),
  attemptId: z.string().uuid(),
});

export const getStudentExamDashboardFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => instSchema.parse(data))
  .handler(async ({ context, data }) =>
    loadStudentExamDashboard(context.supabase, context.userId, data.institutionId),
  );

export const getStudentExamLobbyFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => examRefSchema.parse(data))
  .handler(async ({ context, data }) =>
    getStudentExamLobby(context.supabase, context.userId, data.institutionId, data.examId),
  );

export const startOrResumeExamAttemptFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => examRefSchema.parse(data))
  .handler(async ({ context, data }) =>
    startOrResumeExamAttempt(context.supabase, context.userId, data.institutionId, data.examId),
  );

export const saveExamAttemptAnswerFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
        questionId: z.string().uuid(),
        selectedOptionKeys: z.array(z.string().min(1).max(20)).max(30).optional(),
        descriptiveText: z.string().max(50000).nullable().optional(),
        isFlagged: z.boolean().optional(),
        clientUpdatedAt: z.string().datetime().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    saveExamAttemptAnswer(context.supabase, context.userId, data),
  );

export const submitExamAttemptFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
        reason: z.enum(['manual', 'deadline_auto_submit']).optional(),
        idempotencyKey: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    submitExamAttempt(context.supabase, context.userId, data),
  );

export const heartbeatExamAttemptFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => attemptRefSchema.parse(data))
  .handler(async ({ context, data }) =>
    heartbeatExamAttempt(context.supabase, context.userId, data.institutionId, data.attemptId),
  );
