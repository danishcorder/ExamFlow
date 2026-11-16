import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/page-header';
import { RoleGuard } from '@/components/app/role-guard';
import { TeacherExamDashboard } from '@/components/app/teacher-exam-dashboard';
import { TeacherGradingDashboard } from '@/components/app/teacher-grading-dashboard';
import { useAuth } from '@/lib/auth';

export const Route = createFileRoute('/app/teacher')({
  head: () => ({
    meta: [
      { title: 'Teacher Dashboard — ExamFlow' },
      {
        name: 'description',
        content:
          'Teacher workspace summarizing active, upcoming, and archived exams with participant counts and average score metrics.',
      },
      { property: 'og:title', content: 'Teacher Dashboard — ExamFlow' },
      {
        property: 'og:description',
        content:
          'Teacher workspace summarizing active, upcoming, and archived exams with participant counts and average score metrics.',
      },
    ],
  }),
  component: TeacherWorkspacePage,
});

function TeacherWorkspacePage() {
  const { activeMembership, activeInstitutionId } = useAuth();
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  return (
    <RoleGuard requiredRole="teacher">
      {selectedExamId && activeInstitutionId ? (
        <TeacherGradingDashboard
          institutionId={activeInstitutionId}
          examId={selectedExamId}
          onBack={() => setSelectedExamId(null)}
        />
      ) : (
        <>
          <PageHeader
            title="Teacher / Examiner workspace"
            description={
              activeMembership
                ? `${activeMembership.institution.name} (${activeMembership.institution.slug}) · Exam schedule, cohort participation, and scoring overview`
                : 'Exam schedule, cohort participation, and scoring overview.'
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/app/question-bank">
                    <BookOpen className="h-4 w-4" />
                    Question Bank
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/app/exams">
                    <FileText className="h-4 w-4" />
                    Exam Builder
                  </Link>
                </Button>
              </div>
            }
          />

          <TeacherExamDashboard onSelectExam={(id) => setSelectedExamId(id)} />
        </>
      )}
    </RoleGuard>
  );
}
