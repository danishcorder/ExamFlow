import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamTakingWorkspace } from '@/components/app/exam-taking-workspace';
import { StudentExamDashboard } from '@/components/app/student-exam-dashboard';
import type { Database } from '@/integrations/supabase/types';
import type {
  ExamAttemptSessionData,
  StudentExamDashboardData,
  StudentExamLobbyData,
} from '@/lib/exam-engine.shared';

const getLobbyMock = vi.fn();
const startOrResumeMock = vi.fn();
const saveAnswerMock = vi.fn();
const submitAttemptMock = vi.fn();
const heartbeatMock = vi.fn();

vi.mock('@/lib/exam-engine.functions', () => ({
  getStudentExamDashboardFn: vi.fn(),
  getStudentExamLobbyFn: (...args: unknown[]) => getLobbyMock(...args),
  startOrResumeExamAttemptFn: (...args: unknown[]) => startOrResumeMock(...args),
  saveExamAttemptAnswerFn: (...args: unknown[]) => saveAnswerMock(...args),
  submitExamAttemptFn: (...args: unknown[]) => submitAttemptMock(...args),
  heartbeatExamAttemptFn: (...args: unknown[]) => heartbeatMock(...args),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-alice', email: 'alice@oakridge.edu' },
    activeInstitutionId: 'inst-oak',
    authHeaders: () => ({ Authorization: 'Bearer stu-token' }),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const makeLobby = (overrides?: Partial<StudentExamLobbyData>): StudentExamLobbyData => ({
  serverNow: new Date().toISOString(),
  exam: {
    examId: 'exam-midterm',
    versionId: 'ver-1',
    versionNumber: 1,
    title: 'Algorithms Midterm',
    description: 'Sorting, trees, and shortest paths',
    instructions: 'Read every question carefully. No calculators permitted.',
    courseCode: 'CS101',
    courseTitle: 'Algorithms',
    startsAt: new Date(Date.now() - 600_000).toISOString(),
    endsAt: new Date(Date.now() + 7_200_000).toISOString(),
    durationMinutes: 60,
    totalMarks: 12,
    passingMarks: 6,
    passingPercentage: 50,
    negativeMarkingEnabled: true,
    defaultNegativeMarks: 0.5,
    shuffleQuestions: false,
    shuffleOptions: false,
    sectionCount: 2,
    totalQuestions: 2,
    examStatus: 'published',
  },
  attempt: null,
  canStart: true,
  canResume: false,
  isCompleted: false,
  blockReason: null,
  remainingSeconds: 0,
  ...overrides,
});

const makeSession = (overrides?: Partial<ExamAttemptSessionData>): ExamAttemptSessionData => {
  const now = Date.now();
  return {
    serverNow: new Date(now).toISOString(),
    remainingSeconds: 3600,
    exam: makeLobby().exam,
    attempt: {
      id: 'att-alice-1',
      institutionId: 'inst-oak',
      examId: 'exam-midterm',
      examVersionId: 'ver-1',
      studentId: 'sr-alice',
      status: 'in_progress',
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
      submittedAt: null,
      submissionReason: null,
      lastSavedAt: null,
      answeredCount: 0,
      totalQuestions: 2,
    },
    sections: [
      {
        id: 'sec-1',
        title: 'Part A — MCQ',
        description: null,
        section_type: 'mcq',
        sort_order: 0,
        shuffle_questions: false,
        sectionTotalMarks: 2,
        questions: [
          {
            id: 'q-mcq-1',
            question_id: 'q-mcq-1',
            section_question_id: 'sq-1',
            sort_order: 0,
            question_type: 'mcq_single',
            title: 'Binary Search Runtime',
            prompt: 'What is the worst-case runtime of binary search?',
            topic: 'Searching',
            category: 'Algorithms',
            difficulty: 'easy',
            expected_word_count: null,
            effective_marks: 2,
            effective_negative_marks: 0.5,
            options: [
              { id: 'o1', option_key: 'A', option_text: 'O(1)', sort_order: 0 },
              { id: 'o2', option_key: 'B', option_text: 'O(log n)', sort_order: 1 },
            ],
            attachments: [],
          },
        ],
      },
      {
        id: 'sec-2',
        title: 'Part B — Written',
        description: null,
        section_type: 'descriptive',
        sort_order: 1,
        shuffle_questions: false,
        sectionTotalMarks: 10,
        questions: [
          {
            id: 'q-desc-1',
            question_id: 'q-desc-1',
            section_question_id: 'sq-2',
            sort_order: 0,
            question_type: 'descriptive',
            title: 'Heap Property',
            prompt: 'Describe how max-heapify restores the heap invariant.',
            topic: 'Heaps',
            category: 'Data Structures',
            difficulty: 'medium',
            expected_word_count: 100,
            effective_marks: 10,
            effective_negative_marks: 0,
            options: [],
            attachments: [],
          },
        ],
      },
    ],
    answers: {},
    ...overrides,
  };
};

describe('Phase 6 Student Examination UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    getLobbyMock.mockReset();
    startOrResumeMock.mockReset();
    saveAnswerMock.mockReset();
    submitAttemptMock.mockReset();
    heartbeatMock.mockReset();
    heartbeatMock.mockResolvedValue({
      serverNow: new Date().toISOString(),
      remainingSeconds: 3500,
      attempt: makeSession().attempt,
    });
  });

  it('renders StudentExamDashboard with active, upcoming, and completed buckets plus search filtering', () => {
    const sampleDash: StudentExamDashboardData = {
      serverNow: '2026-11-16T10:00:00.000Z',
      student: {
        studentId: 'sr-alice',
        studentCode: 'STU-001',
        fullName: 'Alice Student',
        email: 'alice@oakridge.edu',
      },
      summary: {
        eligibleCount: 3,
        activeCount: 1,
        inProgressCount: 0,
        upcomingCount: 1,
        completedCount: 1,
      },
      exams: [
        {
          examId: 'ex-active',
          versionId: 'v1',
          versionNumber: 1,
          title: 'Algorithms Midterm',
          description: null,
          courseId: 'c1',
          courseCode: 'CS101',
          courseTitle: 'Algorithms',
          startsAt: '2026-11-16T09:00:00.000Z',
          endsAt: '2026-11-16T12:00:00.000Z',
          durationMinutes: 60,
          totalMarks: 50,
          passingMarks: 25,
          passingPercentage: 50,
          negativeMarkingEnabled: false,
          defaultNegativeMarks: 0,
          totalQuestions: 10,
          sectionCount: 1,
          examStatus: 'published',
          bucket: 'active',
          eligibilityReason: 'section',
          attempt: null,
        },
        {
          examId: 'ex-upcoming',
          versionId: 'v2',
          versionNumber: 1,
          title: 'Databases Final',
          description: null,
          courseId: 'c2',
          courseCode: 'CS202',
          courseTitle: 'Databases',
          startsAt: '2026-12-01T09:00:00.000Z',
          endsAt: '2026-12-01T12:00:00.000Z',
          durationMinutes: 90,
          totalMarks: 100,
          passingMarks: 50,
          passingPercentage: 50,
          negativeMarkingEnabled: false,
          defaultNegativeMarks: 0,
          totalQuestions: 20,
          sectionCount: 2,
          examStatus: 'published',
          bucket: 'upcoming',
          eligibilityReason: 'class',
          attempt: null,
        },
        {
          examId: 'ex-completed',
          versionId: 'v3',
          versionNumber: 1,
          title: 'Discrete Math Quiz',
          description: null,
          courseId: 'c3',
          courseCode: 'MTH101',
          courseTitle: 'Discrete Math',
          startsAt: '2026-11-10T09:00:00.000Z',
          endsAt: '2026-11-10T10:00:00.000Z',
          durationMinutes: 30,
          totalMarks: 20,
          passingMarks: 10,
          passingPercentage: 50,
          negativeMarkingEnabled: false,
          defaultNegativeMarks: 0,
          totalQuestions: 5,
          sectionCount: 1,
          examStatus: 'closed',
          bucket: 'completed',
          eligibilityReason: 'student',
          attempt: {
            id: 'att-prev',
            status: 'submitted',
            startedAt: '2026-11-10T09:05:00.000Z',
            expiresAt: '2026-11-10T09:35:00.000Z',
            submittedAt: '2026-11-10T09:32:00.000Z',
            submissionReason: 'manual',
            lastSavedAt: '2026-11-10T09:31:00.000Z',
            answeredCount: 5,
            totalQuestions: 5,
            remainingSeconds: 0,
          },
        },
      ],
    };

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <StudentExamDashboard dataOverride={sampleDash} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Algorithms Midterm')).toBeInTheDocument();
    expect(screen.getByText('Databases Final')).toBeInTheDocument();
    expect(screen.getByText('Discrete Math Quiz')).toBeInTheDocument();

    const completedTab = screen.getByRole('tab', { name: /Completed \(1\)/i });
    fireEvent.mouseDown(completedTab, { button: 0 });
    fireEvent.click(completedTab);
    expect(screen.getByText('Discrete Math Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Algorithms Midterm')).not.toBeInTheDocument();

    const allTab = screen.getByRole('tab', { name: /All \(3\)/i });
    fireEvent.mouseDown(allTab, { button: 0 });
    fireEvent.click(allTab);
    fireEvent.change(screen.getByLabelText('Search student exams'), {
      target: { value: 'Databases' },
    });
    expect(screen.getByText('Databases Final')).toBeInTheDocument();
    expect(screen.queryByText('Algorithms Midterm')).not.toBeInTheDocument();
  });

  it('fetches and categorizes assigned exams (upcoming, active, completed) via the Supabase client', async () => {
    const now = Date.now();
    const tables: Record<string, Array<Record<string, unknown>>> = {
      institution_memberships: [
        {
          id: 'mem-alice',
          institution_id: 'inst-oak',
          user_id: 'u-alice',
          role: 'student',
          status: 'active',
        },
      ],
      student_records: [
        {
          id: 'sr-alice',
          institution_id: 'inst-oak',
          student_code: 'STU-101',
          full_name: 'Alice Student',
          email: 'alice@oakridge.edu',
          membership_id: 'mem-alice',
          status: 'active',
        },
      ],
      student_enrollments: [
        {
          id: 'enr-1',
          institution_id: 'inst-oak',
          student_id: 'sr-alice',
          class_section_id: 'sec-a',
          status: 'enrolled',
        },
      ],
      class_sections: [{ id: 'sec-a', institution_id: 'inst-oak', class_id: 'cls-cs' }],
      exams: [
        {
          id: 'ex-active-supa',
          institution_id: 'inst-oak',
          status: 'published',
          latest_published_version_id: 'ver-active',
          starts_at: new Date(now - 900_000).toISOString(),
        },
        {
          id: 'ex-upcoming-supa',
          institution_id: 'inst-oak',
          status: 'published',
          latest_published_version_id: 'ver-upcoming',
          starts_at: new Date(now + 86_400_000).toISOString(),
        },
        {
          id: 'ex-completed-supa',
          institution_id: 'inst-oak',
          status: 'published',
          latest_published_version_id: 'ver-completed',
          starts_at: new Date(now - 7_200_000).toISOString(),
        },
        {
          id: 'ex-unassigned-supa',
          institution_id: 'inst-oak',
          status: 'published',
          latest_published_version_id: 'ver-unassigned',
          starts_at: new Date(now - 900_000).toISOString(),
        },
      ],
      exam_assignments: [
        {
          institution_id: 'inst-oak',
          exam_id: 'ex-active-supa',
          target_type: 'section',
          class_id: null,
          class_section_id: 'sec-a',
          student_id: null,
        },
        {
          institution_id: 'inst-oak',
          exam_id: 'ex-upcoming-supa',
          target_type: 'class',
          class_id: 'cls-cs',
          class_section_id: null,
          student_id: null,
        },
        {
          institution_id: 'inst-oak',
          exam_id: 'ex-completed-supa',
          target_type: 'student',
          class_id: null,
          class_section_id: null,
          student_id: 'sr-alice',
        },
        {
          institution_id: 'inst-oak',
          exam_id: 'ex-unassigned-supa',
          target_type: 'section',
          class_id: null,
          class_section_id: 'sec-other',
          student_id: null,
        },
      ],
      exam_versions: [
        {
          id: 'ver-active',
          institution_id: 'inst-oak',
          exam_id: 'ex-active-supa',
          version_number: 1,
          title: 'Operating Systems Live Quiz',
          description: 'Processes & threads',
          course_id: 'c-os',
          course_code: 'CS301',
          course_title: 'Operating Systems',
          starts_at: new Date(now - 900_000).toISOString(),
          ends_at: new Date(now + 3_600_000).toISOString(),
          duration_minutes: 45,
          total_marks: 30,
          passing_marks: 15,
          passing_percentage: 50,
          negative_marking_enabled: false,
          default_negative_marks: 0,
          snapshot_payload: { sections: [{ questions: [{ id: 'q1' }, { id: 'q2' }] }] },
        },
        {
          id: 'ver-upcoming',
          institution_id: 'inst-oak',
          exam_id: 'ex-upcoming-supa',
          version_number: 1,
          title: 'Distributed Systems Midterm',
          description: 'Consensus & replication',
          course_id: 'c-ds',
          course_code: 'CS410',
          course_title: 'Distributed Systems',
          starts_at: new Date(now + 86_400_000).toISOString(),
          ends_at: new Date(now + 90_000_000).toISOString(),
          duration_minutes: 60,
          total_marks: 50,
          passing_marks: 25,
          passing_percentage: 50,
          negative_marking_enabled: false,
          default_negative_marks: 0,
          snapshot_payload: { sections: [{ questions: [{ id: 'q3' }] }] },
        },
        {
          id: 'ver-completed',
          institution_id: 'inst-oak',
          exam_id: 'ex-completed-supa',
          version_number: 1,
          title: 'Computer Networks Diagnostic',
          description: 'TCP/IP fundamentals',
          course_id: 'c-net',
          course_code: 'CS220',
          course_title: 'Networks',
          starts_at: new Date(now - 7_200_000).toISOString(),
          ends_at: new Date(now + 3_600_000).toISOString(),
          duration_minutes: 30,
          total_marks: 20,
          passing_marks: 10,
          passing_percentage: 50,
          negative_marking_enabled: false,
          default_negative_marks: 0,
          snapshot_payload: { sections: [{ questions: [{ id: 'q4' }] }] },
        },
        {
          id: 'ver-unassigned',
          institution_id: 'inst-oak',
          exam_id: 'ex-unassigned-supa',
          version_number: 1,
          title: 'Other Cohort Chemistry Exam',
          description: null,
          course_id: null,
          course_code: 'CHM101',
          course_title: 'Chemistry',
          starts_at: new Date(now - 900_000).toISOString(),
          ends_at: new Date(now + 3_600_000).toISOString(),
          duration_minutes: 30,
          total_marks: 20,
          passing_marks: 10,
          passing_percentage: 50,
          negative_marking_enabled: false,
          default_negative_marks: 0,
          snapshot_payload: { sections: [{ questions: [{ id: 'q5' }] }] },
        },
      ],
      exam_attempts: [
        {
          id: 'att-done-1',
          institution_id: 'inst-oak',
          exam_id: 'ex-completed-supa',
          exam_version_id: 'ver-completed',
          student_id: 'sr-alice',
          status: 'submitted',
          started_at: new Date(now - 5_000_000).toISOString(),
          expires_at: new Date(now - 3_200_000).toISOString(),
          submitted_at: new Date(now - 3_500_000).toISOString(),
          submission_reason: 'manual',
          last_saved_at: new Date(now - 3_500_000).toISOString(),
          answered_count: 1,
          total_questions: 1,
        },
      ],
    };

    const mockSupabase = {
      from: (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const exec = async () => ({
          data: (tables[table] ?? []).filter((row) => filters.every((fn) => fn(row))),
          error: null,
        });
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters.push((row) => row[col] === val);
            return builder;
          },
          in: (col: string, vals: unknown[]) => {
            filters.push((row) => vals.includes(row[col]));
            return builder;
          },
          order: () => builder,
          maybeSingle: async () => {
            const res = await exec();
            return { data: res.data[0] ?? null, error: null };
          },
          then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => exec().then(res, rej),
        };
        return builder;
      },
    } as unknown as SupabaseClient<Database>;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StudentExamDashboard supabaseClient={mockSupabase} />
      </QueryClientProvider>,
    );

    await screen.findByText('Operating Systems Live Quiz');
    expect(screen.getByText('Distributed Systems Midterm')).toBeInTheDocument();
    expect(screen.getByText('Computer Networks Diagnostic')).toBeInTheDocument();
    expect(screen.queryByText('Other Cohort Chemistry Exam')).not.toBeInTheDocument();

    // Filter to Upcoming tab
    const upcomingTab = screen.getByRole('tab', { name: /Upcoming \(1\)/i });
    fireEvent.mouseDown(upcomingTab, { button: 0 });
    fireEvent.click(upcomingTab);
    expect(screen.getByText('Distributed Systems Midterm')).toBeInTheDocument();
    expect(screen.queryByText('Operating Systems Live Quiz')).not.toBeInTheDocument();

    // Filter to Active tab
    const activeTab = screen.getByRole('tab', { name: /Active \(1\)/i });
    fireEvent.mouseDown(activeTab, { button: 0 });
    fireEvent.click(activeTab);
    expect(screen.getByText('Operating Systems Live Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Computer Networks Diagnostic')).not.toBeInTheDocument();

    // Filter to Completed tab
    const completedTab = screen.getByRole('tab', { name: /Completed \(1\)/i });
    fireEvent.mouseDown(completedTab, { button: 0 });
    fireEvent.click(completedTab);
    expect(screen.getByText('Computer Networks Diagnostic')).toBeInTheDocument();
    expect(screen.queryByText('Distributed Systems Midterm')).not.toBeInTheDocument();
  });

  it('requires start confirmation, saves MCQ/descriptive, handles offline disconnection & refresh recovery, and confirms manual submission', async () => {
    const lobby = makeLobby();
    const session = makeSession();

    getLobbyMock.mockResolvedValue(lobby);
    startOrResumeMock.mockResolvedValue(session);

    // First MCQ save succeeds
    saveAnswerMock.mockResolvedValueOnce({
      status: 'saved',
      serverNow: new Date().toISOString(),
      remainingSeconds: 3590,
      answeredCount: 1,
      staleIgnored: false,
      answer: {
        id: 'ans-1',
        attemptId: session.attempt.id,
        questionId: 'q-mcq-1',
        sectionId: 'sec-1',
        questionType: 'mcq_single',
        selectedOptionKeys: ['B'],
        descriptiveText: null,
        isFlagged: false,
        clientUpdatedAt: new Date().toISOString(),
        revision: 1,
        savedAt: new Date().toISOString(),
      },
    });

    const { unmount } = render(<ExamTakingWorkspace examId="exam-midterm" />);

    // Lobby instructions visible, Start disabled until attested
    await screen.findByText(/Read every question carefully/i);
    const startBtn = screen.getByRole('button', { name: /Confirm & Start Exam/i });
    expect(startBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(startBtn).toBeEnabled();
    fireEvent.click(startBtn);

    // Active workspace loads Question 1 (MCQ)
    await screen.findByText('Binary Search Runtime');
    expect(screen.getByRole('timer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /O\(log n\)/i }));
    await waitFor(() => expect(saveAnswerMock).toHaveBeenCalledTimes(1));

    // Move to Question 2 (Descriptive) and simulate network failure during save
    fireEvent.click(screen.getByRole('button', { name: /Next Question/i }));
    await screen.findByText('Heap Property');

    saveAnswerMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    fireEvent.change(screen.getByLabelText(/Your written response/i), {
      target: { value: 'Max-heapify swaps parent with larger child recursively.' },
    });
    fireEvent.blur(screen.getByLabelText(/Your written response/i));

    await waitFor(() =>
      expect(screen.getByText(/Connection interrupted/i)).toBeInTheDocument(),
    );

    // Verify unsynced descriptive edit was safely cached in localStorage
    const cachedRaw = window.localStorage.getItem(`examflow:attempt-draft:${session.attempt.id}`);
    expect(cachedRaw).toContain('Max-heapify swaps parent');

    // Simulate browser refresh: unmount and remount while server resumes attempt
    unmount();

    const resumedLobby = makeLobby({ canStart: false, canResume: true });
    const resumedSession = makeSession({
      answers: {
        'q-mcq-1': {
          id: 'ans-1',
          attemptId: session.attempt.id,
          questionId: 'q-mcq-1',
          sectionId: 'sec-1',
          questionType: 'mcq_single',
          selectedOptionKeys: ['B'],
          descriptiveText: null,
          isFlagged: false,
          clientUpdatedAt: new Date(Date.now() - 10_000).toISOString(),
          revision: 1,
          savedAt: new Date(Date.now() - 10_000).toISOString(),
        },
      },
    });
    getLobbyMock.mockResolvedValue(resumedLobby);
    startOrResumeMock.mockResolvedValue(resumedSession);
    saveAnswerMock.mockResolvedValue({
      status: 'saved',
      serverNow: new Date().toISOString(),
      remainingSeconds: 3500,
      answeredCount: 2,
      staleIgnored: false,
      answer: {
        id: 'ans-2',
        attemptId: session.attempt.id,
        questionId: 'q-desc-1',
        sectionId: 'sec-2',
        questionType: 'descriptive',
        selectedOptionKeys: [],
        descriptiveText: 'Max-heapify swaps parent with larger child recursively.',
        isFlagged: false,
        clientUpdatedAt: new Date().toISOString(),
        revision: 1,
        savedAt: new Date().toISOString(),
      },
    });

    render(<ExamTakingWorkspace examId="exam-midterm" />);

    // Automatically resumes and replays the unsynced descriptive draft to server! (1st MCQ + 2nd failed offline + 3rd replay)
    await screen.findByText('Binary Search Runtime');
    await waitFor(() => expect(saveAnswerMock).toHaveBeenCalledTimes(3));
    expect(saveAnswerMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          questionId: 'q-desc-1',
          descriptiveText: 'Max-heapify swaps parent with larger child recursively.',
        }),
      }),
    );

    // Navigate to Q2 and confirm recovered text is still present
    fireEvent.click(screen.getByRole('button', { name: /Question 2, answered/i }));
    expect(screen.getByLabelText(/Your written response/i)).toHaveValue(
      'Max-heapify swaps parent with larger child recursively.',
    );

    // Manual submission with confirmation dialog
    submitAttemptMock.mockResolvedValue({
      serverNow: new Date().toISOString(),
      alreadySubmitted: false,
      attempt: {
        ...session.attempt,
        status: 'submitted',
        submittedAt: '2026-11-16T10:30:00.000Z',
        submissionReason: 'manual',
        answeredCount: 2,
      },
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Review & Submit/i })[0]!);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /Confirm Final Submission/i }));

    await screen.findByText('Examination Submitted');
    expect(screen.getByText('att-alice-1')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('auto-transitions to sealed receipt when server enforces deadline expiry on save', async () => {
    const resumedSession = makeSession();
    getLobbyMock.mockResolvedValue(makeLobby({ canStart: false, canResume: true }));
    startOrResumeMock.mockResolvedValue(resumedSession);

    saveAnswerMock.mockResolvedValueOnce({
      status: 'expired_auto_submitted',
      serverNow: new Date().toISOString(),
      remainingSeconds: 0,
      attempt: {
        ...resumedSession.attempt,
        status: 'auto_submitted',
        submittedAt: resumedSession.attempt.expiresAt,
        submissionReason: 'deadline_auto_submit',
        answeredCount: 1,
      },
    });

    render(<ExamTakingWorkspace examId="exam-midterm" />);
    await screen.findByText('Binary Search Runtime');

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: /O\(log n\)/i }));
    });

    await screen.findByText('Exam Auto-Submitted at Deadline');
    expect(screen.getByText(/Auto-submitted \(Deadline enforced\)/i)).toBeInTheDocument();
  });
});
