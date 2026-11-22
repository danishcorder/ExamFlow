import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function greetingForHour(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Gradient summary banner shared by role home pages. */
export function HeroBanner({
  eyebrow,
  title,
  subtitle,
  actions,
  aside,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label="Summary" className={cn('ef-banner ef-rise relative overflow-hidden rounded-2xl p-6 text-white shadow-elegant sm:p-8', className)}>
      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[.2em] text-gold">{eyebrow}</p>}
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">{title}</h2>
          {subtitle && <p className="mt-2 text-sm leading-6 text-white/75">{subtitle}</p>}
          {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {aside && <div className="flex items-center gap-5 text-white">{aside}</div>}
      </div>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-2xl" />
    </section>
  );
}
