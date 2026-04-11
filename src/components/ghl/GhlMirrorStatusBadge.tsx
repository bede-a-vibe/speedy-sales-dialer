import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GhlMirrorStatusBadgeProps {
  ghlContactId?: string | null;
  ghlOpportunityId?: string | null;
  ghlPipelineId?: string | null;
  ghlStageId?: string | null;
  className?: string;
}

export function GhlMirrorStatusBadge({
  ghlContactId,
  ghlOpportunityId,
  ghlPipelineId,
  ghlStageId,
  className,
}: GhlMirrorStatusBadgeProps) {
  const hasContactLink = Boolean(ghlContactId);
  const hasMirror = Boolean(ghlOpportunityId);
  const hasResolvedTarget = Boolean(ghlPipelineId && ghlStageId);

  const tone = hasMirror
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
    : hasContactLink
      ? "border-sky-500/40 bg-sky-500/10 text-sky-700"
      : hasResolvedTarget
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
        : "border-border/70 bg-background text-muted-foreground";

  const title = hasMirror
    ? `GHL opportunity ${ghlOpportunityId}`
    : hasContactLink
      ? `GHL contact ${ghlContactId} linked, opportunity mirror still pending`
      : hasResolvedTarget
        ? "GHL target resolved, but this contact is not linked yet"
        : "No mirrored GHL identity saved yet";

  const label = hasMirror
    ? "GHL mirrored"
    : hasContactLink
      ? "GHL linked"
      : hasResolvedTarget
        ? "Sync blocked"
        : "Not mirrored";

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
