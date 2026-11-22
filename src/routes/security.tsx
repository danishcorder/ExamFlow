import { createFileRoute } from '@tanstack/react-router';
import { KeyRound, Lock, ScrollText, ShieldCheck } from 'lucide-react';
import { CtaBand, MarketingLayout, PageIntro } from '@/components/marketing/site-layout';

export const Route = createFileRoute('/security')({
  head: () => ({ meta: [{ title: 'Trust & security — ExamFlow' }, { name: 'description', content: 'How ExamFlow separates institution data and protects exam answers.' }] }),
  component: Security,
});

const items = [
  { icon: Lock, title: 'Institution boundaries', body: 'Database policies scope every record to verified institution membership.' },
  { icon: ShieldCheck, title: 'Verified permissions', body: 'Server functions check roles before sensitive actions. The browser is never trusted for authorization.' },
  { icon: KeyRound, title: 'Protected answer keys', body: 'Answer keys are stored separately from candidate-visible question content.' },
  { icon: ScrollText, title: 'Traceable activity', body: 'Membership, grading and publication actions are recorded in an audit log.' },
];

function Security() {
  return (
    <MarketingLayout>
      <PageIntro eyebrow="Trust & security" title="Security built into every step.">
        Exam integrity depends on clear permissions and reliable records. We have not yet had an independent security assessment, and we say so plainly.
      </PageIntro>
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {items.map((i) => (
            <article key={i.title} className="rounded-2xl border bg-card p-6 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy text-gold"><i.icon className="h-5 w-5" aria-hidden /></span>
              <h2 className="mt-4 font-semibold">{i.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{i.body}</p>
            </article>
          ))}
        </div>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
