import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { StatCard } from './stat-card';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StatusPill } from './status-pill';
import { useAuth } from '@/lib/auth';
import {
  calculateGradesFn,
  getExamAnalyticsFn,
  getTeacherAttemptGradingDetailFn,
  getTeacherExamGradingDashboardFn,
  publishExamResultsFn,
  saveManualQuestionGradeFn,
} from '@/lib/grading.functions';
import type { TeacherAttemptGradingDetail, TeacherAttemptQuestionDetail } from '@/lib/grading.shared';
import { downloadCsv } from '@/lib/csv';

type SubmissionFilterTab = 'all' | 'submitted' | 'graded' | 'published';

type TeacherGradingDashboardProps = {
  institutionId: string;
  examId: string;
  onBack?: () => void;
};

export function TeacherGradingDashboard({ institutionId, examId, onBack }: TeacherGradingDashboardProps) {
  const { authHeaders } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'submissions' | 'analytics'>('submissions');
  const [filterTab, setFilterTab] = useState<SubmissionFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [isPublishingAll, setIsPublishingAll] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Attempt evaluation local states
  const [questionFilter, setQuestionFilter] = useState<'all' | 'descriptive' | 'mcq'>('all');
  const [manualMarks, setManualMarks] = useState<Record<string, number>>({});
  const [manualFeedback, setManualFeedback] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);

  // 1. Load submissions & summary for the exam
  const dashboardQuery = useQuery({
    queryKey: ['teacher-grading-dashboard', institutionId, examId],
    queryFn: async () =>
      getTeacherExamGradingDashboardFn({
        data: { institutionId, examId },
        headers: authHeaders(),
      }),
  });

  // 2. Load analytics
  const analyticsQuery = useQuery({
    queryKey: ['exam-analytics', institutionId, examId],
    enabled: activeTab === 'analytics',
    queryFn: async () =>
      getExamAnalyticsFn({
        data: { institutionId, examId },
        headers: authHeaders(),
      }),
  });

  // 3. Load selected attempt detail for manual grading & inspection
  const attemptDetailQuery = useQuery({
    queryKey: ['teacher-attempt-grading-detail', institutionId, selectedAttemptId],
    enabled: Boolean(selectedAttemptId),
    queryFn: async () => {
      if (!selectedAttemptId) return null;
      return getTeacherAttemptGradingDetailFn({
        data: { institutionId, attemptId: selectedAttemptId },
        headers: authHeaders(),
      });
    },
  });

  const data = dashboardQuery.data;
  const attemptDetail = attemptDetailQuery.data as TeacherAttemptGradingDetail | null;

  // Filter submissions
  const filteredSubmissions = useMemo(() => {
    if (!data) return [];
    return data.attempts.filter((att) => {
      if (filterTab === 'submitted') {
        if (att.status !== 'submitted' && att.status !== 'auto_submitted') return false;
      } else if (filterTab === 'graded') {
        if (att.gradeStatus !== 'moderated' && att.gradeStatus !== 'published') return false;
      } else if (filterTab === 'published') {
        if (att.gradeStatus !== 'published') return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const haystack = `${att.studentFullName} ${att.studentCode} ${att.studentEmail ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [data, filterTab, searchQuery]);

  function exportFilteredResults() {
    downloadCsv(
      `examflow-${examId}-results.csv`,
      ['Student code', 'Student name', 'Email', 'Attempt status', 'Grade status', 'Awarded marks', 'Maximum marks', 'Percentage', 'Passed'],
      filteredSubmissions.map((row) => [
        row.studentCode,
        row.studentFullName,
        row.studentEmail,
        row.status,
        row.gradeStatus,
        row.totalAwardedMarks,
        row.maxPossibleMarks,
        row.percentage,
        row.isPassing ? 'Yes' : 'No',
      ]),
    );
  }

  async function handlePublishAll() {
    setIsPublishingAll(true);
    try {
      const count = await publishExamResultsFn({
        data: { institutionId, examId },
        headers: authHeaders(),
      });
      toast.success(`Published grades for ${count} submissions`);
      await queryClient.invalidateQueries({ queryKey: ['teacher-grading-dashboard', institutionId, examId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish results');
    } finally {
      setIsPublishingAll(false);
    }
  }

  async function handlePublishSingleAttempt(attemptId: string) {
    try {
      await publishExamResultsFn({
        data: { institutionId, examId, attemptIds: [attemptId] },
        headers: authHeaders(),
      });
      toast.success('Attempt results published successfully');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher-grading-dashboard', institutionId, examId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-attempt-grading-detail', institutionId, attemptId] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish result');
    }
  }

  async function handleRecalculateAttempt(attemptId: string) {
    setIsRecalculating(true);
    try {
      await calculateGradesFn({
        data: { institutionId, attemptId },
        headers: authHeaders(),
      });
      toast.success('Attempt grades recalculated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher-grading-dashboard', institutionId, examId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-attempt-grading-detail', institutionId, attemptId] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  }

  async function handleSaveQuestionGrade(question: TeacherAttemptQuestionDetail) {
    if (!selectedAttemptId) return;

    const awarded = manualMarks[question.questionId] ?? question.awardedMarks;
    if (isNaN(awarded) || awarded < 0) {
      toast.error('Awarded marks must be a valid non-negative number');
      return;
    }
    if (awarded > question.maxMarks) {
      toast.error(`Awarded marks cannot exceed maximum marks (${question.maxMarks})`);
      return;
    }

    const feedback = manualFeedback[question.questionId] !== undefined
      ? manualFeedback[question.questionId]
      : (question.teacherFeedback ?? '');

    setSavingQuestionId(question.questionId);
    try {
      await saveManualQuestionGradeFn({
        data: {
          institutionId,
          attemptId: selectedAttemptId,
          questionId: question.questionId,
          awardedMarks: awarded,
          teacherFeedback: feedback || null,
        },
        headers: authHeaders(),
      });
      toast.success(`Score for "${question.questionTitle}" updated`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher-grading-dashboard', institutionId, examId] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-attempt-grading-detail', institutionId, selectedAttemptId] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save question grade');
    } finally {
      setSavingQuestionId(null);
    }
  }

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading exam submissions and grading ledger…" />;
  }

  if (dashboardQuery.error || !data) {
    return (
      <ErrorState
        title="Could not load grading ledger"
        description={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : 'Unknown error'}
        onRetry={() => void dashboardQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} title="Back to exams">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">{data.exam.title}</h1>
            <p className="text-xs text-muted-foreground">
              {data.exam.courseCode ? `${data.exam.courseCode} — ${data.exam.courseTitle}` : 'General Examination'} •
              Total Marks: {data.exam.totalMarks} • Passing:{' '}
              {data.exam.passingMarks != null ? `${data.exam.passingMarks} pts` : `${data.exam.passingPercentage ?? 50}%`}
              {data.exam.negativeMarkingEnabled && ` • Negative Marking (-${data.exam.defaultNegativeMarks})`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeTab === 'submissions' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('submissions')}
          >
            Submissions & Grading
          </Button>
          <Button
            variant={activeTab === 'analytics' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('analytics')}
          >
            Analytics & Items
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={isPublishingAll || data.summary.submittedCount === 0}
            onClick={() => void handlePublishAll()}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {isPublishingAll ? 'Publishing…' : 'Publish All Results'}
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Submissions"
          value={String(data.summary.submittedCount)}
          icon={FileText}
          hint={`${data.summary.totalAttempts} total registered attempts`}
        />
        <StatCard
          label="Graded Submissions"
          value={String(data.summary.gradedCount)}
          icon={UserCheck}
          hint={`${data.summary.submittedCount - data.summary.gradedCount} awaiting review`}
        />
        <StatCard
          label="Published Results"
          value={String(data.summary.publishedCount)}
          icon={CheckCircle2}
          hint="Visible to student accounts"
        />
        <StatCard
          label="Average Score"
          value={`${data.summary.averageScore} pts`}
          icon={Award}
          hint={`${data.summary.averagePercentage}% cohort average`}
        />
      </div>

      {activeTab === 'submissions' ? (
        <Card className="shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Submissions Ledger</CardTitle>
                <CardDescription>
                  Inspect student submissions, grade descriptive answers, view MCQ evaluations, and publish outcomes.
                </CardDescription>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportFilteredResults} disabled={filteredSubmissions.length === 0}>
                  <Download className="h-4 w-4" /> Export filtered results
                </Button>
                <div className="relative w-48 sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search student code or name…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="flex rounded-md border p-0.5 text-xs">
                  {(['all', 'submitted', 'graded', 'published'] as SubmissionFilterTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterTab(t)}
                      className={`rounded px-2.5 py-1 capitalize font-medium transition-colors ${
                        filterTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSubmissions.length === 0 ? (
              <EmptyState
                title={searchQuery ? 'No matching submissions found' : 'No submissions recorded yet'}
                description={
                  searchQuery
                    ? 'Try adjusting your search criteria or filter tabs.'
                    : 'Students will appear here as soon as they start or submit their exam attempts.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Attempt Status</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Percentage</TableHead>
                      <TableHead>Result Release</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((att) => (
                      <TableRow key={att.attemptId}>
                        <TableCell>
                          <p className="font-medium text-foreground">{att.studentFullName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {att.studentCode} {att.studentEmail ? `• ${att.studentEmail}` : ''}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StatusPill
                            tone={att.status === 'submitted' || att.status === 'auto_submitted' ? 'success' : 'neutral'}
                          >
                            {att.status.replace('_', ' ')}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <span className="font-semibold text-foreground">{att.totalAwardedMarks}</span> /{' '}
                          <span className="text-muted-foreground">{att.maxPossibleMarks}</span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <span className={att.isPassing ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                            {att.percentage}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={att.gradeStatus === 'published' ? 'success' : 'warning'}>
                            {att.gradeStatus ?? 'ungraded'}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedAttemptId(att.attemptId);
                              setManualMarks({});
                              setManualFeedback({});
                            }}
                          >
                            Grade / Evaluate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Analytics View */
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Question Difficulty & Score Distribution</CardTitle>
            <CardDescription>Item-by-item statistics, average marks awarded, and candidate success rates.</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsQuery.isLoading ? (
              <LoadingState label="Computing item analytics…" />
            ) : !analyticsQuery.data ? (
              <EmptyState title="No analytics data available" />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Highest Score</p>
                    <p className="text-2xl font-bold mt-1">{analyticsQuery.data.highestScore} pts</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Lowest Score</p>
                    <p className="text-2xl font-bold mt-1">{analyticsQuery.data.lowestScore} pts</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Passed Candidates</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600">
                      {analyticsQuery.data.passCount} / {analyticsQuery.data.totalSubmissions}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground uppercase font-medium">Pass Rate</p>
                    <p className="text-2xl font-bold mt-1">{analyticsQuery.data.passRate}%</p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Question Item Breakdown</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Question</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Max Marks</TableHead>
                          <TableHead>Avg Awarded</TableHead>
                          <TableHead>Success Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsQuery.data.questionStats.map((qs) => (
                          <TableRow key={qs.questionId}>
                            <TableCell className="font-medium">{qs.title}</TableCell>
                            <TableCell className="capitalize text-xs font-mono">{qs.questionType.replace('_', ' ')}</TableCell>
                            <TableCell className="font-mono text-xs">{qs.maxMarks}</TableCell>
                            <TableCell className="font-mono text-xs">{qs.averageAwarded}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold">{qs.successRate}%</span>
                                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full bg-primary"
                                    style={{ width: `${Math.min(100, qs.successRate)}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dedicated Grading & Evaluation Modal */}
      {selectedAttemptId && (
        <Dialog open={Boolean(selectedAttemptId)} onOpenChange={() => setSelectedAttemptId(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-lg">
                    {attemptDetail ? `Grading: ${attemptDetail.studentFullName}` : 'Loading Attempt…'}
                  </DialogTitle>
                  <DialogDescription className="text-xs font-mono">
                    Student Code: {attemptDetail?.studentCode} • Attempt ID: {selectedAttemptId}
                  </DialogDescription>
                </div>
                {attemptDetail && (
                  <StatusPill tone={attemptDetail.gradeStatus === 'published' ? 'success' : 'warning'}>
                    {attemptDetail.gradeStatus ?? 'ungraded'}
                  </StatusPill>
                )}
              </div>
            </DialogHeader>

            {attemptDetailQuery.isLoading ? (
              <LoadingState label="Loading candidate responses and evaluation items…" />
            ) : !attemptDetail ? (
              <ErrorState title="Could not load attempt details" />
            ) : (
              <div className="space-y-6 py-2">
                {/* Attempt Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Submitted At</span>
                    <span className="font-medium">
                      {attemptDetail.submittedAt ? new Date(attemptDetail.submittedAt).toLocaleTimeString() : 'In Progress'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Current Score</span>
                    <span className="font-semibold text-foreground">
                      {attemptDetail.totalAwardedMarks} / {attemptDetail.maxPossibleMarks} pts
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Percentage</span>
                    <span className="font-semibold">
                      {attemptDetail.percentage}% ({attemptDetail.isPassing ? 'Passed' : 'Failed'})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Quick Actions</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs"
                      disabled={isRecalculating}
                      onClick={() => void handleRecalculateAttempt(attemptDetail.attemptId)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Recalculate
                    </Button>
                  </div>
                </div>

                {/* Question Filter Tabs */}
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <button
                      onClick={() => setQuestionFilter('all')}
                      className={`px-3 py-1 rounded transition-colors ${
                        questionFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All Questions ({attemptDetail.questions.length})
                    </button>
                    <button
                      onClick={() => setQuestionFilter('descriptive')}
                      className={`px-3 py-1 rounded transition-colors ${
                        questionFilter === 'descriptive'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Descriptive (Manual) ({attemptDetail.questions.filter((q) => !q.questionType.startsWith('mcq')).length})
                    </button>
                    <button
                      onClick={() => setQuestionFilter('mcq')}
                      className={`px-3 py-1 rounded transition-colors ${
                        questionFilter === 'mcq' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      MCQs (Auto Scored) ({attemptDetail.questions.filter((q) => q.questionType.startsWith('mcq')).length})
                    </button>
                  </div>
                </div>

                {/* Question List */}
                <div className="space-y-4">
                  {attemptDetail.questions
                    .filter((q) => {
                      if (questionFilter === 'descriptive') return !q.questionType.startsWith('mcq');
                      if (questionFilter === 'mcq') return q.questionType.startsWith('mcq');
                      return true;
                    })
                    .map((q, idx) => {
                      const isMcq = q.questionType.startsWith('mcq');
                      const currentAwarded =
                        manualMarks[q.questionId] !== undefined ? manualMarks[q.questionId] : q.awardedMarks;
                      const currentFeedback =
                        manualFeedback[q.questionId] !== undefined
                          ? manualFeedback[q.questionId]
                          : (q.teacherFeedback ?? '');

                      return (
                        <div key={q.questionId} className="rounded-lg border p-4 space-y-3 bg-card">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <div>
                              <span className="text-xs font-mono text-muted-foreground">
                                Q{idx + 1} • {q.sectionTitle}
                              </span>
                              <h4 className="font-semibold text-sm">{q.questionTitle}</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusPill tone={isMcq ? (q.isCorrect ? 'success' : 'danger') : 'info'}>
                                {isMcq ? (q.isCorrect ? 'Correct' : 'Incorrect') : 'Descriptive'}
                              </StatusPill>
                              <span className="font-mono text-xs font-semibold">
                                {q.awardedMarks} / {q.maxMarks} pts
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded">
                            <span className="font-medium text-foreground">Prompt:</span> {q.prompt}
                          </div>

                          {/* Student Response Area */}
                          {isMcq ? (
                            <div className="space-y-2 text-xs">
                              <p className="font-medium">Candidate Answer vs Solution:</p>
                              <div className="grid gap-1.5">
                                {q.options.map((opt) => {
                                  const isStudentChoice = q.selectedOptionKeys.includes(opt.optionKey);
                                  const isCorrectChoice = q.correctOptionKeys.includes(opt.optionKey);

                                  return (
                                    <div
                                      key={opt.optionKey}
                                      className={`flex items-center justify-between rounded p-2 text-xs border ${
                                        isCorrectChoice
                                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                                          : isStudentChoice
                                          ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20'
                                          : 'border-transparent'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold">{opt.optionKey}.</span>
                                        <span>{opt.optionText}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {isStudentChoice && (
                                          <StatusPill tone={isCorrectChoice ? 'success' : 'danger'}>
                                            Candidate Choice
                                          </StatusPill>
                                        )}
                                        {isCorrectChoice && !isStudentChoice && (
                                          <StatusPill tone="success">Correct Answer</StatusPill>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {q.negativeDeduction > 0 && (
                                <p className="text-rose-600 font-mono text-xs">
                                  Negative penalty applied: -{q.negativeDeduction} pts
                                </p>
                              )}
                            </div>
                          ) : (
                            /* Descriptive Question Response & Grading */
                            <div className="space-y-3 pt-1">
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Candidate's Submitted Answer:</Label>
                                <div className="rounded-md border bg-muted/20 p-3 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                                  {q.descriptiveText || (
                                    <span className="text-muted-foreground italic">No written response submitted.</span>
                                  )}
                                </div>
                              </div>

                              {/* Sample Answer or Rubric Reference */}
                              {(q.sampleAnswer || q.gradingRubric) && (
                                <div className="rounded-md border border-dashed p-2.5 text-xs bg-muted/10 space-y-1">
                                  {q.sampleAnswer && (
                                    <p>
                                      <span className="font-semibold text-muted-foreground">Sample Answer:</span>{' '}
                                      {q.sampleAnswer}
                                    </p>
                                  )}
                                  {q.gradingRubric && (
                                    <p>
                                      <span className="font-semibold text-muted-foreground">Grading Rubric:</span>{' '}
                                      {q.gradingRubric}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Grading Controls */}
                              <div className="grid gap-3 sm:grid-cols-3 pt-2">
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold">
                                    Awarded Marks (Max: {q.maxMarks})
                                  </Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={q.maxMarks}
                                      step={0.5}
                                      value={currentAwarded}
                                      onChange={(e) =>
                                        setManualMarks((prev) => ({
                                          ...prev,
                                          [q.questionId]: parseFloat(e.target.value) || 0,
                                        }))
                                      }
                                      className="h-8 text-xs font-mono"
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 px-2 text-xs"
                                      onClick={() =>
                                        setManualMarks((prev) => ({
                                          ...prev,
                                          [q.questionId]: q.maxMarks,
                                        }))
                                      }
                                    >
                                      Full
                                    </Button>
                                  </div>
                                </div>

                                <div className="sm:col-span-2 space-y-1">
                                  <Label className="text-xs font-semibold">Qualitative Feedback to Student</Label>
                                  <Input
                                    placeholder="Enter constructive remarks, strengths, or areas for improvement…"
                                    value={currentFeedback}
                                    onChange={(e) =>
                                      setManualFeedback((prev) => ({
                                        ...prev,
                                        [q.questionId]: e.target.value,
                                      }))
                                    }
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end pt-1">
                                <Button
                                  size="sm"
                                  disabled={savingQuestionId === q.questionId}
                                  onClick={() => void handleSaveQuestionGrade(q)}
                                >
                                  <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                                  {savingQuestionId === q.questionId ? 'Saving…' : 'Save Grade & Feedback'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t pt-4">
              <div className="text-xs text-muted-foreground">
                Grading changes are audited and immediately update cohort totals.
              </div>
              <div className="flex items-center gap-2">
                {attemptDetail && attemptDetail.gradeStatus !== 'published' && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => void handlePublishSingleAttempt(attemptDetail.attemptId)}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Publish This Student's Result
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setSelectedAttemptId(null)}>
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
