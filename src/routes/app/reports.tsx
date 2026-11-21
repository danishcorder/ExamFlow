import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/app/page-header';
import { RoleGuard } from '@/components/app/role-guard';
import { ExamReportsView } from '@/components/app/exam-reports-view';

export const Route = createFileRoute('/app/reports')({
  head: () => ({
    meta: [
      { title: 'Reports — ExamFlow' },
      { name: 'description', content: 'Results, pass rates and grading status for every published exam.' },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RoleGuard allowedRoles={['institution', 'teacher']}>
      <PageHeader title="Reports" description="Results, pass rates and grading status for every published exam." />
      <ExamReportsView />
    </RoleGuard>
  );
}
