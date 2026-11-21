import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { Brand } from '@/components/app/brand';
import { DEMO_INSTITUTION } from '@/lib/demo-workspace-data';

export const Route = createFileRoute('/demo')({
  head: () => ({
    meta: [
      { title: 'Demo workspace — ExamFlow' },
      { name: 'description', content: 'Explore ExamFlow’s admin, teacher and student screens with sample data. No account needed.' },
    ],
  }),
  component: DemoLayout,
});

const tabs = [
  { to: '/demo/admin', label: 'Institution admin' },
  { to: '/demo/teacher', label: 'Teacher' },
  { to: '/demo/student', label: 'Student' },
] as const;

function DemoLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div role="note" className="flex items-start justify-center gap-2 bg-gold/20 px-4 py-2 text-center text-xs text-navy sm:items-center">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" aria-hidden />
        <span><strong>Demo workspace.</strong> All people, exams and results are sample data. Nothing you do here is saved.</span>
      </div>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="ExamFlow home"><Brand /></Link>
          <p className="text-sm text-muted-foreground">{DEMO_INSTITUTION}</p>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/auth/register" className="font-medium text-primary hover:underline">Create your workspace</Link>
            <Link to="/" className="text-muted-foreground hover:text-foreground">Exit demo</Link>
          </div>
        </div>
        <nav aria-label="Demo roles" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {tabs.map((t) => (
            <Link key={t.to} to={t.to}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: 'whitespace-nowrap border-b-2 border-primary px-3 py-2.5 text-sm font-semibold text-foreground', 'aria-current': 'page' }}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Outlet /></main>
    </div>
  );
}
