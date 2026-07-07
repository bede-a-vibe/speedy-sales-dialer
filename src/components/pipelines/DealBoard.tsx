import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { differenceInCalendarDays } from "date-fns";
import { ExternalLink, GripVertical } from "lucide-react";
import { DEAL_STAGES, DEAL_STAGE_WIN_PROBABILITY, type DealStage } from "@/data/constants";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppointmentOutcomeValue } from "@/lib/appointments";
import {
  useUpdatePipelineItem,
  type PipelineItemWithRelations,
  type SalesRepOption,
} from "@/hooks/usePipelineItems";
import { useGHLOpportunityMirror } from "@/hooks/ghl/useGHLOpportunityMirror";
import { LEAD_TYPES } from "@/data/constants";

function resolveDealStage(item: PipelineItemWithRelations): DealStage {
  if (item.deal_stage && (DEAL_STAGES as readonly { value: string }[]).some((s) => s.value === item.deal_stage)) {
    return item.deal_stage as DealStage;
  }
  switch (item.appointment_outcome) {
    case "showed_closed": return "won";
    case "showed_no_close":
    case "no_show": return "lost";
    case "showed_verbal_commitment":
    case "no_close_follow_up": return "proposal";
    case "second_meeting_booked": return "showed";
    default: return "booked";
  }
}

function formatMoney(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function daysInStage(item: PipelineItemWithRelations) {
  const anchor = item.updated_at || item.created_at;
  if (!anchor) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(anchor)));
}

function DealCard({
  item,
  repName,
  overlay,
}: {
  item: PipelineItemWithRelations;
  repName: string;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  const days = daysInStage(item);
  const dv = item.deal_value ?? 0;
  const mrr = item.monthly_recurring_value ?? 0;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      className={cn(
        "group rounded-lg border border-border bg-background/95 p-3 shadow-sm transition-colors",
        !overlay && "hover:border-primary/50",
        !overlay && isDragging && "opacity-30",
        overlay && "shadow-xl ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/contacts/${item.contact_id}`}
            className="inline-flex items-center gap-1 truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{item.contacts?.business_name || "Unknown business"}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </Link>
          {item.contacts?.contact_person ? (
            <p className="truncate text-xs text-muted-foreground">{item.contacts.contact_person}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 active:cursor-grabbing"
          aria-label="Drag deal"
          {...(overlay ? {} : listeners)}
          {...(overlay ? {} : attributes)}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium uppercase tracking-wide">
        {dv > 0 && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
            {formatMoney(dv)} deal
          </span>
        )}
        {mrr > 0 && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
            {formatMoney(mrr)}/mo
          </span>
        )}
        {item.contacts?.lead_type ? (
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
            {item.contacts.lead_type}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{repName}</span>
        <span className="font-mono">{days}d in stage</span>
      </div>
    </div>
  );
}

function Column({
  stage,
  items,
  repMap,
}: {
  stage: (typeof DEAL_STAGES)[number];
  items: PipelineItemWithRelations[];
  repMap: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage.value}` });
  const totalDeal = items.reduce((s, i) => s + (i.deal_value ?? 0), 0);
  const totalMrr = items.reduce((s, i) => s + (i.monthly_recurring_value ?? 0), 0);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-[280px] flex-col rounded-xl border p-3 transition-colors",
        stage.color,
        isOver && "ring-2 ring-primary/60",
      )}
    >
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-sm font-semibold text-foreground">{stage.label}</h5>
          <span className="rounded-md bg-background/80 px-2 py-0.5 font-mono text-xs text-foreground">
            {items.length}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] font-mono text-muted-foreground">
          <span>{formatMoney(totalDeal)} total</span>
          <span>{formatMoney(totalMrr)}/mo</span>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/50 p-3 text-center text-xs text-muted-foreground">
            Drop here
          </div>
        ) : (
          items.map((item) => (
            <DealCard
              key={item.id}
              item={item}
              repName={repMap.get(item.assigned_user_id) || "Unassigned"}
            />
          ))
        )}
      </div>
    </section>
  );
}

const OUTCOME_FROM_STAGE: Partial<Record<DealStage, AppointmentOutcomeValue>> = {
  won: "showed_closed",
  lost: "showed_no_close",
};

export function DealBoard({
  items,
  reps,
  repMap,
}: {
  items: PipelineItemWithRelations[];
  reps: SalesRepOption[];
  repMap: Map<string, string>;
}) {
  const [repFilter, setRepFilter] = useState<string>("all");
  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, DealStage>>({});

  const updateItem = useUpdatePipelineItem();
  const { mirrorDealStage } = useGHLOpportunityMirror();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (repFilter !== "all" && i.assigned_user_id !== repFilter) return false;
      if (poolFilter !== "all" && (i.contacts?.lead_type ?? "").toLowerCase() !== poolFilter) return false;
      return true;
    });
  }, [items, repFilter, poolFilter]);

  const withStage = useMemo(
    () => filtered.map((i) => ({ item: i, stage: optimistic[i.id] ?? resolveDealStage(i) })),
    [filtered, optimistic],
  );

  const byStage = useMemo(() => {
    const map: Record<DealStage, PipelineItemWithRelations[]> = {
      booked: [], showed: [], proposal: [], won: [], lost: [],
    };
    for (const { item, stage } of withStage) map[stage].push(item);
    for (const k of Object.keys(map) as DealStage[]) {
      map[k].sort((a, b) => (new Date(b.updated_at).getTime()) - (new Date(a.updated_at).getTime()));
    }
    return map;
  }, [withStage]);

  const forecast = useMemo(() => {
    let weighted = 0;
    let wonTotal = 0;
    for (const { item, stage } of withStage) {
      const dv = item.deal_value ?? 0;
      if (stage === "won") wonTotal += dv;
      else if (stage !== "lost") weighted += dv * DEAL_STAGE_WIN_PROBABILITY[stage];
    }
    return { weighted, wonTotal, combined: weighted + wonTotal };
  }, [withStage]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("col:")) return;
    const nextStage = overId.slice("col:".length) as DealStage;
    const item = items.find((i) => i.id === active.id);
    if (!item) return;
    const currentStage = optimistic[item.id] ?? resolveDealStage(item);
    if (currentStage === nextStage) return;

    // Optimistic
    setOptimistic((m) => ({ ...m, [item.id]: nextStage }));

    const mappedOutcome = OUTCOME_FROM_STAGE[nextStage];
    const updates: Parameters<typeof updateItem.mutateAsync>[0] = {
      id: item.id,
      deal_stage: nextStage,
    };
    if (mappedOutcome) {
      updates.appointment_outcome = mappedOutcome;
      updates.status = "completed";
    }

    try {
      await updateItem.mutateAsync(updates);
      toast.success(`Moved to ${nextStage}`);
      // Best-effort GHL mirror
      if (item.ghl_opportunity_id) {
        void mirrorDealStage({ ghlOpportunityId: item.ghl_opportunity_id, dealStage: nextStage });
      }
      // Clear optimistic once the refetch settles
      setOptimistic((m) => {
        const { [item.id]: _drop, ...rest } = m;
        return rest;
      });
    } catch {
      toast.error("Could not move deal. Reverting.");
      setOptimistic((m) => {
        const { [item.id]: _drop, ...rest } = m;
        return rest;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">Deal board</h4>
          <p className="text-xs text-muted-foreground">
            Drag a deal between columns to update its stage. Won/Lost also complete the appointment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-widest text-emerald-700">Won</p>
            <p className="font-mono text-lg font-bold text-foreground">{formatMoney(forecast.wonTotal)}</p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-widest text-primary">Weighted pipeline</p>
            <p className="font-mono text-lg font-bold text-foreground">{formatMoney(forecast.weighted)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Forecast (won + weighted)</p>
            <p className="font-mono text-lg font-bold text-foreground">{formatMoney(forecast.combined)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger className="w-[220px] bg-background">
            <SelectValue placeholder="All reps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            {reps.map((r) => (
              <SelectItem key={r.user_id} value={r.user_id}>
                {r.display_name || r.email || "Unnamed"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={poolFilter} onValueChange={setPoolFilter}>
          <SelectTrigger className="w-[200px] bg-background">
            <SelectValue placeholder="All lead pools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lead pools</SelectItem>
            {LEAD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs font-mono text-muted-foreground">{filtered.length} deals</span>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {DEAL_STAGES.map((stage) => (
            <Column key={stage.value} stage={stage} items={byStage[stage.value]} repMap={repMap} />
          ))}
        </div>
        <DragOverlay>
          {activeItem ? (
            <DealCard
              item={activeItem}
              repName={repMap.get(activeItem.assigned_user_id) || "Unassigned"}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
