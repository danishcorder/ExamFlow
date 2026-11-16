import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  calculateAttemptGrades,
  loadExamAnalytics,
  loadStudentResultReport,
  loadTeacherAttemptGradingDetail,
  loadTeacherExamGradingDashboard,
  publishExamResults,
  saveManualAttemptQuestionGrade,
} from './grading.server';

const instSchema = z.object({
  institutionId: z.string().uuid(),
  examId: z.string().uuid(),
});

export const getTeacherExamGradingDashboardFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => instSchema.parse(data))
  .handler(async ({ context, data }) =>
    loadTeacherExamGradingDashboard(context.supabase, context.userId, data.institutionId, data.examId),
  );

export const getTeacherAttemptGradingDetailFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    loadTeacherAttemptGradingDetail(context.supabase, context.userId, data.institutionId, data.attemptId),
  );

export const saveManualQuestionGradeFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
        questionId: z.string().uuid(),
        awardedMarks: z.number().min(0),
        teacherFeedback: z.string().max(5000).nullish(),
        rubricBreakdown: z.record(z.string(), z.string()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    saveManualAttemptQuestionGrade(context.supabase, context.userId, data.institutionId, {
      attemptId: data.attemptId,
      questionId: data.questionId,
      awardedMarks: data.awardedMarks,
      teacherFeedback: data.teacherFeedback ?? null,
      rubricBreakdown: data.rubricBreakdown ?? {},
    }),
  );

export const publishExamResultsFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        examId: z.string().uuid(),
        attemptIds: z.array(z.string().uuid()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    publishExamResults(context.supabase, context.userId, data.institutionId, data.examId, data.attemptIds),
  );

export const getStudentResultReportFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => instSchema.parse(data))
  .handler(async ({ context, data }) =>
    loadStudentResultReport(context.supabase, context.userId, data.institutionId, data.examId),
  );

export const getExamAnalyticsFn = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => instSchema.parse(data))
  .handler(async ({ context, data }) =>
    loadExamAnalytics(context.supabase, context.userId, data.institutionId, data.examId),
  );

export const calculateGradesFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        institutionId: z.string().uuid(),
        attemptId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) =>
    calculateAttemptGrades(context.supabase, data.institutionId, data.attemptId),
  );
