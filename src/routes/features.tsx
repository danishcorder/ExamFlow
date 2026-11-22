import { createFileRoute } from '@tanstack/react-router';
import { BookOpen, ClipboardCheck, Eye, FileText, Lock, ShieldCheck, Timer, BarChart3 } from 'lucide-react';
import { CtaBand, MarketingLayout, PageIntro } from '@/components/marketing/site-layout';

export const Route = createFileRoute('/features')({
  head: () => ({ meta: [{ title: 'Features — ExamFlow' }, { name: 'description', content: 'Question banks, timed exams, grading queues, rubrics and reports for institutions.' }] }),
  component: Features,
});

const features = [
  { icon: BookOpen, title: 'Reusable question bank', body: 'Organise questions by course and difficulty, and reuse them across exams.' },
  { icon: FileText, title: 'MCQ & descriptive exams', body: 'Build balanced assessments with sections, marks and optional negative marking.' },
  { icon: Timer, title: 'Reliable exam windows', body: 'Availability, deadlines and submissions are validated on the server, not in the browser.' },
  { icon: ClipboardCheck, title: 'Grading queue & rubrics', body: 'Objective answers score automatically. Examiners see what needs marking and grade written work against a rubric.' },
  { icon: BarChart3, title: 'Results & reports', body: 'Pass rates, averages and per-exam status for the whole institution, with CSV export.' },
  { icon: Eye, title: 'Invigilator review', body: 'A review workspace for incidents that separates what was observed from what is confirmed. Rolling out.' },
  { icon: Lock, title: 'Private by institution', body: 'Row-level security keeps each institution’s records within its own boundary.' },
  { icon: ShieldCheck, title: 'Audit trail', body: 'Important administrative actions are recorded and searchable by date and type.' },
];

function Features() {
  return (
    <MarketingLayout>
      <PageIntro eyebrow="Features" title="Everything an examination office needs.">From the first question to the published result.</PageIntro>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <article key={f.title} className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-elegant">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-gold-dark"><f.icon className="h-5 w-5" aria-hidden /></span>
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
