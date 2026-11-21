import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DEMO_EXAM,
  DEMO_QUESTIONS,
  formatClock,
  scoreDemoExam,
} from '@/lib/demo-ict-exam';

type Phase = 'intro' | 'running' | 'done';

export function DemoExam() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => DEMO_QUESTIONS.map(() => null));
  const [secondsLeft, setSecondsLeft] = useState<number>(DEMO_EXAM.durationSeconds);
  const deadline = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const finish = useCallback(() => setPhase('done'), []);

  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      const left = Math.round((deadline.current - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) finish();
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  useEffect(() => { headingRef.current?.focus(); }, [phase, index]);

  const start = () => {
    deadline.current = Date.now() + DEMO_EXAM.durationSeconds * 1000;
    setAnswers(DEMO_QUESTIONS.map(() => null));
    setIndex(0);
    setSecondsLeft(DEMO_EXAM.durationSeconds);
    setPhase('running');
  };

  const result = useMemo(() => scoreDemoExam(answers), [answers]);
  const answered = answers.filter((a) => a !== null).length;
  const q = DEMO_QUESTIONS[index]!;

  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="section-eyebrow">Sample exam · no login needed</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-2 font-display text-3xl font-medium tracking-tight outline-none">
          {DEMO_EXAM.title}
        </h1>
        <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
          <li>{DEMO_QUESTIONS.length} multiple-choice questions, 1 mark each, no negative marking.</li>
          <li>{DEMO_EXAM.durationSeconds / 60} minutes. The timer starts when you press Start.</li>
          <li>You can move back and forth and change answers before you submit.</li>
          <li>This is a demonstration: nothing is saved or sent anywhere.</li>
        </ul>
        <Button size="lg" className="mt-7" onClick={start}>Start sample exam <ArrowRight className="h-4 w-4" /></Button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="section-eyebrow">Submission receipt · sample</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-2 font-display text-3xl font-medium outline-none">
            {result.passed ? 'Well done — you passed' : 'Not quite there yet'}
          </h1>
          <p className="mt-3 text-4xl font-bold tabular-nums">
            {result.marks}/{result.maxMarks} <span className="text-xl font-medium text-muted-foreground">({result.percentage}%)</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.attempted} of {result.total} answered · pass mark {DEMO_EXAM.passPercentage}%
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={start}><RotateCcw className="h-4 w-4" /> Try again</Button>
            <Button variant="outline" asChild><a href="/auth/register">Create your institution workspace</a></Button>
          </div>
        </div>
        <section aria-label="Answer review" className="space-y-3">
          {DEMO_QUESTIONS.map((question, i) => {
            const a = answers[i] ?? null;
            const ok = a === question.correctIndex;
            return (
              <article key={question.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start gap-3">
                  {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Correct" />
                      : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-label={a === null ? 'Unanswered' : 'Incorrect'} />}
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{i + 1}. {question.prompt}</p>
                    <p className="mt-1 text-muted-foreground">
                      Your answer: {a === null ? 'Not answered' : question.options[a]}
                      {!ok && <> · Correct: <span className="font-medium text-foreground">{question.options[question.correctIndex]}</span></>}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{question.explanation}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    );
  }

  const low = secondsLeft <= 60;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{DEMO_EXAM.title}</span>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono tabular-nums',
          low && 'border-red-300 bg-red-50 text-red-700')} role="timer" aria-label={`Time left ${formatClock(secondsLeft)}`}>
          <Clock className="h-3.5 w-3.5" aria-hidden /> {formatClock(secondsLeft)}
        </span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Questions answered"
        aria-valuemin={0} aria-valuemax={DEMO_QUESTIONS.length} aria-valuenow={answered}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(answered / DEMO_QUESTIONS.length) * 100}%` }} />
      </div>

      <fieldset className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <legend className="sr-only">Question {index + 1} of {DEMO_QUESTIONS.length}</legend>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Question {index + 1} of {DEMO_QUESTIONS.length}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-lg font-semibold outline-none">{q.prompt}</h2>
        <div className="mt-5 space-y-2.5">
          {q.options.map((opt, oi) => {
            const checked = answers[index] === oi;
            return (
              <label key={opt} className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
                checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                <input type="radio" name={q.id} className="h-4 w-4 accent-[hsl(var(--primary))]" checked={checked}
                  onChange={() => setAnswers((prev) => prev.map((v, i) => (i === index ? oi : v)))} />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
        {answers[index] !== null && (
          <button type="button" className="mt-3 text-xs text-muted-foreground underline"
            onClick={() => setAnswers((prev) => prev.map((v, i) => (i === index ? null : v)))}>
            Clear answer
          </button>
        )}
      </fieldset>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ArrowLeft className="h-4 w-4" /> Previous
        </Button>
        {index < DEMO_QUESTIONS.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>Next <ArrowRight className="h-4 w-4" /></Button>
        ) : (
          <Button onClick={() => {
            const left = DEMO_QUESTIONS.length - answered;
            if (left === 0 || window.confirm(`${left} question(s) are unanswered. Submit anyway?`)) finish();
          }}>Submit exam</Button>
        )}
      </div>
      <nav aria-label="Question navigator" className="mt-5 flex flex-wrap gap-1.5">
        {DEMO_QUESTIONS.map((question, i) => (
          <button key={question.id} type="button" onClick={() => setIndex(i)} aria-label={`Question ${i + 1}${answers[i] !== null ? ', answered' : ''}`}
            aria-current={i === index ? 'step' : undefined}
            className={cn('h-8 w-8 rounded-md border text-xs font-medium',
              i === index && 'ring-2 ring-ring', answers[i] !== null ? 'bg-primary text-primary-foreground' : 'bg-card')}>
            {i + 1}
          </button>
        ))}
      </nav>
    </div>
  );
}
