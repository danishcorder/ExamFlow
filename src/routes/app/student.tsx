import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/app/page-header';
import { RoleGuard } from '@/components/app/role-guard';
import { StudentExamDashboard } from '@/components/app/student-exam-dashboard';
import { useAuth } from '@/lib/auth';

export const Route = createFileRoute('/app/student')({
  head: () => ({
    meta: [
      { title: 'Student Examination Portal — ExamFlow' },
      {
        name: 'description',
        content:
          'View eligible, active, upcoming, and completed exams with server-enforced timing and submission receipts.',
      },
      { property: 'og:title', content: 'Student Examination Portal — ExamFlow' },
      {
        property: 'og:description',
        content:
          'View eligible, active, upcoming, and completed exams with server-enforced timing and submission receipts.',
      },
    ],
  }),
  component: StudentPortalPage,
});

function StudentPortalPage() {
  const { activeMembership } = useAuth();

  return (
    <RoleGuard requiredRole="student">
      <PageHeader
        title="Student Examination Portal"
        description={
          activeMembership
            ? `${activeMembership.institution.name} (${activeMembership.institution.slug}) · Eligible, active, upcoming, and completed assessments`
            : 'Eligible, active, upcoming, and completed assessments.'
        }
      />

      <StudentExamDashboard />
    </RoleGuard>
  );
}
