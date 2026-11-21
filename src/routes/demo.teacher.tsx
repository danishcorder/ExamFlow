import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/app/page-header';
import { GradingQueuePanel } from '@/components/app/exam-reports-view';
import { DEMO_GRADING_SAMPLE as G, DEMO_REPORTS } from '@/lib/demo-workspace-data';

export const Route = createFileRoute('/demo/teacher')({ component: DemoTeacher });

function DemoTeacher() {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState(String(G.suggestedMarks));
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState(false);
  const n = Number(marks);
  const invalid = marks.trim() === '' || Number.isNaN(n) || n < 0 || n > G.maxMarks;

  if (open) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setSaved(false); }}>
          <ArrowLeft className="h-4 w-4" /> Back to queue
        </Button>
        <Card className="shadow-none">
          <CardHeader>
            <p className="section-eyebrow">{G.exam} · {G.student}</p>
            <CardTitle className="text-lg">{G.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <blockquote className="rounded-lg border-l-4 border-gold bg-muted/40 p-4 text-sm leading-6">{G.answer}</blockquote>
            <div>
              <p className="text-sm font-semibold">Rubric</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{G.rubric.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="d-marks">Marks (max {G.maxMarks})</Label>
                <Input id="d-marks" inputMode="decimal" value={marks} aria-invalid={invalid}
                  onChange={(e) => { setMarks(e.target.value); setSaved(false); }} />
                {invalid && <p className="text-xs text-red-600">Enter a mark between 0 and {G.maxMarks}.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-fb">Feedback to student</Label>
                <Textarea id="d-fb" rows={3} value={feedback} onChange={(e) => { setFeedback(e.target.value); setSaved(false); }}
                  placeholder="Optional comment the student will see once results are published" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={invalid} onClick={() => setSaved(true)}>Save grade</Button>
              {saved && <span role="status" className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Saved as a draft grade (demo only — not stored)
              </span>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Grading queue" description="Exams with submitted work, most urgent first. Try opening the first one." />
      <GradingQueuePanel data={DEMO_REPORTS} queue={DEMO_REPORTS.exams.filter((r) => r.submitted > 0)} onOpen={() => setOpen(true)} />
    </div>
  );
}
