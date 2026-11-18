import type { ReactNode } from "react";
import { Brand } from "./brand";

export function AuthCard({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1fr_0.92fr]">
      <div className="flex flex-col px-6 py-7 sm:px-12 lg:px-16">
        <Brand />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <span className="section-eyebrow">Secure access</span>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-navy sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
      <div className="auth-story-panel relative hidden flex-col justify-between overflow-hidden p-12 text-navy-foreground lg:flex xl:p-16">
        <div className="relative z-10 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-white/65"><span className="h-2 w-2 rounded-full bg-gold" /> ExamFlow for institutions</div>
        <div className="relative z-10 max-w-xl">
          <p className="section-eyebrow text-gold">A calmer exam day</p>
          <blockquote className="mt-4 font-display text-4xl leading-[1.12] tracking-tight text-white xl:text-5xl">“Fair assessment starts with a process everyone can trust.”</blockquote>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/60">Bring preparation, candidate sessions, review and results into one secure institutional workspace.</p>
        </div>
        <div className="relative z-10 grid max-w-lg grid-cols-3 gap-3">{[["01", "Prepare"], ["02", "Conduct"], ["03", "Review"]].map(([number, label]) => <div key={number} className="rounded-xl border border-white/15 bg-white/5 p-3"><p className="text-[10px] font-bold text-gold">{number}</p><p className="mt-1 text-xs font-semibold text-white">{label}</p></div>)}</div>
      </div>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string | undefined }) {
  return msg ? <p className="mt-1 text-xs text-destructive">{msg}</p> : null;
}
