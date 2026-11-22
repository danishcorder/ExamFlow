import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, GraduationCap, LayoutDashboard, PenLine, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProgressRing } from '@/components/app/progress-ring';

type Tab = 'student' | 'teacher' | 'admin';
const TABS: { key: Tab; label: string; icon: typeof GraduationCap; blurb: string }[] = [
  { key: 'student', label: 'Student', icon: GraduationCap, blurb: 'A calm, focused exam. Answers autosave and survive a refresh or a dropped connection.' },
  { key: 'teacher', label: 'Teacher', icon: PenLine, blurb: 'Mark against a rubric, see the total update, then publish results when you are ready.' },
  { key: 'admin', label: 'Institution', icon: LayoutDashboard, blurb: 'See participation and pass rates across every exam, and what still needs attention.' },
];

function useCountUp(target: number, run: boolean, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

function StudentPanel() {
  const [choice, setChoice] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [secs, setSecs] = useState(29 * 60 + 41);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { const id = window.setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pick = (i: number) => {
    setChoice(i); setSaving(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaving(false), 700);
  };
  const opts = ['Speed', 'Velocity', 'Distance', 'Energy'];
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-muted-foreground">PHYSICS · MID-TERM · Q 4/20</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono tabular-nums">
          <Clock className="h-3 w-3" aria-hidden /> {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
        </span>
      </div>
      <p className="mt-4 text-base font-semibold">Which quantity is a vector?</p>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label="Answer options">
        {opts.map((o, i) => (
          <button key={o} type="button" role="radio" aria-checked={choice === i} onClick={() => pick(i)}
            className={cn('flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-all',
              choice === i ? 'border-navy bg-navy/5 shadow-sm' : 'hover:bg-muted/60')}>
            <span className={cn('grid h-4 w-4 place-items-center rounded-full border', choice === i && 'border-navy')}>
              {choice === i && <span className="h-2 w-2 rounded-full bg-navy" />}
            </span>{o}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs" aria-live="polite">
        <span className={cn('inline-flex items-center gap-1.5', saving ? 'text-amber-600' : 'text-emerald-700')}>
          {saving ? 'Saving…' : <><CheckCircle2 className="h-3.5 w-3.5" /> {choice === null ? 'Autosave on' : 'Saved just now'}</>}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="ef-pulse h-2 w-2 rounded-full bg-emerald-500" /><Wifi className="h-3.5 w-3.5" aria-hidden /> Online</span>
      </div>
    </div>
  );
}

function TeacherPanel() {
  const rubric = ['Defines RAM as volatile', 'Defines ROM as non-volatile', 'Gives an example of RAM use', 'Gives an example of ROM use', 'Clear, accurate wording'];
  const [on, setOn] = useState<boolean[]>([true, true, true, false, true]);
  const [published, setPublished] = useState(false);
  const score = on.filter(Boolean).length;
  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">STUDENT 014 · QUESTION 7</p>
        <blockquote className="mt-2 rounded-lg border-l-4 border-gold bg-muted/50 p-3 text-sm leading-6">
          “RAM is temporary memory used while programs run. ROM keeps its data permanently, like the startup instructions.”
        </blockquote>
        <ul className="mt-3 space-y-1.5">
          {rubric.map((r, i) => (
            <li key={r}>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--navy)]" checked={on[i]}
                  onChange={() => { setOn((p) => p.map((v, j) => (j === i ? !v : v))); setPublished(false); }} /> {r}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-center gap-3 text-navy">
        <ProgressRing value={(score / rubric.length) * 100} label={`${score}/5`} size={104} />
        <button type="button" onClick={() => setPublished((p) => !p)}
          className={cn('rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors', published ? 'bg-emerald-600 text-white' : 'bg-navy text-white hover:bg-navy/90')}>
          {published ? '✓ Published to 38 students' : 'Publish results'}
        </button>
      </div>
    </div>
  );
}

function AdminPanel({ active }: { active: boolean }) {
  const rows = [['Data Structures', 79], ['Calculus I', 71], ['Databases', 91], ['Chemistry', 55]] as const;
  const students = useCountUp(412, active); const exams = useCountUp(28, active); const pass = useCountUp(78, active);
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[['Students', students], ['Exams', exams], ['Pass rate', `${pass}%`]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-muted/40 p-3">
            <p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-3" aria-label="Pass rate by exam">
        {rows.map(([n, p], i) => (
          <li key={n}>
            <div className="flex justify-between text-xs"><span className="font-medium">{n}</span><span className="tabular-nums text-muted-foreground">{p}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div key={`${active}`} className="ef-grow h-full rounded-full bg-gradient-to-r from-navy to-gold" style={{ width: `${p}%`, animationDelay: `${i * 120}ms` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProductShowcase() {
  const [tab, setTab] = useState<Tab>('student');
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setTab((t) => (t === 'student' ? 'teacher' : t === 'teacher' ? 'admin' : 'student')), 9000);
    return () => window.clearInterval(id);
  }, [auto]);
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <div className="mx-auto max-w-5xl">
      <div role="tablist" aria-label="Product preview" className="mx-auto flex w-fit gap-1 rounded-full border bg-card p-1 shadow-sm">
        {TABS.map((t) => (
          <button key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls="showcase-panel" type="button"
            onClick={() => { setTab(t.key); setAuto(false); }}
            className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-navy text-white shadow' : 'text-muted-foreground hover:text-foreground')}>
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-xl text-center text-sm text-muted-foreground">{current.blurb}</p>
      <div id="showcase-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab}
        className="ef-rise mx-auto mt-6 max-w-2xl rounded-2xl border bg-card p-5 shadow-elegant sm:p-7">
        <div className="mb-4 flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Interactive preview · sample data</span>
        </div>
        {tab === 'student' && <StudentPanel />}
        {tab === 'teacher' && <TeacherPanel />}
        {tab === 'admin' && <AdminPanel active />}
      </div>
    </div>
  );
}
