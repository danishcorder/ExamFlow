import type { ReactNode } from "react";
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="section-eyebrow">ExamFlow workspace</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-navy sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
