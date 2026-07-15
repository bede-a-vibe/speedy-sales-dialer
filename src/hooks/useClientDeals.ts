import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import {
  dealMrr,
  dealRevenueToDate,
  grossMonthly,
  STREAM_ORDER,
  type ClientStream,
} from "@/lib/clientRevenue";

export type ClientDeal = Tables<"client_deals"> & {
  contact?: {
    id: string;
    business_name: string | null;
    state: string | null;
    lifecycle_stage: string | null;
    meeting_booked_date: string | null;
    client_follow_up_date: string | null;
    client_follow_up_note: string | null;
  } | null;
};

export function useClientDeals() {
  return useQuery({
    queryKey: ["client-deals"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_deals")
        .select("*, contact:contacts(id, business_name, state, lifecycle_stage, meeting_booked_date, client_follow_up_date, client_follow_up_note)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientDeal[];
    },
  });
}

async function ensureContactMarkedWon(contactId: string) {
  const { data } = await supabase
    .from("contacts")
    .select("id, lifecycle_stage, status")
    .eq("id", contactId)
    .maybeSingle();
  if (!data) return;
  const patch: { lifecycle_stage?: string; status?: string } = {};
  if (data.lifecycle_stage !== "won") patch.lifecycle_stage = "won";
  if (data.status !== "closed") patch.status = "closed";
  if (Object.keys(patch).length > 0) {
    await supabase.from("contacts").update(patch).eq("id", contactId);
  }
}

export function useCreateClientDeal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"client_deals">, "created_by">) => {
      const payload: TablesInsert<"client_deals"> = { ...input, created_by: user?.id ?? null };
      const { data, error } = await supabase.from("client_deals").insert(payload).select("*").single();
      if (error) throw error;
      await ensureContactMarkedWon(input.contact_id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-deals"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateClientDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"client_deals"> }) => {
      const { data, error } = await supabase.from("client_deals").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-deals"] }),
  });
}

export function useDeleteClientDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-deals"] }),
  });
}

export function useUpdateClientFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, date, note }: { contactId: string; date?: string | null; note?: string | null }) => {
      const patch: { client_follow_up_date?: string | null; client_follow_up_note?: string | null } = {};
      if (date !== undefined) patch.client_follow_up_date = date;
      if (note !== undefined) patch.client_follow_up_note = note;
      const { error } = await supabase.from("contacts").update(patch).eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-deals"] });
      qc.invalidateQueries({ queryKey: ["won-client-contacts"] });
    },
  });
}

export interface ClientRollupRow {
  contactId: string;
  businessName: string;
  state: string | null;
  mrr: number;
  revenueToDate: number;
  streams: ClientStream[];
  activeStreamCount: number;
  clientSince: string | null;
  status: "active" | "paused" | "churned";
  deals: ClientDeal[];
  /** False = a won client with no deal recorded yet (needs deal $ entered). */
  dealRecorded: boolean;
  /** First appointment booked (meeting_booked_date) — start of the sales cycle. */
  firstBookingDate: string | null;
  /** Sign/payment date = earliest deal start_date. */
  signDate: string | null;
  /** Days from first booking to sign/pay; null unless both dates exist. */
  salesCycleDays: number | null;
  /** True = deposit paid / onboarding (a deal exists but no active recurring MRR). */
  isOnboarding: boolean;
  followUpDate: string | null;
  followUpNote: string | null;
}

export interface AgencyTotals {
  activeClients: number;
  totalMrr: number;
  totalRevenueToDate: number;
  churnedMrr: number;
  mrrByStream: Record<ClientStream, number>;
  /** Won clients with no deal recorded yet. */
  pendingClients: number;
  /** Average sales-cycle length (days) across clients with both dates. */
  avgSalesCycleDays: number | null;
}

function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (isNaN(from) || isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Won contacts (clients that were closed) — used to surface clients even before a deal $ is entered. */
export function useWonClientContacts() {
  return useQuery({
    queryKey: ["won-client-contacts"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, business_name, state, meeting_booked_date, client_follow_up_date, client_follow_up_note")
        .eq("lifecycle_stage", "won");
      if (error) throw error;
      return (data ?? []) as {
        id: string; business_name: string | null; state: string | null;
        meeting_booked_date: string | null; client_follow_up_date: string | null; client_follow_up_note: string | null;
      }[];
    },
  });
}

export function useClientRollup() {
  const query = useClientDeals();
  const wonQuery = useWonClientContacts();
  const now = new Date();

  const rollup = useMemo(() => {
    const deals = query.data ?? [];
    const byContact = new Map<string, ClientDeal[]>();
    for (const d of deals) {
      const arr = byContact.get(d.contact_id) ?? [];
      arr.push(d);
      byContact.set(d.contact_id, arr);
    }

    const clients: ClientRollupRow[] = [];
    const mrrByStream = STREAM_ORDER.reduce((acc, s) => {
      acc[s] = 0;
      return acc;
    }, {} as Record<ClientStream, number>);
    let totalMrr = 0;
    let totalRevenueToDate = 0;
    let churnedMrr = 0;
    let activeClients = 0;

    for (const [contactId, ds] of byContact) {
      const contact = ds.find((d) => d.contact)?.contact ?? null;
      let mrr = 0;
      let rev = 0;
      const streamSet = new Set<ClientStream>();
      let activeStreamCount = 0;
      let minStart: string | null = null;
      let anyActive = false;
      let anyPaused = false;
      for (const d of ds) {
        const m = dealMrr(d);
        mrr += m;
        mrrByStream[d.stream as ClientStream] = (mrrByStream[d.stream as ClientStream] || 0) + m;
        rev += dealRevenueToDate(d, now);
        streamSet.add(d.stream as ClientStream);
        if (d.status === "active") {
          activeStreamCount += 1;
          anyActive = true;
        } else if (d.status === "paused") {
          anyPaused = true;
        } else if (d.status === "churned") {
          churnedMrr += grossMonthly(d);
        }
        if (!minStart || d.start_date < minStart) minStart = d.start_date;
      }
      const status: ClientRollupRow["status"] = anyActive ? "active" : anyPaused ? "paused" : "churned";
      if (status === "active") activeClients += 1;
      totalMrr += mrr;
      totalRevenueToDate += rev;

      clients.push({
        contactId,
        businessName: contact?.business_name ?? "Unknown business",
        state: contact?.state ?? null,
        mrr,
        revenueToDate: rev,
        streams: STREAM_ORDER.filter((s) => streamSet.has(s)),
        activeStreamCount,
        clientSince: minStart,
        status,
        deals: ds.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1)),
        dealRecorded: true,
        firstBookingDate: contact?.meeting_booked_date ?? null,
        signDate: minStart,
        salesCycleDays: daysBetween(contact?.meeting_booked_date ?? null, minStart),
        // Deposit paid / onboarding = only one-off deals (a deposit), never a
        // recurring engagement. NOT a client whose recurring deal churned/paused.
        isOnboarding: status !== "churned" && ds.every((d) => d.billing_period === "one_off"),
        followUpDate: contact?.client_follow_up_date ?? null,
        followUpNote: contact?.client_follow_up_note ?? null,
      });
    }

    // Surface won clients that have no deal recorded yet, so nothing sold hides
    // just because the $ wasn't entered. They show 0 MRR + a "Add deal" prompt.
    let pendingClients = 0;
    for (const wc of wonQuery.data ?? []) {
      if (byContact.has(wc.id)) continue;
      pendingClients += 1;
      clients.push({
        contactId: wc.id,
        businessName: wc.business_name ?? "Unknown business",
        state: wc.state ?? null,
        mrr: 0,
        revenueToDate: 0,
        streams: [],
        activeStreamCount: 0,
        clientSince: null,
        status: "active",
        deals: [],
        dealRecorded: false,
        firstBookingDate: wc.meeting_booked_date ?? null,
        signDate: null,
        salesCycleDays: null,
        isOnboarding: false,
        followUpDate: wc.client_follow_up_date ?? null,
        followUpNote: wc.client_follow_up_note ?? null,
      });
    }

    clients.sort((a, b) => {
      // Clients with recorded deals first (by MRR desc), pending ones after (by name).
      if (a.dealRecorded !== b.dealRecorded) return a.dealRecorded ? -1 : 1;
      if (!a.dealRecorded) return a.businessName.localeCompare(b.businessName);
      return b.mrr - a.mrr;
    });

    const cycleDays = clients.map((c) => c.salesCycleDays).filter((d): d is number => d != null);
    const avgSalesCycleDays = cycleDays.length > 0
      ? Math.round(cycleDays.reduce((s, d) => s + d, 0) / cycleDays.length)
      : null;

    const totals: AgencyTotals = {
      activeClients,
      totalMrr,
      totalRevenueToDate,
      churnedMrr,
      mrrByStream,
      pendingClients,
      avgSalesCycleDays,
    };

    return { clients, totals };
  }, [query.data, wonQuery.data, now]);

  return { ...query, clients: rollup.clients, totals: rollup.totals };
}