import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  Award,
  CalendarClock,
  Eye,
  FileText,
  PlayCircle,
  Search,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/lib/auth';
import { getTeacherExamDashboardFn } from '@/lib/exams.functions';
import type {
  TeacherExamBucket,
  TeacherExamDashboardData,
  TeacherExamDashboardRow,
} from '@/lib/exams.server';
import { ExamPreviewDialog } from './exam-preview-dialog';
import { StatCard } from './stat-card';
import { EmptyState, ErrorState, LoadingState } from './states';

const ALL = '__all__';

type FilterTab = 'all' | TeacherExamBucket;

const BUCKET_META: Record<
  TeacherExamBucket,
  { label: string; toneClass: string }
> = {
  active: { label: 'Active now', toneClass: 'text-emerald-600 dark:text-emerald-400' },
  upcoming: { label: 'Upcoming', toneClass: 'text-amber-600 dark:text-amber-400' },
  archived: { label: 'Archived', toneClass: 'text-muted-foreground' },
  draft: { label: 'Draft', toneClass: 'text-muted-foreground' },
};

function formatWindow(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return 'Unscheduled';
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (startsAt && endsAt) {
    return `${fmt.format(new Date(startsAt))} – ${fmt.format(new Date(endsAt))}`;
  }
  return startsAt ? `From ${fmt.format(new Date(startsAt))}` : `Until ${fmt.format(new Date(endsAt!))}`;
}

function getBucketLabel(row: TeacherExamDashboardRow): string {
  if (row.bucket === 'archived') {
    if (row.status === 'closed') return 'Closed';
    if (row.status === 'archived') return 'Archived';
    return 'Window ended';
  }
  return BUCKET_META[row.bucket].label;
}

export function TeacherExamDashboard({
  initialTab = 'all',
  dataOverride,
  onSelectExam,
}: {
  initialTab?: FilterTab;
  dataOverride?: TeacherExamDashboardData;
  onSelectExam?: (examId: string) => void;
}) {
  const { user, activeInstitutionId, authHeaders } = useAuth();

  const [tab, setTab] = useState<FilterTab>(initialTab);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [previewExamId, setPreviewExamId] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['teacher-exam-dashboard', activeInstitutionId, user?.id],
    enabled: !dataOverride && Boolean(user && activeInstitutionId),
    queryFn: async () => {
      if (!activeInstitutionId) throw new Error('No active institution');
      return getTeacherExamDashboardFn({
        data: { institutionId: activeInstitutionId },
        headers: authHeaders(),
      });
    },
  });

  const data = dataOverride ?? dashboardQuery.data;

  const filteredExams = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.exams.filter((exam) => {
      if (tab !== 'all' && exam.bucket !== tab) return false;
      if (courseFilter !== ALL && exam.courseId !== courseFilter) return false;
      if (q) {
        const haystack = [
          exam.title,
          exam.description ?? '',
          exam.courseCode ?? '',
          exam.courseTitle ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, tab, courseFilter, search]);

  const nextUpcoming = useMemo(() => {
    if (!data) return null;
    const upcoming = data.exams
      .filter((e) => e.bucket === 'upcoming' && e.starts_at)
      .slice()
      .sort((a, b) => Date.parse(a.starts_at!) - Date.parse(b.starts_at!));
    return upcoming[0] ?? null;
  }, [data]);

  if (!dataOverride && !activeInstitutionId) {
    return (
      <EmptyState
        title="No active institution selected"
        description="Select an institution workspace to view your active, upcoming, and archived exams."
      />
    );
  }

  if (!dataOverride && dashboardQuery.isLoading) {
    return <LoadingState label="Loading teacher exam overview…" />;
  }

  if (!dataOverride && dashboardQuery.error) {
    return (
      <ErrorState
        title="Could not load teacher exam dashboard"
        description={
          dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : 'Unexpected server error'
        }
        onRetry={() => {
          void dashboardQuery.refetch();
        }}
      />
    );
  }

  if (!data) return null;

  const { summary, courses, exams } = data;

  const filterButtons: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: 'all', label: 'All exams', count: exams.length },
    { key: 'active', label: 'Active', count: summary.activeCount },
    { key: 'upcoming', label: 'Upcoming', count: summary.upcomingCount },
    { key: 'archived', label: 'Archived', count: summary.archivedCount },
    { key: 'draft', label: 'Drafts', count: summary.draftCount },
  ];

  return (
    <div className="space-y-6">
      {/* 4-column summary KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active exams"
          value={String(summary.activeCount)}
          icon={PlayCircle}
          hint={`${summary.totalAssignedStudents} assigned students across cohorts`}
        />
        <StatCard
          label="Upcoming exams"
          value={String(summary.upcomingCount)}
          icon={CalendarClock}
          hint={
            nextUpcoming?.starts_at
              ? `Next: ${new Date(nextUpcoming.starts_at).toLocaleDateString()}`
              : 'No future schedule queued'
          }
        />
        <StatCard
          label="Archived exams"
          value={String(summary.archivedCount)}
          icon={Archive}
          hint={`${summary.draftCount} draft exam(s) in preparation`}
        />
        <StatCard
          label="Participants & avg. score"
          value={
            summary.overallAveragePercentage != null
              ? `${summary.totalParticipants} · ${summary.overallAveragePercentage.toFixed(1)}%`
              : `${summary.totalParticipants} · —`
          }
          icon={summary.overallAveragePercentage != null ? Award : Users}
          hint={
            summary.totalGradedSubmissions > 0
              ? `Across ${summary.totalGradedSubmissions} graded submission(s)`
              : 'Average score populates once grading begins'
          }
        />
      </div>

      {/* Main Directory Card */}
      <Card className="shadow-none">
        <CardHeader className="space-y-4 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Examination Schedule & Summary</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Live, upcoming, archived, and draft exams for your institution with cohort
                participation and score summaries.
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/app/exams">
                <FileText className="h-4 w-4" />
                Open Exam Builder
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Segmented Filter Control */}
            <div
              role="tablist"
              aria-label="Filter exams by lifecycle"
              className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
            >
              {filterButtons.map((btn) => {
                const active = tab === btn.key;
                return (
                  <button
                    key={btn.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(btn.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {btn.label} ({btn.count})
                  </button>
                );
              })}
            </div>

            {/* Search & Subject Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Search exams"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title or course…"
                  className="pl-9"
                />
              </div>
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="w-48" aria-label="Filter by subject">
                  <SelectValue placeholder="All subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All subjects</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {exams.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No exams created yet"
                description="Create and schedule your first exam in the Exam Builder to track active windows, upcoming cohorts, and archived results here."
                action={
                  <Button asChild>
                    <Link to="/app/exams">
                      <FileText className="h-4 w-4" />
                      Create First Exam
                    </Link>
                  </Button>
                }
              />
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No exams match this filter"
                description="Adjust the lifecycle tab, subject selector, or search query to view other exams."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTab('all');
                      setSearch('');
                      setCourseFilter(ALL);
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Schedule Window</TableHead>
                  <TableHead className="text-right">Participants</TableHead>
                  <TableHead className="text-right">Average Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExams.map((exam) => {
                  const meta = BUCKET_META[exam.bucket];
                  return (
                    <TableRow key={exam.id}>
                      <TableCell className="max-w-xs">
                        <p className="truncate font-medium text-foreground">{exam.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                          {exam.courseCode ? `${exam.courseCode} — ${exam.courseTitle}` : 'General'}
                          {' · '}
                          {exam.sectionCount} sec
                          {' · '}
                          {exam.questionCount} Q
                          {' · '}
                          {exam.total_marks} pts
                          {exam.current_version_number > 0
                            ? ` · v${exam.current_version_number}`
                            : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium whitespace-nowrap ${meta.toneClass}`}>
                          {getBucketLabel(exam)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        <p>{formatWindow(exam.starts_at, exam.ends_at)}</p>
                        <p>{exam.duration_minutes} min</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        <p className="font-medium text-foreground">
                          {exam.participantCount} attempt{exam.participantCount === 1 ? '' : 's'}
                        </p>
                        <p className="text-muted-foreground">
                          {exam.assignedCohortCount} assigned
                        </p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {exam.averageScore != null && exam.averagePercentage != null ? (
                          <>
                            <p className="font-medium text-foreground">
                              {exam.averageScore.toFixed(1)} / {exam.total_marks}
                            </p>
                            <p className="text-muted-foreground">
                              {exam.averagePercentage.toFixed(1)}% ({exam.gradedCount} graded)
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-muted-foreground">—</p>
                            <p className="text-muted-foreground">No graded attempts</p>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {!dataOverride && activeInstitutionId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPreviewExamId(exam.id)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Preview
                            </Button>
                          )}
                          {onSelectExam ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onSelectExam(exam.id)}
                            >
                              Open
                            </Button>
                          ) : (
                            <Button asChild size="sm" variant="outline">
                              <Link to="/app/exams">Manage</Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!dataOverride && activeInstitutionId && (
        <ExamPreviewDialog
          open={Boolean(previewExamId)}
          onOpenChange={(next) => {
            if (!next) setPreviewExamId(null);
          }}
          institutionId={activeInstitutionId}
          examId={previewExamId}
          authHeaders={authHeaders}
        />
      )}
    </div>
  );
}
