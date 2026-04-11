import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GhlMirrorStatusBadgeProps {
  ghlOpportunityId?: string | null;
  ghlPipelineId?: string | null;
  ghlStageId?: string | null;
  className?: string;
}

export function GhlMirrorStatusBadge({
  ghlOpportunityId,
  ghlPipelineId,
  ghlStageId,
  className,
}: GhlMirrorStatusBadgeProps) {
  const hasMirror = Boolean(ghlOpportunityId);
  const hasResolvedTarget = Boolean(ghlPipelineId && ghlStageId);

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-medium uppercase tracking-wide",
        hasMirror
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          : hasResolvedTarget
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
            : "border-border/70 bg-background text-muted-foreground",
        className,
      )}
      title={hasMirror ? `GHL opportunity ${ghlOpportunityId}` : hasResolvedTarget ? "GHL target resolved, opportunity id still missing" : "No mirrored GHL identity saved yet"}
    >
      {hasMirror ? "GHL mirrored" : hasResolvedTarget ? "GHL target only" : "Not mirrored"}
    </Badge>
  );
}
