import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { CalendarDays, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ghlListPipelineOpportunities, ghlUpdateOpportunity, type GhlBoardOpportunity } from "@/lib/ghl";
import { GHL_PIPELINE_CONTRACT } from "@/shared/ghlPipelineContract";
import { SALES_PIPELINE_STAGES } from "@/lib/ghlMeetingSync";

const PIPELINE_ID = GHL_PIPELINE_CONTRACT.booked.pipelineId as string;
const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n || 0);

export function GhlPipelineBoard() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const board = useQuery({
    queryKey: ["ghl-pipeline-board", PIPELINE_ID],
    queryFn: () => ghlListPipelineOpportunities(PIPELINE_ID),
    staleTime: 60_000,
  });

  const opps = board.data?.opportunities ?? [];
  const ghlIds = useMemo(() => [...new Set(opps.map((o) => o.contactId).filter(Boolean))] as string[], [opps]);

  // Link GHL contacts to dialer contacts + next meeting time.
  const links = useQuery({
    queryKey: ["ghl-board-links", ghlIds.length, ghlIds[0]],
    enabled: ghlIds.length > 0,
    queryFn: async () => {
      const contactMap = new Map<string, string>();
      for (let i = 0; i < ghlIds.length; i += 200) {
        const { data } = await supabase.from("contacts").select("id, ghl_contact_id").in("ghl_contact_id", ghlIds.slice(i, i + 200));
        (data ?? []).forEach((c: any) => c.ghl_contact_id && contactMap.set(c.ghl_contact_id, c.id));
      }
      const meetMap = new Map<string, string>();
      const ids = [...contactMap.values()];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from("pipeline_items").select("contact_id, scheduled_for")
          .eq("pipeline_type", "booked").in("contact_id", ids.slice(i, i + 200)).order("scheduled_for", { ascending: true });
        (data ?? []).forEach((p: any) => p.scheduled_for && meetMap.set(p.contact_id, p.scheduled_for));
      }
      return { contactMap, meetMap };
    },
  });

  const stages = useMemo(() => {
    const s = board.data?.stages ?? [];
    return [...s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [board.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return opps;
    return opps.filter((o) =>
      [o.name, o.contact?.name, o.contact?.companyName, o.contact?.phone, o.source].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [opps, search]);

  const moveTo = async (opp: GhlBoardOpportunity, stageId: string) => {
    if (opp.pipelineStageId === stageId) return;
    const status = stageId === SALES_PIPELINE_STAGES.closed_won ? "won" : stageId === SALES_PIPELINE_STAGES.closed_lost ? "lost" : "open";
    const key = ["ghl-pipeline-board", PIPELINE_ID];
    const prev = qc.getQueryData(key);
    qc.setQueryData(key, (d: any) => d && ({
      ...d,
      opportunities: d.opportunities.map((o: GhlBoardOpportunity) => (o.id === opp.id ? { ...o, pipelineStageId: stageId, status } : o)),
    }));
    try {
      await ghlUpdateOpportunity(opp.id, { pipelineId: PIPELINE_ID, pipelineStageId: stageId, status });
      await supabase.from("pipeline_items").update({ meeting_ghl_stage_id: stageId } as any).eq("meeting_ghl_opportunity_id", opp.id);
      toast.success(`Moved to ${stages.find((s) => s.id === stageId)?.name ?? "stage"} in GHL`);
    } catch (e) {
      qc.setQueryData(key, prev);
      toast.error(`Couldn't move deal in GHL: ${(e as Error).message}`);
    }
  };

  if (board.isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading Sales Pipeline from GHL…</p>;
  if (board.error) return (
    <div className="py-10 text-center text-sm text-destructive">
      Couldn't load GHL pipeline. <Button variant="link" onClick={() => board.refetch()}>Try again</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search opportunities" className="pl-8" />
        </div>
        <Button variant="outline" size="sm" onClick={() => board.refetch()} disabled={board.isFetching}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${board.isFetching ? "animate-spin" : ""}`} /> Refresh from GHL
        </Button>
        <span className="text-xs text-muted-foreground">{opps.length} opportunities · Sales Pipeline</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const cards = filtered.filter((o) => o.pipelineStageId === stage.id);
          const total = cards.reduce((s, o) => s + (Number(o.monetaryValue) || 0), 0);
          return (
            <div
              key={stage.id}
              className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${overStage === stage.id ? "ring-2 ring-primary" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
              onDragLeave={() => setOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const opp = opps.find((o) => o.id === dragId);
                if (opp) moveTo(opp, stage.id);
                setDragId(null);
              }}
            >
              <div className="border-b bg-card px-3 py-2 rounded-t-lg">
                <p className="text-sm font-semibold">{stage.name}</p>
                <p className="text-xs text-muted-foreground">
                  {cards.length} opportunities · <span className="font-medium text-foreground">{aud(total)}</span>
                </p>
              </div>
              <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
                {cards.map((o) => {
                  const dialerId = o.contactId ? links.data?.contactMap.get(o.contactId) : undefined;
                  const meeting = dialerId ? links.data?.meetMap.get(dialerId) : undefined;
                  const title = o.contact?.name || o.name || o.contact?.phone || "Unnamed";
                  return (
                    <div
                      key={o.id}
                      draggable
                      onDragStart={() => setDragId(o.id)}
                      className="cursor-grab rounded-md border bg-card p-3 text-xs shadow-sm active:cursor-grabbing"
                    >
                      {dialerId ? (
                        <Link to={`/contacts/${dialerId}`} className="text-sm font-medium hover:underline">{title}</Link>
                      ) : (
                        <p className="text-sm font-medium">{title}</p>
                      )}
                      <dl className="mt-2 grid grid-cols-[88px_1fr] gap-y-1 text-muted-foreground">
                        {o.contact?.companyName && (<><dt>Business name:</dt><dd className="truncate text-foreground">{o.contact.companyName}</dd></>)}
                        {o.source && (<><dt>Source:</dt><dd className="truncate text-foreground">{o.source}</dd></>)}
                        <dt>Value:</dt><dd className="text-foreground">{aud(Number(o.monetaryValue) || 0)}</dd>
                      </dl>
                      {meeting && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          <CalendarDays className="h-3 w-3" /> {format(new Date(meeting), "MMM do, h:mm a")}
                        </span>
                      )}
                    </div>
                  );
                })}
                {cards.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No opportunities</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
