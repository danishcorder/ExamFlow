import { cn } from '@/lib/utils';

/** Accessible SVG ring. `value` is 0–100. */
export function ProgressRing({
  value,
  label,
  size = 112,
  className,
}: {
  value: number | null;
  label: string;
  size?: number;
  className?: string;
}) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}
      role="img" aria-label={value === null ? `${label}: no data yet` : `${label}: ${v}%`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--gold)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: 'stroke-dashoffset .9s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{value === null ? '—' : `${Math.round(v)}%`}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      </div>
    </div>
  );
}
