import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "ghl_location_id_v2";
const LEGACY_STORAGE_KEY = "ghl_location_id";
const DECOMMISSIONED_LOCATION_ID = "8FQlaeF8Fb2LR6fEF1Jw";
/** Main Odin Digital location — used only as an optimistic fallback while resolving. */
const FALLBACK_LOCATION_ID = "N6ZNHc1OmVcRne4Sprhq";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let cachedLocationId: string | null = null;
let cachedFetchedAt = 0;
let inflight: Promise<string | null> | null = null;
let revalidated = false;

function warnIfDecommissioned(id: string | null) {
  if (import.meta.env.DEV && id === DECOMMISSIONED_LOCATION_ID) {
    console.warn(
      "[ghlUrls] Resolved GHL location ID is the decommissioned Tradies location — links will be broken.",
    );
  }
}

function readStoredLocationId(): { id: string; fetchedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Purge the legacy key — its value is precisely the stale data we're clearing.
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }
    const parsed = JSON.parse(raw) as { id?: unknown; fetchedAt?: unknown };
    if (typeof parsed?.id !== "string" || !parsed.id) return null;
    return {
      id: parsed.id,
      fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeStoredLocationId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, fetchedAt: Date.now() }));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function requestLocationId(): Promise<string | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return null;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/ghl`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: "get_location_id" }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const id = json?.locationId as string | undefined;
      if (id) {
        cachedLocationId = id;
        cachedFetchedAt = Date.now();
        writeStoredLocationId(id);
        warnIfDecommissioned(id);
        return id;
      }
      return null;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Kick off one background revalidation per session, regardless of cache age. */
function revalidateInBackground() {
  if (revalidated) return;
  revalidated = true;
  void requestLocationId();
}

/**
 * Fetch (and cache) the GHL location ID via the ghl edge function.
 * Cached in module memory + localStorage to avoid repeat round-trips.
 */
export async function fetchGhlLocationId(): Promise<string | null> {
  const cached = getCachedGhlLocationId();
  if (cached) {
    // Always revalidate once per session; refresh again if the cache is stale.
    if (!revalidated || Date.now() - cachedFetchedAt > STALE_AFTER_MS) {
      revalidated = true;
      void requestLocationId();
    }
    return cached;
  }
  revalidated = true;
  return requestLocationId();
}

/** Synchronous getter — returns the cached location ID if already known. */
export function getCachedGhlLocationId(): string | null {
  if (!cachedLocationId) {
    const stored = readStoredLocationId();
    if (stored) {
      cachedLocationId = stored.id;
      cachedFetchedAt = stored.fetchedAt;
      warnIfDecommissioned(stored.id);
    }
  }
  return cachedLocationId;
}

/**
 * Build the GHL contact URL. Never returns null just because the location ID
 * hasn't resolved yet — it falls back to the main location and triggers a fetch.
 */
export function getGhlContactUrl(ghlContactId: string | null | undefined): string | null {
  if (!ghlContactId) return null;
  let locationId = getCachedGhlLocationId();
  if (!locationId) {
    revalidateInBackground();
    locationId = FALLBACK_LOCATION_ID;
  } else if (locationId === DECOMMISSIONED_LOCATION_ID) {
    // Stale Tradies cache: purge, refetch and use the main location meanwhile.
    cachedLocationId = null;
    cachedFetchedAt = 0;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    revalidateInBackground();
    locationId = FALLBACK_LOCATION_ID;
  } else {
    revalidateInBackground();
  }
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${ghlContactId}`;
}