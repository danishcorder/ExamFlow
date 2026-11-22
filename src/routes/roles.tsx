import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CtaBand, MarketingLayout, PageIntro } from '@/components/marketing/site-layout';

export const Route = createFileRoute('/roles')({
  head: () => ({ meta: [{ title: 'Who it’s for — ExamFlow' }, { name: 'description', content: 'A clear workspace for institution admins, teachers, students and invigilators.' }] }),
  component: Roles,
});

const roles = [
  { key: 'admin', label: 'Institution Admin', points: ['Organise departments, teachers and students', 'Coordinate exam windows across the term', 'Review participation, results and activity'] },
  { key: 'teacher', label: 'Teacher', points: ['Author exams from reusable question banks', 'Grade descriptive responses against a rubric', 'Publish results when review is complete'] },
  { key: 'student', label: 'Student', points: ['See assigned exams and when they open', 'Complete a focused, timed exam with autosave', 'Review published results and feedback'] },
  { key: 'invigilator', label: 'Invigilator', points: ['Review active session status', 'Document incidents with context', 'Hand off a clear review trail'] },
];

function Roles() {
  const [k, setK] = useState('admin');
  const cur = roles.find((r) => r.key === k)!;
  return (
    <MarketingLayout>
      <PageIntro eyebrow="Who it’s for" title="One institution. The right view for everyone." />
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div role="tablist" aria-label="Roles" className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button key={r.key} role="tab" aria-selected={k === r.key} aria-controls="role-panel" type="button" onClick={() => setK(r.key)}
              className={cn('rounded-full border px-4 py-2 text-sm font-medium transition-colors', k === r.key ? 'border-navy bg-navy text-white' : 'bg-card hover:bg-muted')}>{r.label}</button>
          ))}
        </div>
        <div id="role-panel" role="tabpanel" className="ef-rise mt-6 rounded-2xl border bg-card p-7 shadow-sm" key={k}>
          <h2 className="font-display text-2xl font-medium">{cur.label} workspace</h2>
          <ul className="mt-5 space-y-3">
            {cur.points.map((p) => <li key={p} className="flex gap-3 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" aria-hidden />{p}</li>)}
          </ul>
        </div>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
