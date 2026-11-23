import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, Download, FileText, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StatusPill } from './status-pill';
import { useAuth } from '@/lib/auth';
import { dataRepository } from '@/lib/data-repository';
import type { StudentResultReport } from '@/lib/grading.shared';
import { downloadCsv } from '@/lib/csv';

type StudentResultReportCardProps = {
  institutionId: string;
  examId: string;
};

export function StudentResultReportCard({ institutionId, examId }: StudentResultReportCardProps) {
  const { authHeaders } = useAuth();

  const reportQuery = useQuery({
    queryKey: ['student-result-report', institutionId, examId],
    queryFn: async () => dataRepository.getStudentResultReport({ data: { institutionId, examId }, headers: authHeaders() }),
  });

  const report = reportQuery.data as StudentResultReport | null;

  if (reportQuery.isLoading) {
    return <LoadingState label="Loading exam result report…" />;
  }
  if (reportQuery.error) {
    return (
      <ErrorState
        title="Could not load result report"
        description={reportQuery.error instanceof Error ? reportQuery.error.message : 'Unknown error'}
        onRetry={() => void reportQuery.refetch()}
      />
    );
  }
  if (!report) {
    return (
      <EmptyState
        title="Result not published yet"
        description="Your exam attempt has been recorded, but grades and answer keys are currently unreleased or pending teacher review."
      />
    );
  }

  const downloadReport = () => downloadCsv(
    `examflow-result-${report.examId}.csv`,
    ['Exam', 'Attempt ID', 'Submitted at', 'Result status', 'Awarded marks', 'Maximum marks', 'Percentage', 'Passed'],
    [[report.examTitle, report.attemptId, report.submittedAt, report.status, report.totalAwardedMarks, report.maxPossibleMarks, report.percentage, report.isPassing ? 'Yes' : 'No']],
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{report.examTitle}</CardTitle>
              <CardDescription>
                Course: {report.courseCode ?? 'General'} • Submitted:{' '}
                {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : 'N/A'}
              </CardDescription>
            </div>
            <StatusPill tone={report.isPassing ? 'success' : 'danger'}>
              {report.isPassing ? 'Passed' : 'Failed'}
            </StatusPill>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadReport}>
              <Download className="h-4 w-4" /> Download result CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Score</p>
              <p className="text-2xl font-bold">
                {report.totalAwardedMarks} / {report.maxPossibleMarks}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Percentage</p>
              <p className="text-2xl font-bold">{report.percentage}%</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Passing Threshold</p>
              <p className="text-2xl font-bold">
                {report.passingMarks != null
                  ? `${report.passingMarks} marks`
                  : `${report.passingPercentage ?? 50}%`}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-2xl font-bold capitalize">{report.status}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Question Breakdown</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Your Answer / Status</TableHead>
                    <TableHead>Marks Awarded</TableHead>
                    <TableHead>Feedback</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.questions.map((q) => (
                    <TableRow key={q.questionId}>
                      <TableCell className="font-medium">
                        <p>{q.questionTitle}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">{q.prompt}</p>
                      </TableCell>
                      <TableCell className="capitalize">{q.questionType}</TableCell>
                      <TableCell>
                        {q.questionType.startsWith('mcq') ? (
                          <div className="flex items-center gap-1.5">
                            {q.isCorrect ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-rose-600" />
                            )}
                            <span>{q.selectedOptionKeys.join(', ') || 'No answer'}</span>
                          </div>
                        ) : (
                          <p className="text-xs italic line-clamp-2">{q.descriptiveText || 'No answer submitted'}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {q.awardedMarks} / {q.maxMarks}
                        {q.negativeDeduction > 0 && (
                          <span className="ml-1 text-xs text-rose-600">(-{q.negativeDeduction})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {q.teacherFeedback || 'No feedback'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
