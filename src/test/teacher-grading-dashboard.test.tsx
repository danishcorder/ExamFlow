import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherGradingDashboard } from '@/components/app/teacher-grading-dashboard';
import * as gradingFunctions from '@/lib/grading.functions';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'teacher-1', email: 'teacher@oakridge.edu' },
    activeInstitutionId: 'inst-1',
    authHeaders: () => ({ Authorization: 'Bearer test-token' }),
  }),
}));

const mockDashboardData = {
  exam: {
    examId: 'ex-1',
    title: 'Biology Midterm Examination',
    courseCode: 'BIO101',
    courseTitle: 'General Biology',
    totalMarks: 50,
    passingMarks: 25,
    passingPercentage: 50,
    negativeMarkingEnabled: true,
    defaultNegativeMarks: 1,
  },
  summary: {
    totalAttempts: 2,
    submittedCount: 2,
    gradedCount: 1,
    publishedCount: 1,
    averageScore: 35,
    averagePercentage: 70,
  },
  attempts: [
    {
      attemptId: 'att-1',
      studentId: 'stu-1',
      studentCode: 'BIO-001',
      studentFullName: 'Alice Walker',
      studentEmail: 'alice@student.edu',
      status: 'submitted',
      startedAt: '2026-11-16T10:00:00Z',
      submittedAt: '2026-11-16T11:00:00Z',
      gradeStatus: 'draft',
      totalAwardedMarks: 30,
      maxPossibleMarks: 50,
      percentage: 60,
      isPassing: true,
      gradedQuestionsCount: 2,
      totalQuestions: 2,
    },
    {
      attemptId: 'att-2',
      studentId: 'stu-2',
      studentCode: 'BIO-002',
      studentFullName: 'Bob Vance',
      studentEmail: 'bob@student.edu',
      status: 'submitted',
      startedAt: '2026-11-16T10:05:00Z',
      submittedAt: '2026-11-16T11:05:00Z',
      gradeStatus: 'published',
      totalAwardedMarks: 40,
      maxPossibleMarks: 50,
      percentage: 80,
      isPassing: true,
      gradedQuestionsCount: 2,
      totalQuestions: 2,
    },
  ],
};

const mockAttemptDetail = {
  attemptId: 'att-1',
  examId: 'ex-1',
  examTitle: 'Biology Midterm Examination',
  studentId: 'stu-1',
  studentCode: 'BIO-001',
  studentFullName: 'Alice Walker',
  status: 'submitted',
  startedAt: '2026-11-16T10:00:00Z',
  submittedAt: '2026-11-16T11:00:00Z',
  totalAwardedMarks: 30,
  maxPossibleMarks: 50,
  percentage: 60,
  isPassing: true,
  gradeStatus: 'draft',
  teacherNotes: null,
  questions: [
    {
      questionId: 'q-mcq-1',
      sectionTitle: 'Section 1: General Genetics',
      questionTitle: 'Mendelian Ratio',
      prompt: 'What is the phenotypic ratio in a monohybrid cross?',
      questionType: 'mcq_single' as const,
      maxMarks: 10,
      awardedMarks: 10,
      negativeDeduction: 0,
      isCorrect: true,
      options: [
        { optionKey: 'A', optionText: '1:1' },
        { optionKey: 'B', optionText: '3:1' },
      ],
      selectedOptionKeys: ['B'],
      correctOptionKeys: ['B'],
      descriptiveText: null,
      sampleAnswer: null,
      gradingRubric: null,
      teacherFeedback: null,
      rubricBreakdown: {},
    },
    {
      questionId: 'q-desc-1',
      sectionTitle: 'Section 2: Extended Responses',
      questionTitle: 'Cellular Respiration Pathways',
      prompt: 'Explain the role of ATP synthase in oxidative phosphorylation.',
      questionType: 'descriptive' as const,
      maxMarks: 20,
      awardedMarks: 15,
      negativeDeduction: 0,
      isCorrect: null,
      options: [],
      selectedOptionKeys: [],
      correctOptionKeys: [],
      descriptiveText:
        'ATP synthase harnesses the electrochemical proton gradient across the inner mitochondrial membrane to synthesize ATP from ADP and inorganic phosphate.',
      sampleAnswer: 'Should mention chemiosmosis, proton motive force, and rotor mechanics.',
      gradingRubric: 'Full marks (20) for mechanism and gradient details.',
      teacherFeedback: 'Great explanation of proton motive force.',
      rubricBreakdown: {},
    },
  ],
};

describe('TeacherGradingDashboard Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    vi.restoreAllMocks();

    vi.spyOn(gradingFunctions, 'getTeacherExamGradingDashboardFn').mockResolvedValue(
      mockDashboardData as any,
    );
    vi.spyOn(gradingFunctions, 'getTeacherAttemptGradingDetailFn').mockResolvedValue(
      mockAttemptDetail as any,
    );
  });

  function renderDashboard() {
    return render(
      <QueryClientProvider client={queryClient}>
        <TeacherGradingDashboard institutionId="inst-1" examId="ex-1" />
      </QueryClientProvider>,
    );
  }

  it('renders submissions ledger, KPI stat cards, and student records', async () => {
    renderDashboard();

    expect(await screen.findByText('Biology Midterm Examination')).toBeInTheDocument();
    expect(screen.getByText('Alice Walker')).toBeInTheDocument();
    expect(screen.getByText('Bob Vance')).toBeInTheDocument();
    expect(screen.getByText(/BIO-001/)).toBeInTheDocument();
    expect(screen.getByText(/BIO-002/)).toBeInTheDocument();
    expect(screen.getByText('Total Submissions')).toBeInTheDocument();
    expect(screen.getByText('Average Score')).toBeInTheDocument();
  });

  it('filters submissions by search input', async () => {
    renderDashboard();

    expect(await screen.findByText('Alice Walker')).toBeInTheDocument();
    const searchInput = screen.getByPlaceholderText(/Search student code or name/i);
    fireEvent.change(searchInput, { target: { value: 'Bob' } });

    expect(screen.queryByText('Alice Walker')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Vance')).toBeInTheDocument();
  });

  it('opens dedicated grading modal, displays descriptive answer and allows saving feedback', async () => {
    const saveSpy = vi
      .spyOn(gradingFunctions, 'saveManualQuestionGradeFn')
      .mockResolvedValue(undefined as any);

    renderDashboard();

    expect(await screen.findByText('Alice Walker')).toBeInTheDocument();
    const gradeButtons = screen.getAllByRole('button', { name: /Grade \/ Evaluate/i });
    fireEvent.click(gradeButtons[0]!);

    // Check modal contents
    expect(await screen.findByText(/Grading: Alice Walker/i)).toBeInTheDocument();
    expect(screen.getByText('Cellular Respiration Pathways')).toBeInTheDocument();
    expect(
      screen.getByText(/ATP synthase harnesses the electrochemical proton gradient/i),
    ).toBeInTheDocument();

    // Check MCQ view
    expect(screen.getByText('Mendelian Ratio')).toBeInTheDocument();
    expect(screen.getByText(/Candidate Choice/i)).toBeInTheDocument();

    // Find save grade button
    const saveButton = screen.getByRole('button', { name: /Save Grade & Feedback/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            institutionId: 'inst-1',
            attemptId: 'att-1',
            questionId: 'q-desc-1',
          }),
        }),
      );
    });
  });

  it('publishes all results when publish all button is clicked', async () => {
    const publishSpy = vi
      .spyOn(gradingFunctions, 'publishExamResultsFn')
      .mockResolvedValue(2 as any);

    renderDashboard();

    expect(await screen.findByText('Publish All Results')).toBeInTheDocument();
    const publishButton = screen.getByRole('button', { name: /Publish All Results/i });
    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { institutionId: 'inst-1', examId: 'ex-1' },
        }),
      );
    });
  });
});
