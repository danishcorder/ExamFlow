import { createFileRoute } from '@tanstack/react-router';
import { ExamTakingWorkspace } from '@/components/app/exam-taking-workspace';
import { RoleGuard } from '@/components/app/role-guard';

export const Route = createFileRoute('/app/exam-session/$examId')({
  head: () => ({
    meta: [
      { title: 'Examination Session — ExamFlow' },
      {
        name: 'description',
        content:
          'Timed examination workspace with server-authoritative deadline enforcement, autosave recovery, and idempotent submission.',
      },
    ],
  }),
  component: StudentExamSessionPage,
});

function StudentExamSessionPage() {
  const { examId } = Route.useParams();

  return (
    <RoleGuard requiredRole="student">
      <ExamTakingWorkspace examId={examId} />
    </RoleGuard>
  );
}
