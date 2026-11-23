import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Eye, ShieldAlert, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { StatCard } from './stat-card';
import { EmptyState, ErrorState, LoadingState } from './states';
import { StatusPill } from './status-pill';
import { useAuth } from '@/lib/auth';
import { dataRepository } from '@/lib/data-repository';
import type { AttemptReviewStatus, InvigilatorDashboardAttemptRow } from '@/lib/proctoring.shared';

type InvigilatorReviewDashboardProps = {
  institutionId: string;
  examId?: string;
};

export function InvigilatorReviewDashboard({ institutionId, examId }: InvigilatorReviewDashboardProps) {
  const { authHeaders } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRow, setSelectedRow] = useState<InvigilatorDashboardAttemptRow | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const dashQuery = useQuery({
    queryKey: ['invigilator-dashboard', institutionId, examId],
    queryFn: async () => dataRepository.getInvigilatorDashboard({ data: { institutionId, examId }, headers: authHeaders() }),
  });

  async function handleSaveReview(status: AttemptReviewStatus) {
    if (!selectedRow) return;
    setIsSaving(true);
    try {
      await dataRepository.saveAttemptReview({
        data: {
          institutionId,
          attemptId: selectedRow.attemptId,
          reviewStatus: status,
          reviewNotes,
        },
        headers: authHeaders(),
      });
      toast.success(`Attempt marked as ${status}`);
      await queryClient.invalidateQueries({ queryKey: ['invigilator-dashboard', institutionId, examId] });
      setSelectedRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save review');
    } finally {
      setIsSaving(false);
    }
  }

  const data = dashQuery.data;

  if (dashQuery.isLoading) {
    return <LoadingState label="Loading proctoring timeline and flagged attempts…" />;
  }
  if (dashQuery.error || !data) {
    return (
      <ErrorState
        title="Could not load invigilator dashboard"
        description={dashQuery.error instanceof Error ? dashQuery.error.message : 'Unknown error'}
        onRetry={() => void dashQuery.refetch()}
      />
    );
  }

  const flaggedCount = data.attempts.filter((a) => a.reviewStatus === 'flagged' || a.criticalEventCount > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Monitored Attempts" value={String(data.attempts.length)} icon={Eye} />
        <StatCard label="Flagged Incidents" value={String(flaggedCount)} icon={ShieldAlert} />
        <StatCard
          label="Clear Rate"
          value={`${data.attempts.length > 0 ? Math.round(((data.attempts.length - flaggedCount) / data.attempts.length) * 100) : 100}%`}
          icon={CheckCircle}
        />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Proctoring & Incident Timeline</CardTitle>
          <CardDescription>
            Inspect browser visibility switches, fullscreen exits, and camera stream status signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.attempts.length === 0 ? (
            <EmptyState title="No active exam attempts to monitor" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Incidents</TableHead>
                    <TableHead>Review Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attempts.map((att) => (
                    <TableRow key={att.attemptId}>
                      <TableCell>
                        <p className="font-medium">{att.studentFullName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{att.studentCode}</p>
                      </TableCell>
                      <TableCell>{att.examTitle}</TableCell>
                      <TableCell>
                        <StatusPill tone={att.status === 'submitted' ? 'success' : 'neutral'}>
                          {att.status}
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        {att.eventCount > 0 ? (
                          <div className="flex items-center gap-1.5 text-amber-600 font-medium text-xs">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{att.eventCount} events</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Clean</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          tone={
                            att.reviewStatus === 'cleared'
                              ? 'success'
                              : att.reviewStatus === 'penalized'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {att.reviewStatus}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRow(att);
                            setReviewNotes(att.reviewNotes ?? '');
                          }}
                        >
                          Review Timeline
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

      {selectedRow && (
        <Dialog open={Boolean(selectedRow)} onOpenChange={() => setSelectedRow(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Proctoring Incident Timeline — {selectedRow.studentFullName}</DialogTitle>
              <DialogDescription>
                Exam: {selectedRow.examTitle} • Attempt ID: {selectedRow.attemptId}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Recorded Events ({selectedRow.events.length})</p>
                {selectedRow.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No proctoring violation events recorded.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border p-3">
                    {selectedRow.events.map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between text-xs border-b pb-2 last:border-0">
                        <div>
                          <span className="font-semibold uppercase text-amber-600">{ev.eventType}</span>
                          <span className="ml-2 text-muted-foreground">
                            {new Date(ev.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <StatusPill tone={ev.severity === 'critical' ? 'danger' : 'warning'}>
                          {ev.severity}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Invigilator Review Notes</label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Enter observation notes, warnings or justification..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={isSaving}
                onClick={() => void handleSaveReview('cleared')}
              >
                Mark Cleared
              </Button>
              <Button
                variant="destructive"
                disabled={isSaving}
                onClick={() => void handleSaveReview('penalized')}
              >
                Penalize / Flag
              </Button>
              <Button
                variant="default"
                disabled={isSaving}
                onClick={() => void handleSaveReview('under_review')}
              >
                Keep Under Review
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
