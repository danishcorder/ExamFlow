import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/lib/auth';
import type {
  StudentExamBucket,
  StudentExamDashboardData,
  StudentExamSummaryItem,
} from '@/lib/exam-engine.shared';
import { fetchStudentAssignedExamsFromSupabase } from '@/lib/student-exam-dashboard';
import { StatCard } from './stat-card';
import { HeroBanner, greetingForHour } from './hero-banner';
import { describeNextStep } from '@/lib/student-home.shared';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StudentResultReportCard } from './student-result-report-card';

type FilterTab = 'all' | StudentExamBucket;

function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDurationSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function AttemptStatusSummary({ item }: { item: StudentExamSummaryItem }) {
  const att = item.attempt;
  if (!att) {
    if (item.bucket === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Play className="h-3.5 w-3.5" />
          Open for attempt · Ends {formatDateTimeShort(item.endsAt)}
        </span>
      );
    }
    if (item.bucket === 'upcoming') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <CalendarClock className="h-3.5 w-3.5" />
          Opens {formatDateTimeShort(item.startsAt)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Window closed · Not attempted
      </span>
    );
  }

  if (att.status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400">
        <RotateCcw className="h-3.5 w-3.5" />
        In progress ·{' '}
        <span className="font-mono tabular-nums">
          {att.answeredCount}/{att.totalQuestions}
        </span>{' '}
        answered ·{' '}
        <span className="font-mono tabular-nums">{formatDurationSeconds(att.remainingSeconds)}</span>{' '}
        left
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {att.status === 'auto_submitted' ? 'Auto-submitted at deadline' : 'Submitted'} ·{' '}
      {formatDateTimeShort(att.submittedAt)} ·{' '}
      <span className="font-mono tabular-nums">
        {att.answeredCount}/{att.totalQuestions}
      </span>{' '}
      answered
    </span>
  );
}

function bucketStatusText(bucket: StudentExamBucket): string {
  if (bucket === 'active') return 'Active';
  if (bucket === 'upcoming') return 'Upcoming';
  return 'Completed';
}

export function StudentExamDashboard({
  dataOverride,
  supabaseClient,
}: {
  dataOverride?: StudentExamDashboardData | undefined;
  supabaseClient?: SupabaseClient<Database> | undefined;
}) {
  const { user, activeInstitutionId } = useAuth();
  const [tab, setTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedReportExamId, setSelectedReportExamId] = useState<string | null>(null);
  const client = supabaseClient ?? supabase;

  const query = useQuery({
    queryKey: ['student-exam-dashboard', activeInstitutionId, user?.id],
    enabled: Boolean(!dataOverride && user && activeInstitutionId),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!activeInstitutionId || !user) {
        throw new Error('No active institution selected');
      }
      return fetchStudentAssignedExamsFromSupabase(client, {
        institutionId: activeInstitutionId,
        userId: user.id,
        userEmail: user.email ?? null,
      });
    },
  });

  const data = dataOverride ?? query.data;

  const filteredExams = useMemo(() => {
    const items = data?.exams ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== 'all' && item.bucket !== tab) return false;
      if (!q) return true;
      return [item.title, item.courseCode ?? '', item.courseTitle ?? '', item.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [data?.exams, tab, search]);

  if (!activeInstitutionId && !dataOverride) {
    return (
      <EmptyState
        title="No active institution selected"
        description="Select or accept an institution invitation to view your scheduled examinations."
      />
    );
  }

  if (!dataOverride && query.isLoading) {
    return <LoadingState label="Verifying eligibility and loading your examination schedule…" />;
  }

  if (!dataOverride && query.error) {
    return (
      <ErrorState
        title="Could not load student examination portal"
        description={
          query.error instanceof Error
            ? query.error.message
            : 'Unable to verify your examination schedule.'
        }
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (!data) {
    return null;
  }

  if (selectedReportExamId && activeInstitutionId) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={() => setSelectedReportExamId(null)}>
          <ArrowLeft className="h-4 w-4" /> Back to exams
        </Button>
        <StudentResultReportCard institutionId={activeInstitutionId} examId={selectedReportExamId} />
      </div>
    );
  }

  const next = describeNextStep(data);
  const firstName = data.student.fullName.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <HeroBanner
        eyebrow={new Date(data.serverNow).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greetingForHour(new Date(data.serverNow).getHours())}${firstName ? `, ${firstName}` : ''}.`}
        subtitle={<><span className="font-medium text-white">{next.headline}</span><br />{next.detail}</>}
        actions={next.examId && (next.kind === 'resume' || next.kind === 'start') ? (
          <Button asChild className="bg-gold text-navy hover:bg-gold-light">
            <Link to="/app/exam-session/$examId" params={{ examId: next.examId }}>
              <Play className="h-4 w-4" /> {next.kind === 'resume' ? 'Resume exam' : 'Start exam'}
            </Link>
          </Button>
        ) : undefined}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Eligible exams"
          value={String(data.summary.eligibleCount)}
          icon={FileText}
          hint={`${data.student.studentCode} · ${data.student.fullName}`}
        />
        <StatCard
          label="Active now"
          value={String(data.summary.activeCount)}
          icon={Play}
          hint={
            data.summary.inProgressCount > 0
              ? `${data.summary.inProgressCount} attempt in progress`
              : 'Ready to start'
          }
        />
        <StatCard
          label="Upcoming"
          value={String(data.summary.upcomingCount)}
          icon={CalendarClock}
          hint="Scheduled future windows"
        />
        <StatCard
          label="Completed"
          value={String(data.summary.completedCount)}
          icon={FileCheck2}
          hint="Submitted & preserved"
        />
      </div>

      <Card className="shadow-none">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">My Examinations</CardTitle>
              <CardDescription>
                Server-verified eligibility, countdown enforcement, and saved submission receipts.
              </CardDescription>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Search student exams"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title or course…"
                  className="pl-9"
                />
              </div>
              {!dataOverride && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={query.isFetching}
                  onClick={() => {
                    void query.refetch();
                  }}
                  className="whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="all">All ({data.summary.eligibleCount})</TabsTrigger>
                <TabsTrigger value="active">Active ({data.summary.activeCount})</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming ({data.summary.upcomingCount})</TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({data.summary.completedCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredExams.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-foreground">
                {data.exams.length === 0
                  ? 'No examinations assigned yet'
                  : 'No exams match this filter'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.exams.length === 0
                  ? 'Published exams assigned to your class, section, or student record will appear here.'
                  : 'Clear the search box or switch tabs to view your other exams.'}
              </p>
              {(search.trim() || tab !== 'all') && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearch('');
                    setTab('all');
                  }}
                >
                  Reset filters
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredExams.map((item) => {
                const actionLabel =
                  item.attempt?.status === 'in_progress'
                    ? 'Resume Exam'
                    : item.attempt
                      ? 'View Receipt'
                      : item.bucket === 'active'
                        ? 'Review & Start'
                        : item.bucket === 'upcoming'
                          ? 'View Schedule'
                          : 'View Summary';

                const buttonVariant =
                  item.bucket === 'active' ? 'default' : 'outline';

                return (
                  <div
                    key={item.examId}
                    className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="font-display text-base font-semibold text-foreground">
                          {item.title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span
                          className={
                            item.bucket === 'active'
                              ? 'font-medium text-emerald-700 dark:text-emerald-400'
                              : item.bucket === 'upcoming'
                                ? 'font-medium text-amber-700 dark:text-amber-400'
                                : 'font-medium text-foreground'
                          }
                        >
                          {bucketStatusText(item.bucket)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {item.courseCode
                            ? `${item.courseCode} — ${item.courseTitle}`
                            : 'General Assessment'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {item.durationMinutes} min
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {item.totalQuestions} questions
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{item.totalMarks} marks</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Window {formatDateTimeShort(item.startsAt)} –{' '}
                          {formatDateTimeShort(item.endsAt)}
                        </span>
                      </div>

                      <div>
                        <AttemptStatusSummary item={item} />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {item.attempt && item.bucket === 'completed' ? (
                        <Button variant="outline" size="sm" onClick={() => setSelectedReportExamId(item.examId)}>
                          View result <ArrowRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button asChild variant={buttonVariant} size="sm">
                          <Link to="/app/exam-session/$examId" params={{ examId: item.examId }} className="whitespace-nowrap">
                            {actionLabel}<ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
