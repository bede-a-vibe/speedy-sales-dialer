import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { PhoneForwarded, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DQ_REASONS,
  NO_CLOSE_REASONS,
  getAppointmentOutcomeLabel,
  getOutcomeReasonLabel,
  type AppointmentOutcomeValue,
} from "@/lib/appointments";
import type { SalesRepOption } from "@/hooks/usePipelineItems";

type Row = {
  id: string;
  contact_id: string;
  assigned_user_id: string;
  created_by: string;
  scheduled_for: string | null;
  appointment_outcome: AppointmentOutcomeValue | null;
  outcome_reason: string | null;
  recording_url: string | null;
  phone_recording_url: string | null;
  deal_value: number | null;
  monthly_recurring_value: number | null;
  contacts: { business_name: string | null } | null;
};

const SHOWED: AppointmentOutcomeValue[] = [
  "showed_closed",
  "showed_no_close",
  "no_close_follow_up",
  "showed_verbal_commitment",
  "second_meeting_booked",
  "disqualified",
];
const NO_CLOSE: AppointmentOutcomeValue[] = ["showed_no_close", "no_close_follow_up"];

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-foreground">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ReasonBars({ title, reasons, rows }: { title: string; reasons: readonly { value: string; label: string }[]; rows: Row[] }) {
  const counts = reasons.map((r) => ({ ...r, n: rows.filter((row) => row.outcome_reason === r.value).length }));
  const missing = rows.filter((row) => !row.outcome_reason || !reasons.some((r) => r.value === row.outcome_reason)).length;
  const max = Math.max(1, ...counts.map((c) => c.n), missing);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {[...counts, ...(missing ? [{ value: "none", label: "No reason recorded", n: missing }] : [])].map((c) => (
          <div key={c.value} className="text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{c.label}</span>
              <span className="font-mono text-foreground">{c.n} · {pct(c.n, rows.length)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div className={c.value === "none" ? "h-2 rounded-full bg-muted-foreground/40" : "h-2 rounded-full bg-primary"} style={{ width: `${(c.n / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-xs text-muted-foreground">None in this period.</p> : null}
      </div>
    </div>
  );
}

export function CloseTrackingPanel({ reps }: { reps: SalesRepOption[] }) {
  const [days, setDays] = useState("30");
  const [closer, setCloser] = useState("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["close-tracking", days],
    staleTime: 30_000,
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("pipeline_items")
        .select(
          "id, contact_id, assigned_user_id, created_by, scheduled_for, appointment_outcome, outcome_reason, recording_url, phone_recording_url, deal_value, monthly_recurring_value, contacts:contacts!pipeline_items_contact_id_fkey(business_name)",
        )
        .eq("pipeline_type", "booked")
        .gte("scheduled_for", since)
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const repName = useMemo(() => new Map(reps.map((r) => [r.user_id, r.display_name?.trim() || r.email || "Rep"])), [reps]);
  const scoped = closer === "all" ? rows : rows.filter((r) => r.assigned_user_id === closer);

  const recorded = scoped.filter((r) => r.appointment_outcome && r.appointment_outcome !== "rescheduled");
  const noShows = recorded.filter((r) => r.appointment_outcome === "no_show").length;
  const showed = recorded.filter((r) => SHOWED.includes(r.appointment_outcome!));
  const dq = showed.filter((r) => r.appointment_outcome === "disqualified");
  const qualified = showed.length - dq.length;
  const closed = showed.filter((r) => r.appointment_outcome === "showed_closed");
  const noClose = showed.filter((r) => NO_CLOSE.includes(r.appointment_outcome!));
  const pending = scoped.filter((r) => !r.appointment_outcome).length;
  const revenue = closed.reduce((s, r) => s + (r.deal_value ?? 0) + (r.monthly_recurring_value ?? 0) * 12, 0);
  const withRecording = showed.filter((r) => r.recording_url || r.phone_recording_url).length;

  const lost = [...noClose, ...dq];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Close tracking</h4>
          <p className="text-xs text-muted-foreground">
            Meetings that have already happened, by closer. Close rate is closed ÷ qualified shows (DQs are left out, since they were never going to buy).
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={closer} onValueChange={setCloser}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All closers</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.user_id} value={r.user_id}>{r.display_name?.trim() || r.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Tile label="Meetings held" value={recorded.length} sub={pending ? `${pending} still need an outcome` : "All recorded"} />
            <Tile label="Showed" value={showed.length} sub={`${pct(showed.length, showed.length + noShows)} show rate`} />
            <Tile label="DQ" value={dq.length} sub={`${pct(dq.length, showed.length)} of shows`} />
            <Tile label="Closed" value={closed.length} sub={`${pct(closed.length, qualified)} close rate`} />
            <Tile label="No close" value={noClose.length} sub={`${pct(noClose.length, qualified)} of qualified`} />
            <Tile label="Revenue won" value={money(revenue)} sub="Setup + 12 months retainer" />
            <Tile label="Recorded" value={`${withRecording}/${showed.length}`} sub="Shows with a Fathom or call link" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ReasonBars title="Why they didn't close" reasons={NO_CLOSE_REASONS} rows={noClose} />
            <ReasonBars title="Why they were DQ'd" reasons={DQ_REASONS} rows={dq} />
          </div>

          <div className="rounded-lg border border-border bg-card">
            <p className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">No-close and DQ meetings</p>
            {lost.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">None in this period.</p>
            ) : (
              <div className="divide-y divide-border">
                {lost.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs">
                    <Link to={`/contacts/${r.contact_id}`} className="min-w-[180px] font-medium text-foreground hover:text-primary hover:underline">
                      {r.contacts?.business_name ?? "Unknown business"}
                    </Link>
                    <span className="text-muted-foreground">{r.scheduled_for ? format(new Date(r.scheduled_for), "d MMM") : "—"}</span>
                    <span className="text-muted-foreground">{repName.get(r.assigned_user_id) ?? "—"}</span>
                    <span className="rounded-full border border-border px-2 py-0.5">{getAppointmentOutcomeLabel(r.appointment_outcome)}</span>
                    <span className={r.outcome_reason ? "text-foreground" : "text-amber-600"}>
                      {getOutcomeReasonLabel(r.outcome_reason) ?? "No reason recorded"}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {r.recording_url ? (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <a href={r.recording_url} target="_blank" rel="noreferrer"><Video className="h-3.5 w-3.5" /> Fathom</a>
                        </Button>
                      ) : null}
                      {r.phone_recording_url ? (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <a href={r.phone_recording_url} target="_blank" rel="noreferrer"><PhoneForwarded className="h-3.5 w-3.5" /> Call</a>
                        </Button>
                      ) : null}
                      {!r.recording_url && !r.phone_recording_url ? <span className="text-muted-foreground">No recording</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
