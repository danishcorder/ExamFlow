import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/app/page-header';
import { RoleGuard } from '@/components/app/role-guard';
import { GradingQueueView } from '@/components/app/exam-reports-view';

export const Route = createFileRoute('/app/grading-queue')({
  head: () => ({
    meta: [
      { title: 'Grading queue — ExamFlow' },
      { name: 'description', content: 'Exams with submitted work, most urgent first. Open one to grade and publish.' },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RoleGuard allowedRoles={['institution', 'teacher']}>
      <PageHeader title="Grading queue" description="Exams with submitted work, most urgent first. Open one to grade and publish." />
      <GradingQueueView />
    </RoleGuard>
  );
}
