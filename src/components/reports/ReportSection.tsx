import type { ReactNode } from "react";

interface ReportSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function ReportSection({ title, description, children }: ReportSectionProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 space-y-1">
        <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
