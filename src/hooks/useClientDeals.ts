import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import {
  dealMrr,
  dealRevenueToDate,
  STREAM_ORDER,
  type ClientStream,
} from "@/lib/clientRevenue";

export type ClientDeal = Tables<"client_deals"> & {
  contact?: {
    id: string;
    business_name: string | null;
    state: string | null;
    lifecycle_stage: string | null;
  } | null;
};

export function useClientDeals() {
  return useQuery({
    queryKey: ["client-deals"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_deals")
        .select("*, contact:contacts(id, business_name, state, lifecycle_stage)")
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
}

export interface AgencyTotals {
  activeClients: number;
  totalMrr: number;
  totalRevenueToDate: number;
  mrrByStream: Record<ClientStream, number>;
}

export function useClientRollup() {
  const query = useClientDeals();
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
      });
    }

    clients.sort((a, b) => b.mrr - a.mrr);

    const totals: AgencyTotals = {
      activeClients,
      totalMrr,
      totalRevenueToDate,
      mrrByStream,
    };

    return { clients, totals };
  }, [query.data, now]);

  return { ...query, clients: rollup.clients, totals: rollup.totals };
}