import { useMemo } from "react";
import { Link2, Route, ShieldAlert } from "lucide-react";
import { useGHLPipelines } from "@/hooks/useGHLConfig";
import { cn } from "@/lib/utils";

interface GhlMirrorDetailsProps {
  ghlContactId?: string | null;
  ghlOpportunityId?: string | null;
  ghlPipelineId?: string | null;
  ghlStageId?: string | null;
  className?: string;
}

export function GhlMirrorDetails({
  ghlContactId,
  ghlOpportunityId,
  ghlPipelineId,
  ghlStageId,
  className,
}: GhlMirrorDetailsProps) {
  const { data: ghlPipelines = [] } = useGHLPipelines();

  const resolved = useMemo(() => {
    const pipeline = ghlPipelineId
      ? ghlPipelines.find((entry) => entry.id === ghlPipelineId) ?? null
      : null;
    const stage = ghlStageId && pipeline
      ? pipeline.stages.find((entry) => entry.id === ghlStageId) ?? null
      : null;

    return {
      pipeline,
      stage,
      stageMissing: Boolean(ghlStageId && !stage),
    };
  }, [ghlPipelineId, ghlPipelines, ghlStageId]);

  const hasAnyIdentity = Boolean(ghlContactId || ghlOpportunityId || ghlPipelineId || ghlStageId);
  if (!hasAnyIdentity) return null;

  const targetLabel = resolved.pipeline
    ? resolved.stage
      ? `${resolved.pipeline.name} → ${resolved.stage.name}`
      : resolved.pipeline.name
    : ghlPipelineId
      ? `Pipeline ID ${ghlPipelineId}`
      : "No pipeline target saved";

  return (
    <div className={cn("rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Link2 className="h-3 w-3" />
          Contact: {ghlContactId ?? "Not linked"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Route className="h-3 w-3" />
          Opportunity: {ghlOpportunityId ?? "Pending mirror"}
        </span>
      </div>
      <p className="mt-2 text-foreground">
        Mirror target: <span className="font-medium">{targetLabel}</span>
      </p>
      {(ghlPipelineId || ghlStageId) && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          pipeline_id={ghlPipelineId ?? "—"} · stage_id={ghlStageId ?? "—"}
        </p>
      )}
      {resolved.stageMissing && (
        <p className="mt-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <ShieldAlert className="h-3 w-3" />
          Saved stage ID is no longer present in the loaded pipeline config.
        </p>
      )}
    </div>
  );
}
