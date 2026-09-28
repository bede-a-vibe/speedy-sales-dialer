import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

type Item = {
  id: string;
  contact_id: string;
  created_by: string | null;
  created_at: string;
  scheduled_for: string | null;
  status: string;
  appointment_outcome: string | null;
  deal_stage: string | null;
  deal_value: number | null;
  monthly_recurring_value: number | null;
  expected_close_date: string | null;
  closed_at: string | null;
  contacts: { business_name: string | null } | null;
};

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function stageOf(i: Item): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  if (i.appointment_outcome === "showed_closed" || i.deal_stage === "won") return { label: "Won", tone: "default" };
  if (i.status === "canceled" || i.deal_stage === "lost" || i.appointment_outcome === "no_show" || i.appointment_outcome === "showed_no_close")
    return { label: i.appointment_outcome === "no_show" ? "No-show" : "Lost", tone: "destructive" };
  if (i.appointment_outcome) return { label: "Showed — open", tone: "secondary" };
  return { label: "Booked", tone: "outline" };
}

const revenue = (i: Item) => Number(i.deal_value ?? 0) + Number(i.monthly_recurring_value ?? 0) * 12;

export function MeetingRevenuePipeline() {
  const { data: reps = [] } = useSalesReps();
  const [rep, setRep] = useState<string>("all");
  const [days, setDays] = useState("90");
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["meeting-revenue", days],
    queryFn: async () => {
      const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("pipeline_items")
        .select("id, contact_id, created_by, created_at, scheduled_for, status, appointment_outcome, deal_stage, deal_value, monthly_recurring_value, expected_close_date, closed_at, contacts:contacts!pipeline_items_contact_id_fkey(business_name)")
        .eq("pipeline_type", "booked")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });

  const name = (id: string | null) => {
    const r = reps.find((x) => x.user_id === id);
    return r?.display_name || r?.email || "—";
  };

  const rows = useMemo(() => (rep === "all" ? items : items.filter((i) => i.created_by === rep)), [items, rep]);
  const summary = useMemo(() => {
    const won = rows.filter((i) => stageOf(i).label === "Won");
    const showed = rows.filter((i) => i.appointment_outcome && i.appointment_outcome !== "no_show");
    const open = rows.filter((i) => ["Booked", "Showed — open"].includes(stageOf(i).label));
    return {
      booked: rows.length,
      showed: showed.length,
      won: won.length,
      revenue: won.reduce((s, i) => s + revenue(i), 0),
      open: open.length,
    };
  }, [rows]);

  const saveCloseDate = async (id: string, value: string) => {
    const { error } = await supabase.from("pipeline_items").update({ expected_close_date: value || null }).eq("id", id);
    if (error) return toast.error("Couldn't save close date");
    toast.success("Close date saved");
    qc.invalidateQueries({ queryKey: ["meeting-revenue"] });
  };

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Meetings → revenue</h2>
          <p className="text-sm text-muted-foreground">Every booked meeting, who set it, its close date and what it turned into.</p>
        </div>
        <div className="flex gap-2">
          <Select value={rep} onValueChange={setRep}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All setters</SelectItem>
              {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.display_name || r.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Booked last 7 days</SelectItem>
              <SelectItem value="30">Booked last 30 days</SelectItem>
              <SelectItem value="90">Booked last 90 days</SelectItem>
              <SelectItem value="365">Booked last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "Meetings booked", v: summary.booked },
          { l: "Showed", v: `${summary.showed} (${pct(summary.showed, summary.booked)})` },
          { l: "Won", v: `${summary.won} (${pct(summary.won, summary.booked)})` },
          { l: "Revenue won (1st yr)", v: aud(summary.revenue) },
          { l: "Still open", v: summary.open },
        ].map((s) => (
          <div key={s.l} className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className="text-lg font-semibold font-mono text-foreground">{s.v}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Setter</TableHead>
              <TableHead>Meeting</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Close date</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No meetings booked in this period.</TableCell></TableRow>}
            {rows.map((i) => {
              const st = stageOf(i);
              const closed = !!i.closed_at;
              const overdue = !closed && i.expected_close_date && i.expected_close_date < new Date().toISOString().slice(0, 10);
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-medium"><Link className="hover:underline" to={`/contacts/${i.contact_id}`}>{i.contacts?.business_name || "Unknown"}</Link></TableCell>
                  <TableCell>{name(i.created_by)}</TableCell>
                  <TableCell className="font-mono text-xs">{i.scheduled_for ? new Date(i.scheduled_for).toLocaleString("en-AU", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit" }) : "—"}</TableCell>
                  <TableCell><Badge variant={st.tone}>{st.label}</Badge></TableCell>
                  <TableCell>
                    {closed ? (
                      <span className="font-mono text-xs">Closed {new Date(i.closed_at!).toLocaleDateString("en-AU")}</span>
                    ) : (
                      <Input type="date" defaultValue={i.expected_close_date ?? ""} className={`h-8 w-36 font-mono text-xs ${overdue ? "border-destructive" : ""}`} onBlur={(e) => e.target.value !== (i.expected_close_date ?? "") && saveCloseDate(i.id, e.target.value)} />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{revenue(i) ? aud(revenue(i)) : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">Close dates default to 14 days after the meeting; red means it's past due and still open. Revenue = setup fee + 12 months of retainer, filled when the meeting outcome is logged as closed.</p>
    </div>
  );
}
