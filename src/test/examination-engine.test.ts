import { describe, expect, it } from 'vitest';
import {
  getStudentExamLobby,
  heartbeatExamAttempt,
  loadStudentExamDashboard,
  saveExamAttemptAnswer,
  startOrResumeExamAttempt,
  submitExamAttempt,
} from '@/lib/exam-engine.server';
import { AuthorizationError, type AuthedSupabase } from '@/lib/workspace.server';

type TableMap = Record<string, Array<Record<string, unknown>>>;

function makeStatefulMockSupabase(tables: TableMap): AuthedSupabase {
  let seq = 1;

  const makeBuilder = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let pendingOp: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
    let onConflictCols: string[] = [];

    const matchRow = (row: Record<string, unknown>) => filters.every((fn) => fn(row));

    const execute = async (): Promise<{ data: unknown; error: { code?: string; message: string } | null }> => {
      const rows = (tables[table] ??= []);

      if (pendingOp === 'insert') {
        const toInsert = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const inserted: Array<Record<string, unknown>> = [];

        for (const item of toInsert) {
          if (table === 'exam_attempts') {
            const dup = rows.find(
              (r) =>
                r['institution_id'] === item['institution_id'] &&
                r['exam_id'] === item['exam_id'] &&
                (r['student_id'] === item['student_id'] || r['user_id'] === item['user_id']),
            );
            if (dup) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              };
            }
          }

          const record: Record<string, unknown> = {
            id: item['id'] ?? `${table}-${seq++}`,
            created_at: item['created_at'] ?? '2026-11-16T10:00:00.000Z',
            updated_at: item['updated_at'] ?? '2026-11-16T10:00:00.000Z',
            ...item,
          };
          rows.push(record);
          inserted.push(record);
        }

        return { data: inserted, error: null };
      }

      if (pendingOp === 'upsert') {
        const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const resultRows: Array<Record<string, unknown>> = [];

        for (const item of items) {
          const existing = rows.find((r) =>
            onConflictCols.every((col) => r[col] === item[col]),
          );
          if (existing) {
            Object.assign(existing, item, {
              updated_at: item['saved_at'] ?? new Date().toISOString(),
            });
            resultRows.push(existing);
          } else {
            const created: Record<string, unknown> = {
              id: item['id'] ?? `${table}-${seq++}`,
              created_at: item['saved_at'] ?? new Date().toISOString(),
              updated_at: item['saved_at'] ?? new Date().toISOString(),
              ...item,
            };
            rows.push(created);
            resultRows.push(created);
          }
        }
        return { data: resultRows, error: null };
      }

      if (pendingOp === 'update') {
        const matched = rows.filter(matchRow);
        const upd = (payload as Record<string, unknown>) ?? {};
        for (const row of matched) {
          Object.assign(row, upd, {
            updated_at: upd['submitted_at'] ?? upd['last_saved_at'] ?? new Date().toISOString(),
          });
        }
        return { data: matched, error: null };
      }

      return { data: rows.filter(matchRow), error: null };
    };

    const builder = {
      select: () => builder,
      insert: (val: Record<string, unknown> | Array<Record<string, unknown>>) => {
        pendingOp = 'insert';
        payload = val;
        return builder;
      },
      update: (val: Record<string, unknown>) => {
        pendingOp = 'update';
        payload = val;
        return builder;
      },
      upsert: (val: Record<string, unknown> | Array<Record<string, unknown>>, opts?: { onConflict?: string }) => {
        pendingOp = 'upsert';
        payload = val;
        onConflictCols = (opts?.onConflict ?? 'id').split(',').map((s) => s.trim());
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => {
        const res = await execute();
        if (res.error) return { data: null, error: res.error };
        const arr = (res.data as Array<Record<string, unknown>>) ?? [];
        return { data: arr[0] ?? null, error: null };
      },
      single: async () => {
        const res = await execute();
        if (res.error) return { data: null, error: res.error };
        const arr = (res.data as Array<Record<string, unknown>>) ?? [];
        if (!arr[0]) {
          return { data: null, error: { message: 'Row not found' } };
        }
        return { data: arr[0], error: null };
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        execute().then(resolve, reject),
    };

    return builder;
  };

  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as AuthedSupabase;
}

function createFixtureTables(): TableMap {
  const snapshotPayload = {
    versionNumber: 1,
    publishedAt: '2026-11-16T08:00:00.000Z',
    examId: 'exam-midterm',
    title: 'Algorithms Midterm',
    description: 'Core data structures and asymptotic analysis',
    instructions: 'No external notes. Answer all MCQ and descriptive questions.',
    courseCode: 'CS101',
    courseTitle: 'Algorithms',
    startsAt: '2026-11-16T09:00:00.000Z',
    endsAt: '2026-11-16T12:00:00.000Z',
    durationMinutes: 60,
    totalMarks: 15,
    passingMarks: 8,
    passingPercentage: 50,
    negativeMarkingEnabled: true,
    defaultNegativeMarks: 0.5,
    shuffleQuestions: true,
    shuffleOptions: true,
    sections: [
      {
        id: 'sec-mcq',
        title: 'Part A: Multiple Choice',
        description: null,
        section_type: 'mcq',
        sort_order: 0,
        shuffle_questions: true,
        sectionTotalMarks: 5,
        questions: [
          {
            id: 'q-mcq-1',
            section_question_id: 'sq-1',
            sort_order: 0,
            question_type: 'mcq_single',
            title: 'Binary Search Complexity',
            prompt: 'What is the worst-case time complexity of binary search?',
            topic: 'Searching',
            category: 'Algorithms',
            difficulty: 'easy',
            expected_word_count: null,
            effective_marks: 2,
            effective_negative_marks: 0.5,
            options: [
              { id: 'o1', option_key: 'A', option_text: 'O(1)', sort_order: 0 },
              { id: 'o2', option_key: 'B', option_text: 'O(log n)', sort_order: 1 },
              { id: 'o3', option_key: 'C', option_text: 'O(n)', sort_order: 2 },
            ],
            attachments: [],
          },
          {
            id: 'q-mcq-2',
            section_question_id: 'sq-2',
            sort_order: 1,
            question_type: 'mcq_multi',
            title: 'Balanced Trees',
            prompt: 'Select all self-balancing binary search trees.',
            topic: 'Trees',
            category: 'Data Structures',
            difficulty: 'medium',
            expected_word_count: null,
            effective_marks: 3,
            effective_negative_marks: 0,
            options: [
              { id: 'o4', option_key: 'A', option_text: 'AVL Tree', sort_order: 0 },
              { id: 'o5', option_key: 'B', option_text: 'Red-Black Tree', sort_order: 1 },
              { id: 'o6', option_key: 'C', option_text: 'Linked List', sort_order: 2 },
            ],
            attachments: [],
          },
        ],
      },
      {
        id: 'sec-desc',
        title: 'Part B: Descriptive',
        description: null,
        section_type: 'descriptive',
        sort_order: 1,
        shuffle_questions: false,
        sectionTotalMarks: 10,
        questions: [
          {
            id: 'q-desc-1',
            section_question_id: 'sq-3',
            sort_order: 0,
            question_type: 'descriptive',
            title: 'Dijkstra Proof Sketch',
            prompt: 'Explain why Dijkstra fails with negative edge weights.',
            topic: 'Graphs',
            category: 'Algorithms',
            difficulty: 'hard',
            expected_word_count: 150,
            effective_marks: 10,
            effective_negative_marks: 0,
            options: [],
            attachments: [],
          },
        ],
      },
    ],
    assignments: [],
  };

  return {
    platform_admins: [],
    institutions: [
      { id: 'inst-oak', name: 'Oakridge University', slug: 'oakridge', status: 'active' },
      { id: 'inst-other', name: 'Northwood College', slug: 'northwood', status: 'active' },
    ],
    profiles: [
      { id: 'u-alice', email: 'alice@oakridge.edu', full_name: 'Alice Student' },
      { id: 'u-bob', email: 'bob@oakridge.edu', full_name: 'Bob Student' },
      { id: 'u-charlie', email: 'charlie@oakridge.edu', full_name: 'Charlie Unassigned' },
      { id: 'u-teacher', email: 'prof@oakridge.edu', full_name: 'Prof Oak' },
      { id: 'u-north', email: 'eve@northwood.edu', full_name: 'Eve OtherTenant' },
    ],
    institution_memberships: [
      { id: 'm-alice', institution_id: 'inst-oak', user_id: 'u-alice', role: 'student', status: 'active' },
      { id: 'm-bob', institution_id: 'inst-oak', user_id: 'u-bob', role: 'student', status: 'active' },
      { id: 'm-charlie', institution_id: 'inst-oak', user_id: 'u-charlie', role: 'student', status: 'active' },
      { id: 'm-teacher', institution_id: 'inst-oak', user_id: 'u-teacher', role: 'teacher', status: 'active' },
      { id: 'm-north', institution_id: 'inst-other', user_id: 'u-north', role: 'student', status: 'active' },
    ],
    student_records: [
      {
        id: 'sr-alice',
        institution_id: 'inst-oak',
        membership_id: 'm-alice',
        student_code: 'STU-001',
        full_name: 'Alice Student',
        email: 'alice@oakridge.edu',
        status: 'active',
      },
      {
        id: 'sr-bob',
        institution_id: 'inst-oak',
        membership_id: null, // tests email fallback linking
        student_code: 'STU-002',
        full_name: 'Bob Student',
        email: 'bob@oakridge.edu',
        status: 'active',
      },
      {
        id: 'sr-charlie',
        institution_id: 'inst-oak',
        membership_id: 'm-charlie',
        student_code: 'STU-003',
        full_name: 'Charlie Unassigned',
        email: 'charlie@oakridge.edu',
        status: 'active',
      },
      {
        id: 'sr-north',
        institution_id: 'inst-other',
        membership_id: 'm-north',
        student_code: 'NW-001',
        full_name: 'Eve OtherTenant',
        email: 'eve@northwood.edu',
        status: 'active',
      },
    ],
    class_sections: [
      { id: 'csec-a', institution_id: 'inst-oak', class_id: 'cls-cs1' },
      { id: 'csec-b', institution_id: 'inst-oak', class_id: 'cls-cs2' },
    ],
    student_enrollments: [
      { institution_id: 'inst-oak', student_id: 'sr-alice', class_section_id: 'csec-a', status: 'enrolled' },
      { institution_id: 'inst-oak', student_id: 'sr-charlie', class_section_id: 'csec-b', status: 'enrolled' },
    ],
    exams: [
      {
        id: 'exam-midterm',
        institution_id: 'inst-oak',
        status: 'published',
        latest_published_version_id: 'ver-midterm-1',
      },
      {
        id: 'exam-upcoming',
        institution_id: 'inst-oak',
        status: 'published',
        latest_published_version_id: 'ver-upcoming-1',
      },
    ],
    exam_versions: [
      {
        id: 'ver-midterm-1',
        institution_id: 'inst-oak',
        exam_id: 'exam-midterm',
        version_number: 1,
        title: 'Algorithms Midterm',
        description: 'Core data structures and asymptotic analysis',
        instructions: 'No external notes. Answer all MCQ and descriptive questions.',
        course_id: 'c-cs101',
        course_code: 'CS101',
        course_title: 'Algorithms',
        starts_at: '2026-11-16T09:00:00.000Z',
        ends_at: '2026-11-16T12:00:00.000Z',
        duration_minutes: 60,
        total_marks: 15,
        passing_marks: 8,
        passing_percentage: 50,
        negative_marking_enabled: true,
        default_negative_marks: 0.5,
        shuffle_questions: true,
        shuffle_options: true,
        snapshot_payload: snapshotPayload,
        attempt_count: 0,
      },
      {
        id: 'ver-upcoming-1',
        institution_id: 'inst-oak',
        exam_id: 'exam-upcoming',
        version_number: 1,
        title: 'Final Comprehensive Exam',
        description: null,
        instructions: 'Closed book.',
        course_id: 'c-cs101',
        course_code: 'CS101',
        course_title: 'Algorithms',
        starts_at: '2026-12-01T09:00:00.000Z',
        ends_at: '2026-12-01T12:00:00.000Z',
        duration_minutes: 120,
        total_marks: 100,
        passing_marks: 50,
        passing_percentage: 50,
        negative_marking_enabled: false,
        default_negative_marks: 0,
        shuffle_questions: false,
        shuffle_options: false,
        snapshot_payload: { ...snapshotPayload, examId: 'exam-upcoming', title: 'Final Comprehensive Exam' },
        attempt_count: 0,
      },
    ],
    exam_assignments: [
      {
        institution_id: 'inst-oak',
        exam_id: 'exam-midterm',
        target_type: 'section',
        class_id: null,
        class_section_id: 'csec-a',
        student_id: null,
      },
      {
        institution_id: 'inst-oak',
        exam_id: 'exam-midterm',
        target_type: 'student',
        class_id: null,
        class_section_id: null,
        student_id: 'sr-bob',
      },
      {
        institution_id: 'inst-oak',
        exam_id: 'exam-upcoming',
        target_type: 'class',
        class_id: 'cls-cs1',
        class_section_id: null,
        student_id: null,
      },
    ],
    exam_attempts: [],
    exam_attempt_answers: [],
  };
}

describe('Phase 6 Examination Engine — reliability, security & multi-student mock exam', () => {
  it('runs a full multi-student mock exam with refresh recovery, concurrency safety, deadline auto-submit, duplicate submit idempotency, and unauthorized isolation', async () => {
    const tables = createFixtureTables();
    const supabase = makeStatefulMockSupabase(tables);
    const tStart = Date.parse('2026-11-16T10:00:00.000Z');

    // 1. Unauthorized exam access checks
    // Charlie is a student in inst-oak Section B (not assigned to exam-midterm)
    const charlieDash = await loadStudentExamDashboard(supabase, 'u-charlie', 'inst-oak', tStart);
    expect(charlieDash.summary.eligibleCount).toBe(0);

    await expect(
      getStudentExamLobby(supabase, 'u-charlie', 'inst-oak', 'exam-midterm', tStart),
    ).rejects.toThrow(AuthorizationError);

    await expect(
      startOrResumeExamAttempt(supabase, 'u-charlie', 'inst-oak', 'exam-midterm', tStart),
    ).rejects.toThrow(AuthorizationError);

    // Teacher cannot enter student exam flow
    await expect(
      startOrResumeExamAttempt(supabase, 'u-teacher', 'inst-oak', 'exam-midterm', tStart),
    ).rejects.toThrow(AuthorizationError);

    // Cross-tenant student cannot access inst-oak exam
    await expect(
      startOrResumeExamAttempt(supabase, 'u-north', 'inst-oak', 'exam-midterm', tStart),
    ).rejects.toThrow(AuthorizationError);

    // 2. Alice sees Active (Midterm) + Upcoming (Final); Bob sees Active (Midterm)
    const aliceDash = await loadStudentExamDashboard(supabase, 'u-alice', 'inst-oak', tStart);
    expect(aliceDash.summary.activeCount).toBe(1);
    expect(aliceDash.summary.upcomingCount).toBe(1);
    expect(aliceDash.summary.completedCount).toBe(0);

    // Alice cannot start Upcoming exam before its starts_at window
    const upcomingLobby = await getStudentExamLobby(
      supabase,
      'u-alice',
      'inst-oak',
      'exam-upcoming',
      tStart,
    );
    expect(upcomingLobby.canStart).toBe(false);
    expect(upcomingLobby.blockReason).toMatch(/opens on/i);
    await expect(
      startOrResumeExamAttempt(supabase, 'u-alice', 'inst-oak', 'exam-upcoming', tStart),
    ).rejects.toThrow(AuthorizationError);

    // 3. Concurrent start protection (Alice double-clicks "Start Exam")
    const [aliceSessionA, aliceSessionB] = await Promise.all([
      startOrResumeExamAttempt(supabase, 'u-alice', 'inst-oak', 'exam-midterm', tStart),
      startOrResumeExamAttempt(supabase, 'u-alice', 'inst-oak', 'exam-midterm', tStart),
    ]);
    expect(aliceSessionA.attempt.id).toBe(aliceSessionB.attempt.id);
    expect(aliceSessionA.attempt.expiresAt).toBe('2026-11-16T11:00:00.000Z');
    expect(aliceSessionA.remainingSeconds).toBe(3600);

    // Ensure ZERO answer keys leaked to student payload
    const serialized = JSON.stringify(aliceSessionA.sections);
    expect(serialized).not.toContain('correct_option_keys');
    expect(serialized).not.toContain('sample_answer');
    expect(serialized).not.toContain('grading_rubric');
    expect(serialized).not.toContain('is_correct');

    // Bob starts at 10:15 via email-linked student record
    const bobStartMs = Date.parse('2026-11-16T10:15:00.000Z');
    const bobSession = await startOrResumeExamAttempt(
      supabase,
      'u-bob',
      'inst-oak',
      'exam-midterm',
      bobStartMs,
    );
    expect(bobSession.attempt.id).not.toBe(aliceSessionA.attempt.id);
    expect(bobSession.attempt.expiresAt).toBe('2026-11-16T11:15:00.000Z');

    // Bob cannot save answers onto Alice's attempt!
    await expect(
      saveExamAttemptAnswer(
        supabase,
        'u-bob',
        {
          institutionId: 'inst-oak',
          attemptId: aliceSessionA.attempt.id,
          questionId: 'q-mcq-1',
          selectedOptionKeys: ['A'],
        },
        bobStartMs,
      ),
    ).rejects.toThrow(AuthorizationError);

    // 4. Alice saves MCQ & descriptive answers, plus concurrent out-of-order stale save check
    const saveQ1 = await saveExamAttemptAnswer(
      supabase,
      'u-alice',
      {
        institutionId: 'inst-oak',
        attemptId: aliceSessionA.attempt.id,
        questionId: 'q-mcq-1',
        selectedOptionKeys: ['B'],
        clientUpdatedAt: '2026-11-16T10:02:00.000Z',
      },
      Date.parse('2026-11-16T10:02:00.000Z'),
    );
    expect(saveQ1.status).toBe('saved');
    if (saveQ1.status === 'saved') {
      expect(saveQ1.answeredCount).toBe(1);
    }

    // Invalid option key rejected
    await expect(
      saveExamAttemptAnswer(
        supabase,
        'u-alice',
        {
          institutionId: 'inst-oak',
          attemptId: aliceSessionA.attempt.id,
          questionId: 'q-mcq-1',
          selectedOptionKeys: ['Z_FORGED'],
        },
        Date.parse('2026-11-16T10:02:30.000Z'),
      ),
    ).rejects.toThrow(AuthorizationError);

    // Newer descriptive edit arrives first
    await saveExamAttemptAnswer(
      supabase,
      'u-alice',
      {
        institutionId: 'inst-oak',
        attemptId: aliceSessionA.attempt.id,
        questionId: 'q-desc-1',
        descriptiveText: 'Dijkstra assumes greedy edge relaxation is monotonic, which fails with negative weights.',
        isFlagged: true,
        clientUpdatedAt: '2026-11-16T10:05:10.000Z',
      },
      Date.parse('2026-11-16T10:05:10.000Z'),
    );

    // Delayed older request arrives out-of-order and must NOT overwrite newer text!
    const staleRes = await saveExamAttemptAnswer(
      supabase,
      'u-alice',
      {
        institutionId: 'inst-oak',
        attemptId: aliceSessionA.attempt.id,
        questionId: 'q-desc-1',
        descriptiveText: 'Dijkstra assumes greedy',
        clientUpdatedAt: '2026-11-16T10:05:02.000Z',
      },
      Date.parse('2026-11-16T10:05:12.000Z'),
    );
    expect(staleRes.status).toBe('saved');
    if (staleRes.status === 'saved') {
      expect(staleRes.staleIgnored).toBe(true);
      expect(staleRes.answer.descriptiveText).toContain('monotonic');
    }

    // 5. Browser refresh recovery preserves exact deterministic question order & saved answers
    const refreshTimeMs = Date.parse('2026-11-16T10:10:00.000Z');
    const aliceRefreshed = await startOrResumeExamAttempt(
      supabase,
      'u-alice',
      'inst-oak',
      'exam-midterm',
      refreshTimeMs,
    );
    expect(aliceRefreshed.attempt.id).toBe(aliceSessionA.attempt.id);
    expect(aliceRefreshed.remainingSeconds).toBe(3000);
    expect(aliceRefreshed.sections.map((s) => s.questions.map((q) => q.id))).toEqual(
      aliceSessionA.sections.map((s) => s.questions.map((q) => q.id)),
    );
    expect(aliceRefreshed.answers['q-mcq-1']?.selectedOptionKeys).toEqual(['B']);
    expect(aliceRefreshed.answers['q-desc-1']?.descriptiveText).toContain('monotonic');
    expect(aliceRefreshed.answers['q-desc-1']?.isFlagged).toBe(true);

    // 6. Manual Submission + Concurrent Duplicate Submission Idempotency
    const submitMs = Date.parse('2026-11-16T10:25:00.000Z');
    const [sub1, sub2] = await Promise.all([
      submitExamAttempt(
        supabase,
        'u-alice',
        { institutionId: 'inst-oak', attemptId: aliceSessionA.attempt.id, reason: 'manual' },
        submitMs,
      ),
      submitExamAttempt(
        supabase,
        'u-alice',
        { institutionId: 'inst-oak', attemptId: aliceSessionA.attempt.id, reason: 'manual' },
        submitMs + 50,
      ),
    ]);
    expect(sub1.attempt.status).toBe('submitted');
    expect(sub2.attempt.status).toBe('submitted');
    expect(sub1.alreadySubmitted || sub2.alreadySubmitted).toBe(true);
    expect((tables['exam_attempts'] ?? []).filter((a) => a['student_id'] === 'sr-alice')).toHaveLength(1);

    // Sequential duplicate submit also returns idempotently with same timestamp
    const sub3 = await submitExamAttempt(
      supabase,
      'u-alice',
      { institutionId: 'inst-oak', attemptId: aliceSessionA.attempt.id, reason: 'manual' },
      submitMs + 5000,
    );
    expect(sub3.alreadySubmitted).toBe(true);
    expect(sub3.attempt.submittedAt).toBe('2026-11-16T10:25:00.000Z');

    // Editing answers after submission is strictly blocked (409)
    await expect(
      saveExamAttemptAnswer(
        supabase,
        'u-alice',
        {
          institutionId: 'inst-oak',
          attemptId: aliceSessionA.attempt.id,
          questionId: 'q-mcq-1',
          selectedOptionKeys: ['A'],
        },
        submitMs + 10_000,
      ),
    ).rejects.toThrow(AuthorizationError);

    // 7. Deadline Expiry & Server-Enforced Auto-Submission for Bob
    // Bob saves Q1 at 10:20, then disconnects until 11:20 (5 minutes PAST his 11:15 deadline!)
    await saveExamAttemptAnswer(
      supabase,
      'u-bob',
      {
        institutionId: 'inst-oak',
        attemptId: bobSession.attempt.id,
        questionId: 'q-mcq-2',
        selectedOptionKeys: ['A', 'B'],
      },
      Date.parse('2026-11-16T10:20:00.000Z'),
    );

    const lateMs = Date.parse('2026-11-16T11:20:00.000Z');
    const lateSave = await saveExamAttemptAnswer(
      supabase,
      'u-bob',
      {
        institutionId: 'inst-oak',
        attemptId: bobSession.attempt.id,
        questionId: 'q-mcq-1',
        selectedOptionKeys: ['C'],
      },
      lateMs,
    );
    expect(lateSave.status).toBe('expired_auto_submitted');
    if (lateSave.status === 'expired_auto_submitted') {
      expect(lateSave.attempt.status).toBe('auto_submitted');
      expect(lateSave.attempt.submittedAt).toBe('2026-11-16T11:15:00.000Z');
      expect(lateSave.attempt.answeredCount).toBe(1); // Q2 preserved, late Q1 rejected!
    }

    // Heartbeat after auto-submit continues returning sealed attempt & 0s remaining
    const hbAfter = await heartbeatExamAttempt(
      supabase,
      'u-bob',
      'inst-oak',
      bobSession.attempt.id,
      lateMs + 2000,
    );
    expect(hbAfter.remainingSeconds).toBe(0);
    expect(hbAfter.attempt.status).toBe('auto_submitted');

    // Dashboard now marks Midterm as completed for both Alice and Bob
    const bobDashAfter = await loadStudentExamDashboard(supabase, 'u-bob', 'inst-oak', lateMs);
    expect(bobDashAfter.summary.completedCount).toBe(1);
    expect(bobDashAfter.exams.find((e) => e.examId === 'exam-midterm')?.attempt?.status).toBe(
      'auto_submitted',
    );
  });
});
