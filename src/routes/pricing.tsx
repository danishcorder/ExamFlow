import { createFileRoute, Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CtaBand, MarketingLayout, PageIntro } from '@/components/marketing/site-layout';

export const Route = createFileRoute('/pricing')({
  head: () => ({ meta: [{ title: 'Plans — ExamFlow' }, { name: 'description', content: 'Indicative plans for schools, colleges and universities.' }] }),
  component: Pricing,
});

const plans = [
  { name: 'Starter', price: '$49', note: 'per month', desc: 'For a single school or training centre.', items: ['Up to 300 students', 'MCQ & descriptive exams', 'Email support'] },
  { name: 'Institution', price: '$199', note: 'per month', desc: 'For colleges running exams every term.', items: ['Up to 3,000 students', 'Grading queue & rubrics', 'Reports with CSV export', 'Invigilator review (rolling out)', 'Priority support'], featured: true },
  { name: 'University', price: 'Custom', note: 'annual contract', desc: 'For multi-campus universities.', items: ['Unlimited students', 'Multiple campuses', 'SSO & audit exports', 'Dedicated success manager'] },
];

function Pricing() {
  return (
    <MarketingLayout>
      <PageIntro eyebrow="Plans" title="Room to grow with your institution.">Indicative pricing. Online purchase is not available yet, so please get in touch through the sign-up form.</PageIntro>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((p) => (
            <article key={p.name} className={`plan-card ${p.featured ? 'plan-card-featured' : ''}`}>
              <h2 className="font-bold">{p.name}</h2>
              <p className={`mt-1 text-xs leading-5 ${p.featured ? 'text-white/65' : 'text-muted-foreground'}`}>{p.desc}</p>
              <p className="mt-7"><span className="text-4xl font-bold tracking-tight">{p.price}</span><span className={`ml-2 text-xs ${p.featured ? 'text-white/60' : 'text-muted-foreground'}`}>{p.note}</span></p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2.5"><Check className="h-4 w-4 shrink-0 text-gold-dark" aria-hidden />{i}</li>)}</ul>
              <Button asChild className="mt-8 w-full" variant={p.featured ? 'secondary' : 'outline'}><Link to="/auth/register">Get started</Link></Button>
            </article>
          ))}
        </div>
      </section>
      <CtaBand />
    </MarketingLayout>
  );
}
