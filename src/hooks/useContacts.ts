import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

const CONTACTS_BATCH_SIZE = 1000;
const DIALER_QUEUE_PAGE_SIZE = 100;
const DIALER_QUEUE_MAX_SIZE = 500;

export type Contact = Tables<"contacts"> & {
  latest_appointment_outcome: AppointmentOutcomeValue | null;
  latest_appointment_scheduled_for: string | null;
  latest_appointment_recorded_at: string | null;
};

type ContactQueryFilters = {
  industry?: string;
  state?: string;
  status?: string;
  includeDnc?: boolean;
};

type DialerContactsResult = {
  contacts: Contact[];
  totalCount: number;
};

async function fetchContactsInBatches({ industry, state, status, includeDnc = false }: ContactQueryFilters = {}) {
  const contacts: Contact[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + CONTACTS_BATCH_SIZE - 1);

    if (!includeDnc) {
      query = query.eq("is_dnc", false);
    }

    if (industry && industry !== "all") {
      query = query.eq("industry", industry);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (state && state !== "all") {
      query = query.eq("state", state);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data ?? []) as Contact[];
    contacts.push(...batch);

    if (batch.length < CONTACTS_BATCH_SIZE) {
      break;
    }

    from += CONTACTS_BATCH_SIZE;
  }

  return contacts;
}

async function fetchDialerContacts({ industry, state, status = "uncalled", includeDnc = false, limit = DIALER_QUEUE_PAGE_SIZE }: ContactQueryFilters & { limit?: number } = {}): Promise<DialerContactsResult> {
  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, DIALER_QUEUE_MAX_SIZE));

  if (!includeDnc) {
    query = query.eq("is_dnc", false);
  }

  if (industry && industry !== "all") {
    query = query.eq("industry", industry);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (state && state !== "all") {
    query = query.eq("state", state);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    contacts: (data ?? []) as Contact[],
    totalCount: count ?? 0,
  };
}

export function useContacts(industry?: string) {
  return useQuery({
    queryKey: ["contacts", industry],
    queryFn: () => fetchContactsInBatches({ industry }),
  });
}

export function useAllContacts(industry?: string) {
  return useQuery({
    queryKey: ["all-contacts", industry],
    queryFn: () => fetchContactsInBatches({ industry, includeDnc: true }),
  });
}

export function useUncalledContacts(industry?: string, state?: string) {
  return useQuery({
    queryKey: ["uncalled-contacts", industry, state],
    queryFn: () => fetchContactsInBatches({ industry, state, status: "uncalled" }),
  });
}

export function useDialerContacts(industry?: string, state?: string, hiddenCount = 0) {
  const limit = Math.min(DIALER_QUEUE_PAGE_SIZE + Math.max(hiddenCount, 0), DIALER_QUEUE_MAX_SIZE);

  return useQuery({
    queryKey: ["dialer-contacts", industry, state, limit],
    queryFn: () => fetchDialerContacts({ industry, state, status: "uncalled", limit }),
    staleTime: 15_000,
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { error } = await supabase.from("contacts").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
    },
  });
}
