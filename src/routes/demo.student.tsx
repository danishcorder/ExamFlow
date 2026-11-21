import { createFileRoute, Link } from '@tanstack/react-router';
import { CalendarClock, CheckCircle2, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/app/page-header';
import { DEMO_STUDENT_EXAMS as S } from '@/lib/demo-workspace-data';

export const Route = createFileRoute('/demo/student')({ component: DemoStudent });

function DemoStudent() {
  return (
    <div className="space-y-8">
      <PageHeader title="My exams" description="What a student sees: what is open now, what is coming and published results with feedback." />
      <section aria-labelledby="d-active" className="space-y-3">
        <h2 id="d-active" className="text-lg font-semibold">Open now</h2>
        {S.active.map((e) => (
          <Card key={e.title} className="border-gold/50 shadow-none">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{e.title}</p>
                <p className="text-sm text-muted-foreground">{e.course} · {e.minutes} minutes · {e.window}</p>
              </div>
              <Button asChild><Link to="/demo-exam"><PlayCircle className="h-4 w-4" /> Start the sample ICT exam</Link></Button>
            </CardContent>
          </Card>
        ))}
        <p className="text-xs text-muted-foreground">The button opens a real, working sample exam with timer and instant scoring.</p>
      </section>
      <section aria-labelledby="d-up" className="space-y-3">
        <h2 id="d-up" className="text-lg font-semibold">Upcoming</h2>
        {S.upcoming.map((e) => (
          <Card key={e.title} className="shadow-none"><CardContent className="flex items-center gap-3 pt-6">
            <CalendarClock className="h-5 w-5 text-muted-foreground" aria-hidden />
            <div><p className="font-medium">{e.title}</p><p className="text-sm text-muted-foreground">{e.course} · {e.minutes} minutes · {e.window}</p></div>
          </CardContent></Card>
        ))}
      </section>
      <section aria-labelledby="d-done" className="space-y-3">
        <h2 id="d-done" className="text-lg font-semibold">Published results</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {S.completed.map((e) => (
            <Card key={e.title} className="shadow-none">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />{e.title}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-2xl font-bold tabular-nums">{e.score} <span className="text-base font-medium text-muted-foreground">({e.pct}%)</span></p>
                <p className="text-xs text-muted-foreground">{e.course}</p>
                <p className="rounded-md bg-muted/50 p-3"><span className="font-medium">Teacher feedback: </span>{e.feedback}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
