import type { ReactNode } from "react";

/** One accent for the rep's line, muted ink for the reference line. */
export const ACCENT = "hsl(var(--chart-accent))";
export const MUTED = "hsl(var(--muted-foreground))";
export const GRID = "hsl(var(--border))";
export const AXIS_TICK = { fontSize: 11, fill: MUTED };
export const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-AU")}`;
export const moneyAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Number((v / 1000).toFixed(1))}k` : `$${Math.round(v)}`);

export function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color ? <span className="inline-block h-0.5 w-3" style={{ background: r.color }} aria-hidden="true" /> : null}
            {r.label}
          </span>
          <span className="font-mono tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Panel({ title, note, actions, children }: { title: string; note?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            o.value === value ? "border-primary/50 bg-accent font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
