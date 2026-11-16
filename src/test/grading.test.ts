import { describe, expect, it } from 'vitest';
import { calculateAttemptGrades } from '@/lib/grading.server';
import type { AuthedSupabase } from '@/lib/workspace.server';

describe('Phase 7 Grading and Results Engine', () => {
  it('automatically grades MCQ correct/incorrect choices and applies negative marking', async () => {
    const tables: Record<string, Array<Record<string, unknown>>> = {
      exam_attempts: [
        {
          id: 'att-1',
          institution_id: 'inst-oak',
          exam_id: 'ex-1',
          exam_version_id: 'ver-1',
          student_id: 'sr-1',
        },
      ],
      exam_attempt_answers: [
        {
          attempt_id: 'att-1',
          institution_id: 'inst-oak',
          question_id: 'q-mcq-correct',
          question_type: 'mcq_single',
          selected_option_keys: ['B'],
          descriptive_text: null,
        },
        {
          attempt_id: 'att-1',
          institution_id: 'inst-oak',
          question_id: 'q-mcq-wrong',
          question_type: 'mcq_single',
          selected_option_keys: ['C'],
          descriptive_text: null,
        },
      ],
      exam_versions: [
        {
          id: 'ver-1',
          institution_id: 'inst-oak',
          snapshot_passing_marks: 5,
          snapshot_passing_percentage: 50,
          snapshot_payload: {
            sections: [
              {
                title: 'Section A',
                questions: [
                  {
                    id: 'q-mcq-correct',
                    question_type: 'mcq_single',
                    title: 'Q1',
                    prompt: 'What is 2+2?',
                    effective_marks: 10,
                    effective_negative_marks: 2,
                  },
                  {
                    id: 'q-mcq-wrong',
                    question_type: 'mcq_single',
                    title: 'Q2',
                    prompt: 'What is 3+3?',
                    effective_marks: 10,
                    effective_negative_marks: 2,
                  },
                ],
              },
            ],
          },
        },
      ],
      exams: [{ id: 'ex-1', institution_id: 'inst-oak', passing_marks: 5 }],
      exam_version_answer_keys: [
        {
          version_id: 'ver-1',
          institution_id: 'inst-oak',
          keys_payload: {
            questions: {
              'q-mcq-correct': { correct_option_keys: ['B'] },
              'q-mcq-wrong': { correct_option_keys: ['A'] },
            },
          },
        },
      ],
      exam_question_grades: [],
      exam_attempt_grades: [],
    };

    const mockSupabase = {
      from: (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        let updatePayload: Record<string, unknown> | null = null;
        let isUpsert = false;

        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return builder;
          },
          upsert: async (payload: Record<string, unknown>) => {
            isUpsert = true;
            updatePayload = payload;
            tables[table] = tables[table] ?? [];
            const idx = tables[table]!.findIndex((r) =>
              table === 'exam_question_grades'
                ? r['attempt_id'] === payload['attempt_id'] && r['question_id'] === payload['question_id']
                : r['attempt_id'] === payload['attempt_id'],
            );
            if (idx >= 0) {
              tables[table]![idx] = { ...tables[table]![idx]!, ...payload };
            } else {
              tables[table]!.push(payload);
            }
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => {
            updatePayload = payload;
            return builder;
          },
          maybeSingle: async () => {
            const rows = (tables[table] ?? []).filter((r) => filters.every((fn) => fn(r)));
            return { data: rows[0] ?? null, error: null };
          },
          then: (res: (v: unknown) => void) => {
            const rows = (tables[table] ?? []).filter((r) => filters.every((fn) => fn(r)));
            res({ data: rows, error: null });
          },
        };
        return builder;
      },
    } as unknown as AuthedSupabase;

    const result = await calculateAttemptGrades(mockSupabase, 'inst-oak', 'att-1');
    // Q1 (correct) = 10 pts, Q2 (wrong with -2 penalty) = 0 pts (clamped to min 0)
    expect(result.totalAwarded).toBe(10);
    expect(result.maxPossible).toBe(20);
    expect(result.percentage).toBe(50);
    expect(result.isPassing).toBe(true);
  });
});
