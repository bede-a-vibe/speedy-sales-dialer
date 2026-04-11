import { ArrowRightLeft, CalendarClock, PhoneForwarded } from "lucide-react";

type PipelineMirrorCardsProps = {
  bookedPipelineName?: string | null;
  bookedStageName?: string | null;
  bookedOpenCount: number;
  bookedCompletedCount: number;
  bookedStaleCount: number;
  followUpPipelineName?: string | null;
  followUpStageName?: string | null;
  followUpHandoffCount: number;
};

function renderPath(pipelineName?: string | null, stageName?: string | null, fallback?: string) {
  const pipelineLabel = pipelineName?.trim() || fallback || "Unresolved pipeline";
  if (!stageName?.trim()) return pipelineLabel;
  return `${pipelineLabel} → ${stageName}`;
}

export function PipelineMirrorCards({
  bookedPipelineName,
  bookedStageName,
  bookedOpenCount,
  bookedCompletedCount,
  bookedStaleCount,
  followUpPipelineName,
  followUpStageName,
  followUpHandoffCount,
}: PipelineMirrorCardsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">GHL pipeline mirror</p>
          <h4 className="text-sm font-semibold text-foreground">Work shown by the two real destinations</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            This surface now anchors the queue to the named GHL pipelines instead of only local booked vs follow-up buckets.
          </p>
        </div>
        <div className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
          2 live routes
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-foreground">
            <PhoneForwarded className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Outbound Prospecting</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{renderPath(followUpPipelineName, followUpStageName, "Configured follow-up pipeline")}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Task handoffs</dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-foreground">{followUpHandoffCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Source</dt>
              <dd className="mt-1 text-xs text-muted-foreground">GHL tasks and follow-up requests</dd>
            </div>
          </dl>
        </section>

        <div className="hidden items-center justify-center lg:flex">
          <div className="rounded-full border border-dashed border-border p-3 text-muted-foreground">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
        </div>

        <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-foreground">
            <CalendarClock className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold">Sales & Growth Sessions</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{renderPath(bookedPipelineName, bookedStageName, "Configured booked pipeline")}</p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Open</dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-foreground">{bookedOpenCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Completed</dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-foreground">{bookedCompletedCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Needs outcome</dt>
              <dd className="mt-1 font-mono text-2xl font-bold text-foreground">{bookedStaleCount}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
