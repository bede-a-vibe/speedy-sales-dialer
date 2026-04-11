import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

const DIALER_TARGET_BUFFER = 40;
const DIALER_PREFETCH_THRESHOLD = 25;
const DIALER_CLAIM_SIZE = 25;
const DIALER_INITIAL_CLAIM_SIZE = 12;
const DIALER_LOCK_MINUTES = 15;
const DIALER_HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const DIALER_PREVIEW_DEBOUNCE_MS = 250;
const DIALER_MIN_BUFFER_FLOOR = 8;
const DIALER_EMPTY_REFILL_RETRY_LIMIT = 3;
const DIALER_EMPTY_REFILL_BACKOFF_MS = 400;
const DIALER_EXHAUSTION_GRACE_MS = 5000;

export type Contact = Tables<"contacts"> & {
  latest_appointment_outcome: AppointmentOutcomeValue | null;
  latest_appointment_scheduled_for: string | null;
  latest_appointment_recorded_at: string | null;
};

type ClaimDialerLeadsResponse = {
  claimed_contacts: Contact[];
  total_available_count: number;
};

export type DialerFilterOptions = {
  industries?: string[];
  states?: string[];
  tradeTypes?: string[];
  workType?: string;
  businessSize?: string;
  prospectTier?: string;
  minGbpRating?: number | null;
  minReviewCount?: number | null;
  hasGoogleAds?: string;
  hasFacebookAds?: string;
  buyingSignalStrength?: string;
  phoneType?: string;
  hasDmPhone?: string;
  contactOwner?: string;
};

type RollingDialerQueueOptions = {
  userId?: string | null;
  filters?: DialerFilterOptions;
};

export type DialerQueueHealth =
  | "idle"
  | "bootstrapping"
  | "healthy"
  | "refilling"
  | "degraded"
  | "exhausted";

export type DialerQueueSupervisorMeta = {
  health: DialerQueueHealth;
  lastRefillStartedAt: number | null;
  lastRefillFinishedAt: number | null;
  lastSuccessfulClaimAt: number | null;
  consecutiveEmptyRefills: number;
  lastKnownAvailableCount: number | null;
  exhaustionGraceUntil: number | null;
};

export type DialerQueueReconcileReason =
  | "session_start"
  | "buffer_low"
  | "buffer_empty"
  | "contact_discarded"
  | "manual_recover"
  | "periodic_sweep";

type ReconcileResult = {
  claimedCount: number;
  availableCount: number | null;
  health: DialerQueueHealth;
};

type DiscardDialerContactOptions = {
  releaseLock?: boolean;
};


async function invokeDialerRpc<T>(fnName: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fnName as never, params as never);
  if (error) {
    throw new Error(error.message || "Dialer queue request failed.");
  }

  return data as T;
}

async function claimDialerLeads({
  sessionId,
  claimSize,
  filters,
}: {
  sessionId: string;
  claimSize: number;
  filters?: DialerFilterOptions;
}) {
  return invokeDialerRpc<ClaimDialerLeadsResponse>("claim_dialer_leads", {
    _session_id: sessionId,
    _claim_size: claimSize,
    _lock_minutes: DIALER_LOCK_MINUTES,
    _industries: filters?.industries && filters.industries.length > 0 ? filters.industries : null,
    _states: filters?.states && filters.states.length > 0 ? filters.states : null,
    _trade_types: filters?.tradeTypes && filters.tradeTypes.length > 0 ? filters.tradeTypes : null,
    _work_type: filters?.workType && filters.workType !== "all" ? filters.workType : null,
    _business_size: filters?.businessSize && filters.businessSize !== "all" ? filters.businessSize : null,
    _prospect_tier: filters?.prospectTier && filters.prospectTier !== "all" ? filters.prospectTier : null,
    _min_gbp_rating: filters?.minGbpRating && filters.minGbpRating > 0 ? filters.minGbpRating : null,
    _min_review_count: filters?.minReviewCount && filters.minReviewCount > 0 ? filters.minReviewCount : null,
    _has_google_ads: filters?.hasGoogleAds && filters.hasGoogleAds !== "all" ? filters.hasGoogleAds : null,
    _has_facebook_ads: filters?.hasFacebookAds && filters.hasFacebookAds !== "all" ? filters.hasFacebookAds : null,
    _buying_signal_strength: filters?.buyingSignalStrength && filters.buyingSignalStrength !== "all" ? filters.buyingSignalStrength : null,
    _phone_type: filters?.phoneType && filters.phoneType !== "all" ? filters.phoneType : null,
    _has_dm_phone: filters?.hasDmPhone === "yes" ? true : filters?.hasDmPhone === "no" ? false : null,
    _contact_owner: filters?.contactOwner && filters.contactOwner !== "all" ? (filters.contactOwner === "unassigned" ? "unassigned" : filters.contactOwner) : null,
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
  filters,
}: {
  sessionId: string;
  filters?: DialerFilterOptions;
}) {
  return invokeDialerRpc<number>("get_dialer_queue_count", {
    _session_id: sessionId,
    _industries: filters?.industries && filters.industries.length > 0 ? filters.industries : null,
    _states: filters?.states && filters.states.length > 0 ? filters.states : null,
    _trade_types: filters?.tradeTypes && filters.tradeTypes.length > 0 ? filters.tradeTypes : null,
    _work_type: filters?.workType && filters.workType !== "all" ? filters.workType : null,
    _business_size: filters?.businessSize && filters.businessSize !== "all" ? filters.businessSize : null,
    _prospect_tier: filters?.prospectTier && filters.prospectTier !== "all" ? filters.prospectTier : null,
    _min_gbp_rating: filters?.minGbpRating && filters.minGbpRating > 0 ? filters.minGbpRating : null,
    _min_review_count: filters?.minReviewCount && filters.minReviewCount > 0 ? filters.minReviewCount : null,
    _has_google_ads: filters?.hasGoogleAds && filters.hasGoogleAds !== "all" ? filters.hasGoogleAds : null,
    _has_facebook_ads: filters?.hasFacebookAds && filters.hasFacebookAds !== "all" ? filters.hasFacebookAds : null,
    _buying_signal_strength: filters?.buyingSignalStrength && filters.buyingSignalStrength !== "all" ? filters.buyingSignalStrength : null,
    _phone_type: filters?.phoneType && filters.phoneType !== "all" ? filters.phoneType : null,
    _has_dm_phone: filters?.hasDmPhone === "yes" ? true : filters?.hasDmPhone === "no" ? false : null,
    _contact_owner: filters?.contactOwner && filters.contactOwner !== "all" ? (filters.contactOwner === "unassigned" ? "unassigned" : filters.contactOwner) : null,
  });
}

export type ContactsSortOption = "operational" | "updated_desc" | "created_desc" | "business_name_asc";

export type PaginatedContactsFilters = {
  industry?: string;
  status?: string;
  state?: string;
  appointmentOutcome?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: ContactsSortOption;
};

export type PaginatedContactsResult = {
  contacts: Contact[];
  totalCount: number;
};

async function fetchPaginatedContacts({
  industry,
  status,
  state,
  appointmentOutcome,
  search,
  page = 1,
  pageSize = 100,
  sortBy = "operational",
}: PaginatedContactsFilters): Promise<PaginatedContactsResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("contacts")
    .select("*", { count: "exact" });

  if (sortBy === "operational") {
    query = query
      .order("next_followup_date", { ascending: true, nullsFirst: false })
      .order("latest_appointment_scheduled_for", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
  } else if (sortBy === "updated_desc") {
    query = query.order("updated_at", { ascending: false });
  } else if (sortBy === "created_desc") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("business_name", { ascending: true });
  }

  query = query.range(from, to);

  if (industry && industry !== "all") {
    query = query.eq("industry", industry);
  }
  if (status && status !== "all") {
    if (status === "dnc") {
      query = query.eq("is_dnc", true);
    } else {
      query = query.eq("status", status);
    }
  }
  if (state && state !== "all") {
    // Match state case-insensitively using ilike
    query = query.ilike("state", state);
  }
  if (appointmentOutcome && appointmentOutcome !== "all") {
    query = query.eq("latest_appointment_outcome", appointmentOutcome as AppointmentOutcomeValue);
  }
  if (search && search.trim().length > 0) {
    const s = search.trim();
    query = query.or(
      `business_name.ilike.%${s}%,phone.ilike.%${s}%,contact_person.ilike.%${s}%,email.ilike.%${s}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    contacts: (data ?? []) as Contact[],
    totalCount: count ?? 0,
  };
}

export function usePaginatedContacts(filters: PaginatedContactsFilters) {
  return useQuery({
    queryKey: ["contacts-paginated", filters],
    queryFn: () => fetchPaginatedContacts(filters),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}


export function useRollingDialerQueue({ filters }: RollingDialerQueueOptions) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [queueSupervisor, setQueueSupervisor] = useState<DialerQueueSupervisorMeta>({
    health: "idle",
    lastRefillStartedAt: null,
    lastRefillFinishedAt: null,
    lastSuccessfulClaimAt: null,
    consecutiveEmptyRefills: 0,
    lastKnownAvailableCount: null,
    exhaustionGraceUntil: null,
  });
  const contactsRef = useRef<Contact[]>([]);
  const sessionRef = useRef<string | null>(null);
  const claimInFlightRef = useRef<Promise<number> | null>(null);
  const startInFlightRef = useRef<Promise<number> | null>(null);
  const stopInFlightRef = useRef<Promise<void> | null>(null);
  const startingRef = useRef(false);
  const previewSessionIdRef = useRef<string>(crypto.randomUUID());

  const setQueueHealth = useCallback((health: DialerQueueHealth) => {
    setQueueSupervisor((current) => ({ ...current, health }));
  }, []);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const claimIntoBuffer = useCallback(async (activeSessionId: string, seedContacts: Contact[], desiredMinimum: number) => {
    const seenIds = new Set(seedContacts.map((contact) => contact.id));
    const mergedContacts = [...seedContacts];
    let latestTotalCount = mergedContacts.length;
    let emptyRetries = 0;

    while (mergedContacts.length < desiredMinimum) {
      console.log("[DialerQueue] Claiming leads: session=", activeSessionId, "filters=", filters, "claimSize=", DIALER_CLAIM_SIZE, "buffer=", mergedContacts.length, "/", desiredMinimum);
      const response = await claimDialerLeads({
        sessionId: activeSessionId,
        claimSize: DIALER_CLAIM_SIZE,
        filters,
      });

      console.log("[DialerQueue] Claim response: total_available=", response.total_available_count, "claimed=", response.claimed_contacts?.length);
      latestTotalCount = Math.max(response.total_available_count ?? 0, mergedContacts.length);
      const newlyClaimed = (response.claimed_contacts ?? []).filter((contact) => !seenIds.has(contact.id));

      if (newlyClaimed.length === 0) {
        // Retry once after a short delay if leads exist but none were claimed (lock contention)
        if (latestTotalCount > mergedContacts.length && mergedContacts.length === 0 && emptyRetries < 2) {
          emptyRetries++;
          console.warn("[DialerQueue] No contacts claimed despite availability, retrying after 300ms... (attempt", emptyRetries, ")");
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        console.warn("[DialerQueue] No new contacts claimed, breaking.");
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
  }, [filters]);

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
    startingRef.current = false;
    startInFlightRef.current = null;
    setSessionId(null);
    contactsRef.current = [];
    setContacts([]);
    setTotalCount(0);
    setQueueSupervisor({
      health: "idle",
      lastRefillStartedAt: null,
      lastRefillFinishedAt: null,
      lastSuccessfulClaimAt: null,
      consecutiveEmptyRefills: 0,
      lastKnownAvailableCount: null,
      exhaustionGraceUntil: null,
    });
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
    if (!sessionRef.current || startingRef.current) return 0;

    if (claimInFlightRef.current) {
      return claimInFlightRef.current;
    }

    setIsPrefetching(true);
    const activeSessionId = sessionRef.current;
    const task = claimIntoBuffer(activeSessionId, contactsRef.current, desiredMinimum)
      .then(async ({ contacts: nextContacts, totalCount: nextTotalCount, claimedCount }) => {
        if (sessionRef.current === activeSessionId) {
          // Merge: preserve current buffer (which may have had contacts
          // discarded while the claim was in flight) and only append
          // genuinely new contacts from the claim response.
          const currentIds = new Set(contactsRef.current.map((c) => c.id));
          const freshContacts = [...contactsRef.current];
          for (const c of nextContacts) {
            if (!currentIds.has(c.id)) {
              freshContacts.push(c);
              currentIds.add(c.id);
            }
          }
          contactsRef.current = freshContacts;
          setContacts(freshContacts);
          setTotalCount(Math.max(nextTotalCount, freshContacts.length));
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

  const reconcileQueue = useCallback(async (reason: DialerQueueReconcileReason = "buffer_low"): Promise<ReconcileResult> => {
    if (!sessionRef.current || startingRef.current) {
      return { claimedCount: 0, availableCount: null, health: sessionRef.current ? queueSupervisor.health : "idle" };
    }

    const initialBufferSize = contactsRef.current.length;
    const startedAt = Date.now();

    if (initialBufferSize === 0) {
      setQueueSupervisor((current) => ({
        ...current,
        exhaustionGraceUntil: current.exhaustionGraceUntil ?? startedAt + DIALER_EXHAUSTION_GRACE_MS,
      }));
    }

    if (claimInFlightRef.current) {
      if (initialBufferSize < DIALER_MIN_BUFFER_FLOOR) {
        setQueueHealth("refilling");
      }
      return {
        claimedCount: 0,
        availableCount: queueSupervisor.lastKnownAvailableCount,
        health: initialBufferSize < DIALER_MIN_BUFFER_FLOOR ? "refilling" : queueSupervisor.health,
      };
    }

    setQueueSupervisor((current) => ({
      ...current,
      health: "refilling",
      lastRefillStartedAt: startedAt,
    }));

    let claimedCount = 0;
    let availableCount: number | null = null;

    for (let attempt = 0; attempt < DIALER_EMPTY_REFILL_RETRY_LIMIT; attempt++) {
      claimedCount += await ensureBuffer(DIALER_TARGET_BUFFER);

      const currentBufferSize = contactsRef.current.length;
      const finishedAt = Date.now();

      if (currentBufferSize >= DIALER_MIN_BUFFER_FLOOR) {
        const nextAvailableCount = Math.max(totalCount, currentBufferSize);
        setQueueSupervisor((current) => ({
          ...current,
          health: "healthy",
          lastRefillFinishedAt: finishedAt,
          lastSuccessfulClaimAt: finishedAt,
          consecutiveEmptyRefills: 0,
          lastKnownAvailableCount: nextAvailableCount,
          exhaustionGraceUntil: null,
        }));

        return {
          claimedCount,
          availableCount: nextAvailableCount,
          health: "healthy",
        };
      }

      availableCount = await getDialerQueueCount({
        sessionId: sessionRef.current,
        filters,
      });

      if (currentBufferSize === 0 && availableCount > 0 && attempt < DIALER_EMPTY_REFILL_RETRY_LIMIT - 1) {
        await new Promise((resolve) => setTimeout(resolve, DIALER_EMPTY_REFILL_BACKOFF_MS));
        continue;
      }

      const nextEmptyRefills = claimedCount === 0 ? queueSupervisor.consecutiveEmptyRefills + 1 : 0;
      const graceUntil = currentBufferSize === 0
        ? (queueSupervisor.exhaustionGraceUntil ?? startedAt + DIALER_EXHAUSTION_GRACE_MS)
        : null;
      const exhausted = currentBufferSize === 0
        && availableCount === 0
        && nextEmptyRefills >= DIALER_EMPTY_REFILL_RETRY_LIMIT
        && graceUntil !== null
        && finishedAt >= graceUntil;
      const nextHealth: DialerQueueHealth = exhausted ? "exhausted" : "degraded";

      setQueueSupervisor((current) => ({
        ...current,
        health: nextHealth,
        lastRefillFinishedAt: finishedAt,
        consecutiveEmptyRefills: claimedCount === 0 ? current.consecutiveEmptyRefills + 1 : 0,
        lastKnownAvailableCount: availableCount,
        exhaustionGraceUntil: currentBufferSize === 0
          ? (current.exhaustionGraceUntil ?? startedAt + DIALER_EXHAUSTION_GRACE_MS)
          : null,
      }));

      return { claimedCount, availableCount, health: nextHealth };
    }

    return { claimedCount, availableCount, health: queueSupervisor.health };
  }, [ensureBuffer, filters, queueSupervisor.consecutiveEmptyRefills, queueSupervisor.exhaustionGraceUntil, queueSupervisor.health, queueSupervisor.lastKnownAvailableCount, setQueueHealth, totalCount]);

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
      startingRef.current = true;
      setQueueHealth("bootstrapping");
      // Don't set sessionId state yet — prevents prefetch effect from racing
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
        setQueueSupervisor((current) => ({
          ...current,
          health: claimedContacts.length > 0 ? "healthy" : "degraded",
          lastSuccessfulClaimAt: claimedContacts.length > 0 ? Date.now() : current.lastSuccessfulClaimAt,
          consecutiveEmptyRefills: claimedContacts.length > 0 ? 0 : current.consecutiveEmptyRefills,
          lastKnownAvailableCount: claimedTotalCount,
          exhaustionGraceUntil: claimedContacts.length > 0 ? null : Date.now() + DIALER_EXHAUSTION_GRACE_MS,
        }));

        // Now expose sessionId to React state — contacts are populated so prefetch won't race
        startingRef.current = false;
        setSessionId(activeSessionId);
        void ensureBuffer(DIALER_TARGET_BUFFER);

        return claimedContacts.length;
      } catch (error) {
        startingRef.current = false;
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
    void reconcileQueue(contacts.length === 0 ? "buffer_empty" : "buffer_low");
  }, [contacts.length, reconcileQueue, sessionId]);

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
        filters,
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
  }, [filters]);

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
    queueHealth: queueSupervisor.health,
    queueSupervisor,
    reconcileQueue,
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
      queryClient.invalidateQueries({ queryKey: ["contacts-paginated"] });
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
      queryClient.invalidateQueries({ queryKey: ["contacts-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["dialer-contacts"] });
    },
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact: {
      business_name: string;
      phone: string;
      industry: string;
      contact_person?: string | null;
      email?: string | null;
      website?: string | null;
      gmb_link?: string | null;
      city?: string | null;
      state?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("contacts")
        .insert(contact)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
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
