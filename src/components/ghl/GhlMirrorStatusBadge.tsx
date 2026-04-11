import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  GHL_PIPELINE_CONTRACT,
  type GhlPipelineType,
} from "@/shared/ghlPipelineContract";

interface GhlMirrorStatusBadgeProps {
  pipelineType?: GhlPipelineType | null;
  ghlContactId?: string | null;
  ghlOpportunityId?: string | null;
  ghlPipelineId?: string | null;
  ghlStageId?: string | null;
  className?: string;
}

export function getGhlMirrorCue(params: {
  pipelineType?: GhlPipelineType | null;
  ghlContactId?: string | null;
  ghlOpportunityId?: string | null;
  ghlPipelineId?: string | null;
  ghlStageId?: string | null;
}) {
  const expectedTarget = params.pipelineType ? GHL_PIPELINE_CONTRACT[params.pipelineType] : null;
  const hasSavedTargetPair = Boolean(params.ghlPipelineId && params.ghlStageId);
  const matchesConfiguredTarget = Boolean(
    expectedTarget && params.ghlPipelineId === expectedTarget.pipelineId && params.ghlStageId === expectedTarget.stageId,
  );

  if (hasSavedTargetPair && expectedTarget && !matchesConfiguredTarget) {
    return `saved ${params.ghlPipelineId}/${params.ghlStageId} vs config ${expectedTarget.pipelineId}/${expectedTarget.stageId}`;
  }
  if (params.ghlOpportunityId) {
    return `saved ${params.ghlPipelineId || "—"}/${params.ghlStageId || "—"}`;
  }
  if (params.ghlContactId) {
    return "contact linked, mirror pending";
  }
  if (params.ghlPipelineId || params.ghlStageId) {
    return `saved ${params.ghlPipelineId || "—"}/${params.ghlStageId || "—"}, contact link missing`;
  }
  if (expectedTarget) {
    return `config ${expectedTarget.pipelineId}/${expectedTarget.stageId}`;
  }
  return "no saved GHL path";
}

export function GhlMirrorStatusBadge({
  pipelineType,
  ghlContactId,
  ghlOpportunityId,
  ghlPipelineId,
  ghlStageId,
  className,
}: GhlMirrorStatusBadgeProps) {
  const hasContactLink = Boolean(ghlContactId);
  const hasMirror = Boolean(ghlOpportunityId);
  const hasSavedTarget = Boolean(ghlPipelineId || ghlStageId);
  const expectedTarget = pipelineType ? GHL_PIPELINE_CONTRACT[pipelineType] : null;
  const hasSavedTargetPair = Boolean(ghlPipelineId && ghlStageId);
  const matchesConfiguredTarget = Boolean(
    expectedTarget && ghlPipelineId === expectedTarget.pipelineId && ghlStageId === expectedTarget.stageId,
  );
  const hasTargetMismatch = Boolean(hasSavedTargetPair && expectedTarget && !matchesConfiguredTarget);

  const configuredPath = expectedTarget
    ? `${expectedTarget.pipelineName} → ${expectedTarget.stageName}`
    : "No configured target";
  const savedPath = ghlPipelineId || ghlStageId
    ? `${ghlPipelineId || "no pipeline"} → ${ghlStageId || "no stage"}`
    : "No saved target";

  const tone = hasTargetMismatch
    ? "border-amber-500/50 bg-amber-500/10 text-amber-700"
    : hasMirror
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
      : hasContactLink
        ? "border-sky-500/40 bg-sky-500/10 text-sky-700"
        : hasSavedTarget
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
          : "border-border/70 bg-background text-muted-foreground";

  const label = hasTargetMismatch
    ? "GHL mismatch"
    : hasMirror
      ? matchesConfiguredTarget || !expectedTarget
        ? "GHL mirrored"
        : "GHL off-path"
      : hasContactLink
        ? "GHL linked"
        : hasSavedTarget
          ? "Sync blocked"
          : "Not mirrored";

  const title = hasTargetMismatch
    ? `Saved target differs from configured ${pipelineType ?? "item"} path. Configured: ${configuredPath}. Saved: ${savedPath}. Opportunity: ${ghlOpportunityId ?? "not saved"}`
    : hasMirror
      ? `GHL opportunity ${ghlOpportunityId}. Configured: ${configuredPath}. Saved: ${savedPath}`
      : hasContactLink
        ? `GHL contact ${ghlContactId} linked, opportunity mirror still pending. Configured: ${configuredPath}. Saved: ${savedPath}`
        : hasSavedTarget
          ? `GHL target saved but contact link is missing. Configured: ${configuredPath}. Saved: ${savedPath}`
          : `No mirrored GHL identity saved yet. Configured: ${configuredPath}`;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium uppercase tracking-wide", tone, className)}
      title={title}
    >
      {label}
    </Badge>
  );
}
