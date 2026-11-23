import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, ClipboardCheck, FileText } from 'lucide-react';
import { HeroBanner, greetingForHour } from '@/components/app/hero-banner';
import { ProgressRing } from '@/components/app/progress-ring';
import { dataRepository } from '@/lib/data-repository';
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
  const { activeMembership, activeInstitutionId, user, authHeaders, workspace } = useAuth();
  const reportsQuery = useQuery({
    queryKey: ['reports-overview', activeInstitutionId, user?.id, '', ''],
    enabled: Boolean(user && activeInstitutionId),
    queryFn: async () => {
      if (!activeInstitutionId) throw new Error('No active institution');
      return dataRepository.getReportsOverview({ data: { institutionId: activeInstitutionId }, headers: authHeaders() });
    },
  });
  const totals = reportsQuery.data?.totals;
  const firstName = (workspace?.profile.full_name || '').trim().split(/\s+/)[0];
  const gradedPct = totals && totals.submissions > 0 ? Math.round((totals.graded / totals.submissions) * 100) : null;
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

          {totals && (
            <HeroBanner
              className="mb-6"
              eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              title={`${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`}
              subtitle={totals.needsAction > 0
                ? `${totals.needsAction} student attempt${totals.needsAction === 1 ? '' : 's'} need${totals.needsAction === 1 ? 's' : ''} your marking or sign-off.`
                : totals.exams > 0 ? 'You are all caught up on grading.' : 'Create your first exam to get started.'}
              actions={totals.needsAction > 0 ? (
                <Button asChild className="bg-gold text-navy hover:bg-gold-light"><Link to="/app/grading-queue"><ClipboardCheck className="h-4 w-4" /> Open grading queue</Link></Button>
              ) : (
                <Button asChild className="bg-gold text-navy hover:bg-gold-light"><Link to="/app/exams"><FileText className="h-4 w-4" /> Create an exam</Link></Button>
              )}
              aside={<><ProgressRing value={gradedPct} label="graded" /><ProgressRing value={totals.passRate} label="pass rate" /></>}
            />
          )}
          <TeacherExamDashboard onSelectExam={(id) => setSelectedExamId(id)} />
        </>
      )}
    </RoleGuard>
  );
}
