import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Download, FileText, Percent, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states';
import { StatCard } from '@/components/app/stat-card';
import { StatusPill } from '@/components/app/status-pill';
import { TeacherGradingDashboard } from '@/components/app/teacher-grading-dashboard';
import { useAuth } from '@/lib/auth';
import { downloadCsv } from '@/lib/csv';
import { getReportsOverviewFn } from '@/lib/reports.functions';
import { REPORT_CSV_HEADERS, reportRowsToCsv, type ExamReportRow, type ReportsOverview } from '@/lib/reports.shared';

const fmtPct = (n: number | null) => (n === null ? '—' : `${n}%`);
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00.000Z`).toISOString() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999Z`).toISOString() : undefined);

function useReports(from: string, to: string) {
  const { user, activeInstitutionId, authHeaders } = useAuth();
  const invalid = Boolean(from && to && from > to);
  const query = useQuery({
    queryKey: ['reports-overview', activeInstitutionId, user?.id, from, to],
    enabled: Boolean(user && activeInstitutionId) && !invalid,
    queryFn: async () => {
      if (!activeInstitutionId) throw new Error('No active institution');
      const f = dayStart(from);
      const t = dayEnd(to);
      return getReportsOverviewFn({
        data: { institutionId: activeInstitutionId, ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) },
        headers: authHeaders(),
      });
    },
  });
  return { query, invalid };
}

function DateFilters(props: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="rep-from" className="text-xs">Exam date from</Label>
        <Input id="rep-from" type="date" value={props.from} max={props.to || undefined}
          onChange={(e) => props.setFrom(e.target.value)} className="h-9 w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="rep-to" className="text-xs">to</Label>
        <Input id="rep-to" type="date" value={props.to} min={props.from || undefined}
          onChange={(e) => props.setTo(e.target.value)} className="h-9 w-40" />
      </div>
    </div>
  );
}

function PassRateBars({ rows }: { rows: ExamReportRow[] }) {
  const withData = rows.filter((r) => r.passRate !== null).slice(0, 8);
  if (withData.length === 0) return null;
  return (
    <Card className="shadow-none">
      <CardHeader><CardTitle className="text-base">Pass rate by exam</CardTitle></CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {withData.map((r) => (
            <li key={r.examId}>
              <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="font-medium sm:truncate">{r.title}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {fmtPct(r.passRate)} pass · avg {fmtPct(r.averagePercentage)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img"
                aria-label={`${r.title}: pass rate ${r.passRate}%`}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.passRate ?? 0)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ReportsPanel({ data }: { data: ReportsOverview }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Exams" value={String(data.totals.exams)} icon={FileText} hint="published or closed" />
        <StatCard label="Submissions" value={String(data.totals.submissions)} icon={Users} hint={`${data.totals.graded} graded`} />
        <StatCard label="Average score" value={fmtPct(data.totals.averagePercentage)} icon={Percent} hint="across graded work" />
        <StatCard label="Pass rate" value={fmtPct(data.totals.passRate)} icon={Trophy} hint="across graded work" />
      </div>
      <PassRateBars rows={data.exams} />
      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-base">All exams</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Per-exam results summary</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Exam</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">Date</TableHead>
                  <TableHead scope="col" className="hidden text-right sm:table-cell">Submitted</TableHead>
                  <TableHead scope="col" className="hidden text-right sm:table-cell">Avg</TableHead>
                  <TableHead scope="col" className="text-right">Pass</TableHead>
                  <TableHead scope="col">Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.exams.map((r) => (
                  <TableRow key={r.examId}>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      {r.courseLabel && <div className="text-xs text-muted-foreground">{r.courseLabel}</div>}
                          <div className="text-xs text-muted-foreground sm:hidden">{r.submitted} submitted</div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs md:table-cell">{new Date(r.examDate).toLocaleDateString()}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.submitted}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{fmtPct(r.averagePercentage)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(r.passRate)}</TableCell>
                    <TableCell>
                      {r.submitted === 0 ? <StatusPill>No submissions</StatusPill>
                        : r.needsAction > 0 ? <StatusPill tone="warning">{r.needsAction} need action</StatusPill>
                        : <StatusPill tone="success">All published</StatusPill>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ExamReportsView() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { query, invalid } = useReports(from, to);
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateFilters from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Button variant="outline" disabled={!data || data.exams.length === 0}
          onClick={() => data && downloadCsv('exam-report.csv', REPORT_CSV_HEADERS, reportRowsToCsv(data.exams))}>
          <Download className="h-4 w-4" /> Export all exams (CSV)
        </Button>
      </div>

      {invalid ? (
        <ErrorState title="Invalid date range" description="The start date must be on or before the end date." />
      ) : query.isLoading ? (
        <LoadingState label="Building report…" />
      ) : query.error ? (
        <ErrorState title="Could not load report"
          description={query.error instanceof Error ? query.error.message : 'Unknown error'}
          onRetry={() => { void query.refetch(); }} />
      ) : !data || data.exams.length === 0 ? (
        <EmptyState title="No published exams in this period"
          description="Reports appear once an exam is published. Try widening the date range." />
      ) : (
        <ReportsPanel data={data} />
      )}
    </div>
  );
}

export function GradingQueuePanel({
  data,
  queue,
  onOpen,
}: {
  data: ReportsOverview;
  queue: ExamReportRow[];
  onOpen: (examId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Needs action" value={String(data.totals.needsAction ?? 0)} icon={ClipboardCheck} hint="attempts awaiting you" />
        <div className="hidden sm:block"><StatCard label="Submissions" value={String(data.totals.submissions ?? 0)} icon={Users} /></div>
        <StatCard label="Graded" value={String(data.totals.graded ?? 0)} icon={Trophy} />
      </div>
      <ul className="space-y-3 md:hidden" aria-label="Exams ordered by outstanding grading work">
        {queue.map((r) => (
          <li key={r.examId} className="rounded-xl border bg-card p-4">
            <div className="font-medium">{r.title}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.submitted} submitted</p>
            <p className="mt-2 text-sm tabular-nums">
              {r.ungraded} not graded · {r.draft} draft · {r.moderated} moderated · {r.published} published
            </p>
            <Button className="mt-3 w-full" size="sm" variant={r.needsAction > 0 ? 'default' : 'outline'}
              onClick={() => onOpen(r.examId)}>
              {r.needsAction > 0 ? `Grade now (${r.needsAction} waiting)` : 'Review'}
            </Button>
          </li>
        ))}
      </ul>
      <Card className="hidden shadow-none md:block">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Exams ordered by outstanding grading work</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Exam</TableHead>
                  <TableHead scope="col" className="text-right">Not graded</TableHead>
                  <TableHead scope="col" className="text-right">Draft</TableHead>
                  <TableHead scope="col" className="text-right">Moderated</TableHead>
                  <TableHead scope="col" className="text-right">Published</TableHead>
                  <TableHead scope="col"><span className="sr-only">Action</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((r) => (
                  <TableRow key={r.examId}>
                    <TableCell>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.submitted} submitted</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.ungraded}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.draft}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.moderated}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.published}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={r.needsAction > 0 ? 'default' : 'outline'} onClick={() => onOpen(r.examId)}>
                        {r.needsAction > 0 ? 'Grade now' : 'Review'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function GradingQueueView() {
  const { activeInstitutionId } = useAuth();
  const { query } = useReports('', '');
  const [examId, setExamId] = useState<string | null>(null);
  const data = query.data;
  const queue = useMemo(() => (data?.exams ?? []).filter((r) => r.submitted > 0), [data]);

  if (examId && activeInstitutionId) {
    return <TeacherGradingDashboard institutionId={activeInstitutionId} examId={examId}
      onBack={() => { setExamId(null); void query.refetch(); }} />;
  }
  if (query.isLoading) return <LoadingState label="Loading grading queue…" />;
  if (query.error) {
    return <ErrorState title="Could not load grading queue"
      description={query.error instanceof Error ? query.error.message : 'Unknown error'}
      onRetry={() => { void query.refetch(); }} />;
  }
  if (queue.length === 0) {
    return <EmptyState title="Nothing to grade yet" description="Submitted exams will appear here, with the most urgent first." />;
  }
  return data ? <GradingQueuePanel data={data} queue={queue} onOpen={setExamId} /> : null;
}
