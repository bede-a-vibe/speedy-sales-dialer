import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PhoneIncoming, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CALL_OUTCOME_LABELS } from "@/lib/pipelineMappings";
import type { CallOutcome } from "@/data/constants";

export interface InboundCaller {
  id: string;
  business_name: string | null;
  dm_name: string | null;
  gatekeeper_name: string | null;
  state: string | null;
  industry: string | null;
  call_attempt_count: number | null;
  last_outcome: string | null;
  last_called_at: string | null;
  follow_up_note: string | null;
  next_followup_date: string | null;
  lifecycle_stage: string | null;
  matched_on: string | null;
  is_archived: boolean | null;
}

/** Look a ringing number up against the contact base (last-9 digit match). */
export function useInboundCaller(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return useQuery({
    queryKey: ["inbound-caller", digits.slice(-9)],
    enabled: digits.length >= 9,
    staleTime: 60_000,
    queryFn: async (): Promise<InboundCaller | null> => {
      const { data, error } = await supabase.rpc("identify_inbound_caller" as never, { _digits: digits } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as InboundCaller[];
      return rows[0] ?? null;
    },
  });
}

function sinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Who is ringing us. A returned call is the warmest lead of the day — the rep
 * should never answer one blind.
 */
export function IncomingCallerCard({ phone, onDismiss }: { phone: string; onDismiss?: () => void }) {
  const { data: caller, isLoading } = useInboundCaller(phone);

  const name = caller?.business_name?.trim() || null;
  const person = caller?.dm_name?.trim() || caller?.gatekeeper_name?.trim() || null;
  const since = sinceLabel(caller?.last_called_at ?? null);
  const lastOutcome = caller?.last_outcome
    ? CALL_OUTCOME_LABELS[caller.last_outcome as CallOutcome] ?? caller.last_outcome
    : null;

  return (
    <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <PhoneIncoming className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-sky-800 dark:text-sky-300">
          Incoming call
        </span>
        <span className="font-mono text-sm font-semibold">{phone}</span>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        )}
      </div>

      {!isLoading && !caller && (
        <p className="mt-1 text-xs text-muted-foreground">
          Not in the database — an unknown number, so treat it as a fresh inbound enquiry.
        </p>
      )}

      {caller && (
        <div className="mt-1.5 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {name ?? "Known contact"}
            {person && <span className="ml-2 text-xs font-normal text-muted-foreground">ask for {person}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {caller.industry && <Badge variant="outline" className="border-border text-[10px]">{caller.industry}</Badge>}
            {caller.state && <Badge variant="outline" className="border-border text-[10px]">{caller.state}</Badge>}
            {caller.matched_on === "decision maker line" && (
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                DM's own line
              </Badge>
            )}
            {caller.is_archived && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                Archived lead
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {since
              ? <>We called them <span className="font-medium text-foreground">{since}</span>{lastOutcome ? ` — ${lastOutcome.toLowerCase()}` : ""}
                  {caller.call_attempt_count ? ` · ${caller.call_attempt_count} attempt${caller.call_attempt_count === 1 ? "" : "s"}` : ""}.
                  {" "}They're ringing back.</>
              : "No outbound history — they found us."}
          </p>
          {caller.follow_up_note && (
            <p className="rounded bg-background/60 px-2 py-1 text-[11px] leading-relaxed">{caller.follow_up_note}</p>
          )}
          <Link
            to={`/contacts/${caller.id}`}
            className={cn("inline-flex items-center gap-1 text-xs text-primary hover:underline")}
          >
            Open the record <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
