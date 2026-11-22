import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, ClipboardCheck, Lock, PlayCircle, Sparkles, Timer, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CtaBand, MarketingLayout } from '@/components/marketing/site-layout';
import { ProductShowcase } from '@/components/marketing/product-showcase';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'ExamFlow — Examination platform for institutions' },
      { name: 'description', content: 'Run MCQ and descriptive exams, grade faster and review with confidence. Built for schools, colleges and universities.' },
      { property: 'og:title', content: 'ExamFlow — Secure online examinations' },
      { property: 'og:description', content: 'Exams, grading and results in one platform for institutions.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Home,
});

const pains = [
  { icon: Timer, title: 'Stop chasing exam logistics', body: 'Schedule once. Students see exactly when and where their exam opens, and the timer is enforced on the server.', to: '/features' },
  { icon: ClipboardCheck, title: 'Grade in hours, not weeks', body: 'MCQs are scored instantly. A grading queue shows examiners what to mark next, with rubrics for written answers.', to: '/features' },
  { icon: Lock, title: 'Keep every record private', body: 'Each institution’s data is separated by row-level security, and sensitive actions are written to an audit log.', to: '/security' },
];

function Home() {
  return (
    <MarketingLayout>
      <section className="exam-hero relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-10 lg:py-24">
          <div className="relative z-10">
            <span className="hero-kicker"><Sparkles className="h-4 w-4" /> A complete examination workspace</span>
            <h1 className="mt-7 max-w-3xl font-sans text-[clamp(2.8rem,6vw,5rem)] font-semibold leading-[1.02] tracking-[-.05em] text-white">
              Exams, handled with <span className="text-gold">care</span> from start to finish.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/70 sm:text-lg">
              Prepare questions, run timed exams, grade fairly and release results, all in one place your whole institution can trust.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 bg-gold px-6 text-navy hover:bg-gold-light"><Link to="/demo-exam"><PlayCircle className="h-5 w-5" /> Take a 2-minute sample exam</Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-white/35 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"><Link to="/demo">Explore the demo workspace <ArrowRight className="h-4 w-4" /></Link></Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              {['No account needed to try', 'Server-enforced timers', 'Separate data per institution'].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-gold" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
            <div className="ef-glass ef-float relative rounded-3xl p-5 text-white shadow-2xl">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/60"><span>Physics · Mid-term</span><span className="rounded-full bg-white/10 px-2.5 py-1 font-mono">42:18</span></div>
              <p className="mt-4 text-lg font-semibold">Question 04 / 20</p>
              <p className="mt-1 text-sm text-white/75">Which quantity is a vector?</p>
              <div className="mt-4 space-y-2 text-sm">
                {['Speed', 'Velocity', 'Distance', 'Energy'].map((o, i) => (
                  <div key={o} className={`rounded-xl border px-4 py-2.5 ${i === 1 ? 'border-gold bg-gold/15' : 'border-white/15 bg-white/5'}`}>{o}</div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/70"><span className="inline-flex items-center gap-1.5"><span className="ef-pulse h-2 w-2 rounded-full bg-emerald-400" /> Saved just now</span><span>Online</span></div>
            </div>
            <div className="ef-glass ef-float-delay absolute -right-2 -top-6 hidden rounded-2xl p-3.5 text-white shadow-xl sm:block">
              <p className="text-[10px] uppercase tracking-wider text-white/60">Participation</p>
              <p className="text-2xl font-bold tabular-nums">94%</p>
            </div>
            <div className="ef-glass ef-float absolute -bottom-10 -left-8 hidden items-center gap-2 rounded-2xl p-3.5 text-sm text-white shadow-xl sm:flex">
              <Users className="h-4 w-4 text-gold" /> 38 results published
            </div>
            <p className="absolute -bottom-9 right-1 hidden text-[11px] text-white/50 sm:block">Illustration · sample data</p>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="showcase-h">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-eyebrow">Try it right here</p>
          <h2 id="showcase-h" className="mt-3 font-display text-3xl font-medium tracking-tight sm:text-4xl">See the product, not a brochure.</h2>
          <p className="mt-3 text-muted-foreground">Click around. Answer a question, mark an answer, watch the numbers move.</p>
        </div>
        <div className="mt-10"><ProductShowcase /></div>
      </section>

      <section className="border-t bg-muted/30 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl font-display text-3xl font-medium tracking-tight sm:text-4xl">Built around the problems examination offices actually have.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pains.map((p) => (
              <Link key={p.title} to={p.to} className="group rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elegant">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-gold-dark"><p.icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-5 font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{p.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-navy">Learn more <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
