import { Link } from "react-router-dom";
import { ArrowRightLeft, CalendarClock, CheckCircle2, PhoneForwarded } from "lucide-react";
import { Button } from "@/components/ui/button";

type TwoPipelineGuideProps = {
  bookedPipelineName?: string | null;
  bookedStageName?: string | null;
  followUpPipelineName?: string | null;
  followUpStageName?: string | null;
  calendarName?: string | null;
  currentView?: "dialer" | "pipelines" | "followups";
};

function getAccentClasses(isActive: boolean) {
  if (isActive) return "border-primary/40 bg-primary/5";
  return "border-border bg-background/70";
}

export function TwoPipelineGuide({
  bookedPipelineName,
  bookedStageName,
  followUpPipelineName,
  followUpStageName,
  calendarName,
  currentView,
}: TwoPipelineGuideProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">GHL routing guide</p>
          <h3 className="text-sm font-semibold text-foreground">Two pipelines, two jobs</h3>
          <p className="text-sm text-muted-foreground">
            Booked appointments stay in the appointment pipeline. Follow-ups are worked from GHL tasks and the default follow-up pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={currentView === "dialer" ? "default" : "outline"} size="sm">
            <Link to="/dialer">Dialer</Link>
          </Button>
          <Button asChild variant={currentView === "pipelines" ? "default" : "outline"} size="sm">
            <Link to="/pipelines">Booked pipeline</Link>
          </Button>
          <Button asChild variant={currentView === "followups" ? "default" : "outline"} size="sm">
            <Link to="/follow-ups">Follow-ups</Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
        <div className={`rounded-lg border p-4 ${getAccentClasses(currentView === "pipelines")}`}>
          <div className="flex items-center gap-2 text-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Booked appointments</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Used when a dialer outcome is <span className="font-medium text-foreground">Booked</span>. Reps review outcomes and completed appointment history on the Pipelines page.
          </p>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              Calendar: <span className="font-medium text-foreground">{calendarName ?? "Select in dialer"}</span>
            </p>
            <p>
              Opportunity: <span className="font-medium text-foreground">{bookedPipelineName ?? "Select in dialer"}</span>
              {bookedStageName ? <span className="text-muted-foreground"> {"→"} {bookedStageName}</span> : null}
            </p>
          </div>
        </div>

        <div className="hidden items-center justify-center lg:flex">
          <div className="rounded-full border border-dashed border-border p-3 text-muted-foreground">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
        </div>

        <div className={`rounded-lg border p-4 ${getAccentClasses(currentView === "followups")}`}>
          <div className="flex items-center gap-2 text-foreground">
            <PhoneForwarded className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Follow-ups</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Used when a dialer outcome is <span className="font-medium text-foreground">Follow Up</span> or when a booked appointment outcome creates another task. Reps work these from the Follow-Ups page.
          </p>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              Task source: <span className="font-medium text-foreground">GHL tasks</span>
            </p>
            <p>
              Default opportunity: <span className="font-medium text-foreground">{followUpPipelineName ?? "Configured default follow-up pipeline"}</span>
              {followUpStageName ? <span className="text-muted-foreground"> {"→"} {followUpStageName}</span> : null}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        <span>Dialer chooses the destination, Pipelines closes booked appointments, Follow-Ups clears GHL tasks.</span>
      </div>
    </div>
  );
}
