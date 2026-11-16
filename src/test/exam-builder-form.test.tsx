import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamBuilderForm } from '@/components/app/exam-builder-form';
import type { ExamBuilderCatalog, ExamDetail } from '@/lib/exams.server';

const createExamDraftMock = vi.fn();
const updateExamDraftMock = vi.fn();

vi.mock('@/lib/exams.functions', () => ({
  createExamDraftFn: (...args: unknown[]) => createExamDraftMock(...args),
  updateExamDraftFn: (...args: unknown[]) => updateExamDraftMock(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const sampleCatalog: ExamBuilderCatalog = {
  courses: [
    { id: 'c-cs101', code: 'CS101', title: 'Algorithms', status: 'active' },
    { id: 'c-math', code: 'MTH201', title: 'Linear Algebra', status: 'active' },
  ],
  sessions: [
    { id: 'sess-2026', name: '2026-2027', code: 'AY26', is_current: true },
  ],
  terms: [
    { id: 'term-fall', session_id: 'sess-2026', name: 'Fall Term', is_current: true },
  ],
  classes: [],
  sections: [],
  students: [],
  questionSets: [],
};

const makeExamDetail = (overrides?: Partial<ExamDetail['exam']>): ExamDetail => ({
  exam: {
    id: 'ex-101',
    institution_id: 'inst-oak',
    course_id: 'c-cs101',
    courseCode: 'CS101',
    courseTitle: 'Algorithms',
    academic_session_id: 'sess-2026',
    sessionName: '2026-2027',
    academic_term_id: 'term-fall',
    termName: 'Fall Term',
    title: 'Algorithms Midterm',
    description: 'Covers trees, graphs, and dynamic programming',
    instructions: 'Answer all sections. No external notes allowed.',
    starts_at: '2026-12-01T09:00:00.000Z',
    ends_at: '2026-12-01T12:00:00.000Z',
    duration_minutes: 90,
    total_marks: 100,
    passing_marks: 40,
    passing_percentage: 40,
    negative_marking_enabled: true,
    default_negative_marks: 0.25,
    shuffle_questions: true,
    shuffle_options: false,
    status: 'draft',
    current_version_number: 0,
    latest_published_version_id: null,
    published_at: null,
    closed_at: null,
    sectionCount: 1,
    questionCount: 10,
    assignmentCount: 2,
    totalAttempts: 0,
    isLockedByAttempts: false,
    created_by: 'user-teacher',
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  },
  sections: [],
  assignments: [],
  versions: [],
});

describe('ExamBuilderForm multi-step wizard', () => {
  beforeEach(() => {
    createExamDraftMock.mockReset();
    updateExamDraftMock.mockReset();
  });

  it('validates each step and creates a new exam draft via createExamDraftFn', async () => {
    const createdDetail = makeExamDetail({ id: 'ex-created', title: 'Systems Final Exam' });
    createExamDraftMock.mockResolvedValue(createdDetail);
    const onSaved = vi.fn();

    render(
      <ExamBuilderForm
        institutionId="inst-oak"
        catalog={sampleCatalog}
        authHeaders={() => ({ Authorization: 'Bearer tok-1' })}
        onSaved={onSaved}
      />,
    );

    // Step 1: Cannot advance without a valid title
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(screen.getByText(/Exam title must be at least 2 characters/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Exam title/i), {
      target: { value: 'Systems Final Exam' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Operating systems and concurrency assessment' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

    // Step 2: Timing & Schedule validation
    const durationInput = screen.getByLabelText(/Attempt duration/i);
    expect(durationInput).toHaveValue(60);

    fireEvent.change(durationInput, { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText(/Availability start/i), {
      target: { value: '2026-12-10T14:00' },
    });
    fireEvent.change(screen.getByLabelText(/Availability end/i), {
      target: { value: '2026-12-10T13:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(
      screen.getByText(/End date & time must be strictly after start date & time/i),
    ).toBeInTheDocument();

    // Window shorter than 90m duration
    fireEvent.change(screen.getByLabelText(/Availability end/i), {
      target: { value: '2026-12-10T14:45' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(screen.getByText(/Availability window \(45 min\) must be at least/i)).toBeInTheDocument();

    // Fix valid 3-hour window
    fireEvent.change(screen.getByLabelText(/Availability end/i), {
      target: { value: '2026-12-10T17:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

    // Step 3: Instructions & rules
    fireEvent.change(screen.getByLabelText(/Candidate instructions/i), {
      target: { value: 'Use blue or black digital canvas only. No plagiarism.' },
    });
    fireEvent.change(screen.getByLabelText(/Passing marks/i), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText(/Passing percentage/i), {
      target: { value: '50' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /Randomize question order/i }));

    fireEvent.click(screen.getByRole('button', { name: /Create Draft & Open Studio/i }));

    await waitFor(() => expect(createExamDraftMock).toHaveBeenCalledTimes(1));

    const callArg = createExamDraftMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      headers: Record<string, string>;
    };
    expect(callArg.headers).toEqual({ Authorization: 'Bearer tok-1' });
    expect(callArg.data).toMatchObject({
      institutionId: 'inst-oak',
      title: 'Systems Final Exam',
      description: 'Operating systems and concurrency assessment',
      durationMinutes: 90,
      instructions: 'Use blue or black digital canvas only. No plagiarism.',
      passingMarks: 45,
      passingPercentage: 50,
      negativeMarkingEnabled: false,
      defaultNegativeMarks: 0,
      shuffleQuestions: true,
      shuffleOptions: false,
    });
    expect(typeof callArg.data['startsAt']).toBe('string');
    expect(typeof callArg.data['endsAt']).toBe('string');
    expect(onSaved).toHaveBeenCalledWith(createdDetail);
  });

  it('prefills existing exam values in edit mode and submits via updateExamDraftFn', async () => {
    const existing = makeExamDetail();
    const updated = makeExamDetail({ title: 'Algorithms Midterm (Revised)' });
    updateExamDraftMock.mockResolvedValue(updated);
    const onSaved = vi.fn();

    render(
      <ExamBuilderForm
        institutionId="inst-oak"
        catalog={sampleCatalog}
        authHeaders={() => ({ Authorization: 'Bearer tok-edit' })}
        initialExam={existing.exam}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByLabelText(/Exam title/i)).toHaveValue('Algorithms Midterm');
    fireEvent.change(screen.getByLabelText(/Exam title/i), {
      target: { value: 'Algorithms Midterm (Revised)' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(screen.getByLabelText(/Attempt duration/i)).toHaveValue(90);

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    expect(screen.getByLabelText(/Candidate instructions/i)).toHaveValue(
      'Answer all sections. No external notes allowed.',
    );
    expect(screen.getByLabelText(/Default negative marks/i)).toHaveValue(0.25);

    fireEvent.click(screen.getByRole('button', { name: /Update Exam Configuration/i }));

    await waitFor(() => expect(updateExamDraftMock).toHaveBeenCalledTimes(1));
    const callArg = updateExamDraftMock.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data['examId']).toBe('ex-101');
    expect(callArg.data['title']).toBe('Algorithms Midterm (Revised)');
    expect(callArg.data['negativeMarkingEnabled']).toBe(true);
    expect(callArg.data['defaultNegativeMarks']).toBe(0.25);
    expect(onSaved).toHaveBeenCalledWith(updated);
  });

  it('enforces read-only inspection for published or locked exams', () => {
    const published = makeExamDetail({ status: 'published', isLockedByAttempts: true });

    render(
      <ExamBuilderForm
        institutionId="inst-oak"
        catalog={sampleCatalog}
        authHeaders={() => ({})}
        initialExam={published.exam}
      />,
    );

    expect(screen.getByText(/cannot be edited directly/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exam title/i)).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

    expect(
      screen.queryByRole('button', { name: /Update Exam Configuration/i }),
    ).not.toBeInTheDocument();
  });
});
