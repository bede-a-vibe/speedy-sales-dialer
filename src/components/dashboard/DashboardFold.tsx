import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "dashboard-folds-v1";

function readOpen(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readOpen(), [id]: open }));
  } catch {
    // Private window or blocked storage: the fold just is not remembered.
  }
}

/**
 * A Dashboard section that stays one line until it is opened. Closed by
 * default; each person's browser remembers which ones they keep open. The
 * content only mounts when open, so closed sections fetch nothing.
 */
export function DashboardFold({ id, title, summary, children }: { id: string; title: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? false);
  const toggle = () => {
    setOpen(!open);
    writeOpen(id, !open);
  };
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{summary}</span>
      </button>
      {open ? <div className="border-t border-border p-4">{children}</div> : null}
    </section>
  );
}
