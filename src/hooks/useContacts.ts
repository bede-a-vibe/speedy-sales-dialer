import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

const CONTACTS_BATCH_SIZE = 1000;
const DIALER_QUEUE_PAGE_SIZE = 100;
const DIALER_QUEUE_MAX_SIZE = 500;
const DIALER_TARGET_BUFFER = 40;
const DIALER_PREFETCH_THRESHOLD = 25;
const DIALER_CLAIM_SIZE = 25;
const DIALER_INITIAL_CLAIM_SIZE = 12;
const DIALER_LOCK_MINUTES = 15;
const DIALER_HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const DIALER_PREVIEW_DEBOUNCE_MS = 250;

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

type ClaimDialerLeadsResponse = {
  claimed_contacts: Contact[];
  total_available_count: number;
};

type RollingDialerQueueOptions = {
  industry?: string;
  state?: string;
  userId?: string | null;
};

type DiscardDialerContactOptions = {
  releaseLock?: boolean;
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

async function invokeDialerRpc<T>(fnName: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fnName as never, params as never);
  if (error) {
    throw new Error(error.message || "Dialer queue request failed.");
  }

  return data as T;
}

async function claimDialerLeads({
  sessionId,
  industry,
  state,
  claimSize,
}: {
  sessionId: string;
  industry?: string;
  state?: string;
  claimSize: number;
}) {
  return invokeDialerRpc<ClaimDialerLeadsResponse>("claim_dialer_leads", {
    _session_id: sessionId,
    _industry: industry && industry !== "all" ? industry : null,
    _state: state && state !== "all" ? state : null,
    _claim_size: claimSize,
    _lock_minutes: DIALER_LOCK_MINUTES,
  });
}

async function refreshDialerLeadLocks(sessionId: string, contactIds: string[]) {
  if (contactIds.length === 0) return 0;

  return invokeDialerRpc<number>("refresh_dialer_lead_locks", {
    _session_id: sessionId,
    _contact_ids: contactIds,
    _lock_minutes: DIALER_LOCK_MINUTES,
  });
}

async function releaseDialerLeadLocks(sessionId: string, contactIds?: string[]) {
  return invokeDialerRpc<number>("release_dialer_lead_locks", {
    _session_id: sessionId,
    _contact_ids: contactIds && contactIds.length > 0 ? contactIds : null,
  });
}

async function clearDialerLeadLocksForUser(userId: string) {
  const { count, error } = await supabase
    .from("dialer_lead_locks")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}

async function getDialerQueueCount({
  sessionId,
  industry,
  state,
}: {
  sessionId: string;
  industry?: string;
  state?: string;
}) {
  return invokeDialerRpc<number>("get_dialer_queue_count", {
    _session_id: sessionId,
    _industry: industry && industry !== "all" ? industry : null,
    _state: state && state !== "all" ? state : null,
  });
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

export function useRollingDialerQueue({ industry, state }: RollingDialerQueueOptions) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const contactsRef = useRef<Contact[]>([]);
  const sessionRef = useRef<string | null>(null);
  const claimInFlightRef = useRef<Promise<number> | null>(null);
  const startInFlightRef = useRef<Promise<number> | null>(null);
  const stopInFlightRef = useRef<Promise<void> | null>(null);
  const previewSessionIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const claimIntoBuffer = useCallback(async (activeSessionId: string, seedContacts: Contact[], desiredMinimum: number) => {
    const seenIds = new Set(seedContacts.map((contact) => contact.id));
    const mergedContacts = [...seedContacts];
    let latestTotalCount = mergedContacts.length;

    while (mergedContacts.length < desiredMinimum) {
      const response = await claimDialerLeads({
        sessionId: activeSessionId,
        industry,
        state,
        claimSize: DIALER_CLAIM_SIZE,
      });

      latestTotalCount = Math.max(response.total_available_count ?? 0, mergedContacts.length);
      const newlyClaimed = (response.claimed_contacts ?? []).filter((contact) => !seenIds.has(contact.id));

      if (newlyClaimed.length === 0) {
        break;
      }

      newlyClaimed.forEach((contact) => seenIds.add(contact.id));
      mergedContacts.push(...newlyClaimed);

      if (latestTotalCount <= mergedContacts.length) {
        break;
      }
    }

    return {
      contacts: mergedContacts,
      totalCount: Math.max(latestTotalCount, mergedContacts.length),
      claimedCount: mergedContacts.length - seedContacts.length,
    };
  }, [industry, state]);

  const cleanupSessionLocks = useCallback(async (staleSessionId: string | null) => {
    if (!staleSessionId) return;

    try {
      await releaseDialerLeadLocks(staleSessionId);
    } catch {
      // Lock expiry handles abandoned cleanup.
    }
  }, []);

  const stopSession = useCallback(async () => {
    if (stopInFlightRef.current) {
      return stopInFlightRef.current;
    }

    const activeSessionId = sessionRef.current;
    sessionRef.current = null;
    startInFlightRef.current = null;
    setSessionId(null);
    contactsRef.current = [];
    setContacts([]);
    setTotalCount(0);
    claimInFlightRef.current = null;
    setIsLoading(false);
    setIsPrefetching(false);

    const task = cleanupSessionLocks(activeSessionId).finally(() => {
      if (stopInFlightRef.current === task) {
        stopInFlightRef.current = null;
      }
    });

    stopInFlightRef.current = task;
    return task;
  }, [cleanupSessionLocks]);

  const ensureBuffer = useCallback(async (desiredMinimum = DIALER_TARGET_BUFFER) => {
    if (!sessionRef.current) return 0;

    if (claimInFlightRef.current) {
      return claimInFlightRef.current;
    }

    setIsPrefetching(true);
    const activeSessionId = sessionRef.current;
    const task = claimIntoBuffer(activeSessionId, contactsRef.current, desiredMinimum)
      .then(async ({ contacts: nextContacts, totalCount: nextTotalCount, claimedCount }) => {
        if (sessionRef.current === activeSessionId) {
          contactsRef.current = nextContacts;
          setContacts(nextContacts);
          setTotalCount(nextTotalCount);
        } else {
          await cleanupSessionLocks(activeSessionId);
        }

        return claimedCount;
      })
      .catch(async (error) => {
        if (sessionRef.current !== activeSessionId) {
          await cleanupSessionLocks(activeSessionId);
        }
        throw error;
      })
      .finally(() => {
        if (claimInFlightRef.current === task) {
          claimInFlightRef.current = null;
        }
        setIsPrefetching(false);
      });

    claimInFlightRef.current = task;
    return task;
  }, [claimIntoBuffer, cleanupSessionLocks]);

  const startSession = useCallback(async () => {
    if (startInFlightRef.current) {
      return startInFlightRef.current;
    }

    const task = (async () => {
      if (stopInFlightRef.current) {
        await stopInFlightRef.current;
      }

      if (sessionRef.current) {
        await stopSession();
      }

      const activeSessionId = crypto.randomUUID();
      sessionRef.current = activeSessionId;
      setSessionId(activeSessionId);
      contactsRef.current = [];
      setContacts([]);
      setTotalCount(0);
      setPreviewCount(0);
      setIsLoading(true);
      claimInFlightRef.current = null;

      try {
        const { contacts: claimedContacts, totalCount: claimedTotalCount } = await claimIntoBuffer(
          activeSessionId,
          [],
          DIALER_INITIAL_CLAIM_SIZE,
        );

        if (sessionRef.current !== activeSessionId) {
          await cleanupSessionLocks(activeSessionId);
          return 0;
        }

        contactsRef.current = claimedContacts;
        setContacts(claimedContacts);
        setTotalCount(claimedTotalCount);
        void ensureBuffer(DIALER_TARGET_BUFFER);

        return claimedContacts.length;
      } catch (error) {
        if (sessionRef.current !== activeSessionId) {
          await cleanupSessionLocks(activeSessionId);
          return 0;
        }
        throw error;
      } finally {
        if (sessionRef.current === activeSessionId) {
          setIsLoading(false);
        }
      }
    })().finally(() => {
      if (startInFlightRef.current === task) {
        startInFlightRef.current = null;
      }
    });

    startInFlightRef.current = task;
    return task;
  }, [claimIntoBuffer, cleanupSessionLocks, ensureBuffer, stopSession]);

  const discardContact = useCallback(async (contactId: string, options?: DiscardDialerContactOptions) => {
    const activeSessionId = sessionRef.current;

    contactsRef.current = contactsRef.current.filter((contact) => contact.id !== contactId);
    setContacts(contactsRef.current);
    setTotalCount((current) => Math.max(current - 1, contactsRef.current.length));

    if (!options?.releaseLock || !activeSessionId) return;

    try {
      await releaseDialerLeadLocks(activeSessionId, [contactId]);
    } catch {
      // If release fails, expiry still clears the lock.
    }
  }, []);

  useEffect(() => {
    if (!sessionId || contacts.length > DIALER_PREFETCH_THRESHOLD) return;
    void ensureBuffer();
  }, [contacts.length, ensureBuffer, sessionId]);

  useEffect(() => {
    if (!sessionId || contacts.length === 0) return;

    const intervalId = window.setInterval(() => {
      void refreshDialerLeadLocks(sessionId, contactsRef.current.map((contact) => contact.id));
    }, DIALER_HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [contacts.length, sessionId]);

  const refreshPreviewCount = useCallback(async () => {
    if (sessionRef.current) return;

    setIsLoading(true);

    try {
      const count = await getDialerQueueCount({
        sessionId: previewSessionIdRef.current,
        industry,
        state,
      });

      if (!sessionRef.current) {
        setPreviewCount(count ?? 0);
      }
    } catch {
      if (!sessionRef.current) {
        setPreviewCount(0);
      }
    } finally {
      if (!sessionRef.current) {
        setIsLoading(false);
      }
    }
  }, [industry, state]);

  useEffect(() => {
    if (sessionRef.current) return;

    const timeoutId = window.setTimeout(() => {
      void refreshPreviewCount();
    }, DIALER_PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshPreviewCount, sessionId]);

  useEffect(() => {
    const handlePageHide = () => {
      const activeSessionId = sessionRef.current;
      if (activeSessionId) {
        void releaseDialerLeadLocks(activeSessionId);
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  useEffect(() => () => {
    const activeSessionId = sessionRef.current;
    if (activeSessionId) {
      void releaseDialerLeadLocks(activeSessionId);
    }
  }, []);

  return {
    contacts,
    totalCount: sessionId ? totalCount : previewCount,
    sessionId,
    isLoading,
    isPrefetching,
    startSession,
    stopSession,
    ensureBuffer,
    discardContact,
    refreshPreviewCount,
  };
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
      queryClient.invalidateQueries({ queryKey: ["dialer-contacts"] });
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
      queryClient.invalidateQueries({ queryKey: ["dialer-contacts"] });
    },
  });
}

export function useClearOwnDialerLeadLocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => clearDialerLeadLocksForUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dialer-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
    },
  });
}
