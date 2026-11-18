import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  loadInvigilatorDashboard,
  recordProctoringEvent,
  saveAttemptReview,
} from './proctoring.server';

export const recordProctoringEventFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
        studentId: z.string().uuid(),
        eventType: z.enum([
          'fullscreen_exit',
          'tab_visibility_hidden',
          'window_blur',
          'camera_disconnected',
          'mic_disconnected',
          'face_missing',
          'multiple_faces',
        ]),
        severity: z.enum(['info', 'warning', 'critical']),
        details: z.record(z.string(), z.string()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    recordProctoringEvent(
      context.supabase,
      context.userId,
      data.institutionId,
      data.attemptId,
      data.studentId,
      data.eventType,
      data.severity,
      (data.details ?? {}) as Record<string, unknown>,
    ),
  );

export const getInvigilatorDashboardFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        examId: z.string().uuid().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    loadInvigilatorDashboard(context.supabase, context.userId, data.institutionId, data.examId ?? undefined),
  );

export const saveAttemptReviewFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
        reviewStatus: z.enum(['flagged', 'cleared', 'penalized', 'under_review']),
        reviewNotes: z.string().max(2000).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    saveAttemptReview(context.supabase, context.userId, data.institutionId, {
      attemptId: data.attemptId,
      reviewStatus: data.reviewStatus,
      reviewNotes: data.reviewNotes ?? null,
    }),
  );
