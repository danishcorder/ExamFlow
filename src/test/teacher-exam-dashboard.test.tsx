import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeacherExamDashboard } from '@/components/app/teacher-exam-dashboard';
import {
  classifyTeacherExamBucket,
  loadTeacherExamDashboard,
  type TeacherExamDashboardData,
} from '@/lib/exams.server';
import { AuthorizationError, type AuthedSupabase } from '@/lib/workspace.server';

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
    user: { id: 'user-oak-teacher', email: 'teacher@oakridge.edu' },
    activeInstitutionId: 'inst-oak',
    authHeaders: () => ({ Authorization: 'Bearer test-token' }),
  }),
}));

describe('TeacherExamDashboard server aggregation & UI', () => {
  it('classifies active, upcoming, archived, and draft exams relative to schedule window', () => {
    const now = Date.parse('2026-11-16T12:00:00.000Z');

    expect(
      classifyTeacherExamBucket(
        {
          status: 'published',
          starts_at: '2026-11-16T10:00:00.000Z',
          ends_at: '2026-11-16T14:00:00.000Z',
        },
        now,
      ),
    ).toBe('active');

    expect(
      classifyTeacherExamBucket(
        {
          status: 'published',
          starts_at: '2026-11-20T10:00:00.000Z',
          ends_at: '2026-11-20T12:00:00.000Z',
        },
        now,
      ),
    ).toBe('upcoming');

    expect(
      classifyTeacherExamBucket(
        {
          status: 'published',
          starts_at: '2026-11-10T10:00:00.000Z',
          ends_at: '2026-11-10T12:00:00.000Z',
        },
        now,
      ),
    ).toBe('archived');

    expect(
      classifyTeacherExamBucket(
        { status: 'closed', starts_at: null, ends_at: null },
        now,
      ),
    ).toBe('archived');

    expect(
      classifyTeacherExamBucket(
        { status: 'draft', starts_at: null, ends_at: null },
        now,
      ),
    ).toBe('draft');
  });

  it('aggregates deduplicated cohorts, participant counts, and enforces teacher/tenant authorization', async () => {
    const now = Date.parse('2026-11-16T12:00:00.000Z');

    const tables: Record<string, Array<Record<string, unknown>>> = {
      platform_admins: [],
      institutions: [
        {
          id: 'inst-oak',
          name: 'Oakridge University',
          slug: 'oakridge',
          institution_type: 'university',
          status: 'active',
          created_by: 'user-oak-admin',
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      institution_memberships: [
        {
          id: 'mem-teacher',
          institution_id: 'inst-oak',
          user_id: 'user-oak-teacher',
          role: 'teacher',
          status: 'active',
        },
        {
          id: 'mem-student',
          institution_id: 'inst-oak',
          user_id: 'user-oak-student',
          role: 'student',
          status: 'active',
        },
      ],
      courses: [
        { id: 'c-cs101', institution_id: 'inst-oak', code: 'CS101', title: 'Algorithms' },
      ],
      exams: [
        {
          id: 'ex-active',
          institution_id: 'inst-oak',
          course_id: 'c-cs101',
          title: 'Midterm Live',
          description: null,
          starts_at: '2026-11-16T10:00:00.000Z',
          ends_at: '2026-11-16T15:00:00.000Z',
          duration_minutes: 90,
          total_marks: 50,
          passing_marks: 25,
          passing_percentage: 50,
          status: 'published',
          current_version_number: 1,
          updated_at: '2026-11-16T08:00:00.000Z',
        },
        {
          id: 'ex-upcoming',
          institution_id: 'inst-oak',
          course_id: 'c-cs101',
          title: 'Final Exam',
          description: null,
          starts_at: '2026-12-01T09:00:00.000Z',
          ends_at: '2026-12-01T12:00:00.000Z',
          duration_minutes: 120,
          total_marks: 100,
          passing_marks: 50,
          passing_percentage: 50,
          status: 'published',
          current_version_number: 1,
          updated_at: '2026-11-16T07:00:00.000Z',
        },
        {
          id: 'ex-archived',
          institution_id: 'inst-oak',
          course_id: 'c-cs101',
          title: 'Quiz 1 (Closed)',
          description: null,
          starts_at: '2026-11-05T09:00:00.000Z',
          ends_at: '2026-11-05T10:00:00.000Z',
          duration_minutes: 30,
          total_marks: 20,
          passing_marks: 10,
          passing_percentage: 50,
          status: 'closed',
          current_version_number: 1,
          updated_at: '2026-11-05T11:00:00.000Z',
        },
      ],
      exam_sections: [
        { id: 's1', institution_id: 'inst-oak', exam_id: 'ex-active' },
        { id: 's2', institution_id: 'inst-oak', exam_id: 'ex-upcoming' },
        { id: 's3', institution_id: 'inst-oak', exam_id: 'ex-archived' },
      ],
      exam_section_questions: [
        { id: 'q1', institution_id: 'inst-oak', exam_id: 'ex-active' },
        { id: 'q2', institution_id: 'inst-oak', exam_id: 'ex-active' },
        { id: 'q3', institution_id: 'inst-oak', exam_id: 'ex-upcoming' },
      ],
      exam_assignments: [
        {
          institution_id: 'inst-oak',
          exam_id: 'ex-active',
          target_type: 'class',
          class_id: 'cls-1',
          class_section_id: null,
          student_id: null,
        },
        // Overlapping section/student assignment for same student stu-1 should deduplicate!
        {
          institution_id: 'inst-oak',
          exam_id: 'ex-active',
          target_type: 'student',
          class_id: null,
          class_section_id: null,
          student_id: 'stu-1',
        },
      ],
      exam_versions: [
        { id: 'v1', institution_id: 'inst-oak', exam_id: 'ex-active', attempt_count: 18 },
        { id: 'v2', institution_id: 'inst-oak', exam_id: 'ex-archived', attempt_count: 24 },
      ],
      class_sections: [{ id: 'csec-a', institution_id: 'inst-oak', class_id: 'cls-1' }],
      student_enrollments: [
        {
          institution_id: 'inst-oak',
          student_id: 'stu-1',
          class_section_id: 'csec-a',
          status: 'enrolled',
        },
        {
          institution_id: 'inst-oak',
          student_id: 'stu-2',
          class_section_id: 'csec-a',
          status: 'enrolled',
        },
      ],
    };

    const makeMockSupabase = () => {
      const makeBuilder = (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const exec = async () => ({
          data: (tables[table] ?? []).filter((r) => filters.every((fn) => fn(r))),
          error: null,
        });
        const b = {
          select: () => b,
          eq: (col: string, val: unknown) => {
            filters.push((r) => r[col] === val);
            return b;
          },
          order: () => b,
          maybeSingle: async () => {
            const res = await exec();
            return { data: res.data[0] ?? null, error: null };
          },
          then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => exec().then(res, rej),
        };
        return b;
      };
      return { from: (t: string) => makeBuilder(t) } as unknown as AuthedSupabase;
    };

    const mockSupabase = makeMockSupabase();

    // Student cannot read Teacher Dashboard
    await expect(
      loadTeacherExamDashboard(mockSupabase, 'user-oak-student', 'inst-oak', now),
    ).rejects.toThrow(AuthorizationError);

    // Teacher loads accurate metrics
    const result = await loadTeacherExamDashboard(mockSupabase, 'user-oak-teacher', 'inst-oak', now);
    expect(result.summary.activeCount).toBe(1);
    expect(result.summary.upcomingCount).toBe(1);
    expect(result.summary.archivedCount).toBe(1);
    expect(result.summary.totalParticipants).toBe(42);
    expect(result.summary.totalAssignedStudents).toBe(2); // stu-1 & stu-2 deduplicated
    expect(result.summary.overallAveragePercentage).toBeNull();

    const activeRow = result.exams.find((e) => e.id === 'ex-active')!;
    expect(activeRow.bucket).toBe('active');
    expect(activeRow.assignedCohortCount).toBe(2);
    expect(activeRow.participantCount).toBe(18);
  });

  it('renders active, upcoming, and archived tabs with summary metrics and interactive filtering', () => {
    const sampleData: TeacherExamDashboardData = {
      summary: {
        activeCount: 1,
        upcomingCount: 1,
        archivedCount: 1,
        draftCount: 0,
        totalParticipants: 67,
        totalAssignedStudents: 45,
        overallAverageScore: 39.2,
        overallAveragePercentage: 78.4,
        totalGradedSubmissions: 35,
      },
      courses: [{ id: 'c1', code: 'CS101', title: 'Algorithms' }],
      exams: [
        {
          id: 'e1',
          title: 'Algorithms Midterm',
          description: null,
          courseId: 'c1',
          courseCode: 'CS101',
          courseTitle: 'Algorithms',
          status: 'published',
          bucket: 'active',
          starts_at: '2026-11-16T08:00:00.000Z',
          ends_at: '2026-11-16T18:00:00.000Z',
          duration_minutes: 90,
          total_marks: 50,
          passing_marks: 25,
          passing_percentage: 50,
          sectionCount: 2,
          questionCount: 15,
          assignedCohortCount: 45,
          participantCount: 32,
          averageScore: null,
          averagePercentage: null,
          gradedCount: 0,
          current_version_number: 1,
          updated_at: '2026-11-16T08:00:00.000Z',
        },
        {
          id: 'e2',
          title: 'Graph Theory Practical',
          description: null,
          courseId: 'c1',
          courseCode: 'CS101',
          courseTitle: 'Algorithms',
          status: 'published',
          bucket: 'upcoming',
          starts_at: '2026-11-25T09:00:00.000Z',
          ends_at: '2026-11-25T11:00:00.000Z',
          duration_minutes: 60,
          total_marks: 40,
          passing_marks: 20,
          passing_percentage: 50,
          sectionCount: 1,
          questionCount: 10,
          assignedCohortCount: 45,
          participantCount: 0,
          averageScore: null,
          averagePercentage: null,
          gradedCount: 0,
          current_version_number: 1,
          updated_at: '2026-11-15T12:00:00.000Z',
        },
        {
          id: 'e3',
          title: 'Sorting Diagnostic Quiz',
          description: null,
          courseId: 'c1',
          courseCode: 'CS101',
          courseTitle: 'Algorithms',
          status: 'closed',
          bucket: 'archived',
          starts_at: '2026-11-01T09:00:00.000Z',
          ends_at: '2026-11-01T10:00:00.000Z',
          duration_minutes: 30,
          total_marks: 50,
          passing_marks: 25,
          passing_percentage: 50,
          sectionCount: 1,
          questionCount: 12,
          assignedCohortCount: 45,
          participantCount: 35,
          averageScore: 39.2,
          averagePercentage: 78.4,
          gradedCount: 35,
          current_version_number: 1,
          updated_at: '2026-11-01T10:05:00.000Z',
        },
      ],
    };

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherExamDashboard dataOverride={sampleData} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Algorithms Midterm')).toBeInTheDocument();
    expect(screen.getByText('Graph Theory Practical')).toBeInTheDocument();
    expect(screen.getByText('Sorting Diagnostic Quiz')).toBeInTheDocument();
    expect(screen.getByText('67 · 78.4%')).toBeInTheDocument();
    expect(screen.getByText('39.2 / 50')).toBeInTheDocument();

    // Filter to Upcoming
    fireEvent.click(screen.getByRole('tab', { name: /Upcoming \(1\)/i }));
    expect(screen.getByText('Graph Theory Practical')).toBeInTheDocument();
    expect(screen.queryByText('Algorithms Midterm')).not.toBeInTheDocument();
    expect(screen.queryByText('Sorting Diagnostic Quiz')).not.toBeInTheDocument();

    // Filter to Archived
    fireEvent.click(screen.getByRole('tab', { name: /Archived \(1\)/i }));
    expect(screen.getByText('Sorting Diagnostic Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Graph Theory Practical')).not.toBeInTheDocument();

    // Search miss & reset
    fireEvent.click(screen.getByRole('tab', { name: /All exams \(3\)/i }));
    fireEvent.change(screen.getByLabelText('Search exams'), {
      target: { value: 'NonExistentSubject' },
    });
    expect(screen.getByText('No exams match this filter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/i }));
    expect(screen.getByText('Algorithms Midterm')).toBeInTheDocument();
  });
});
