import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "ghl_location_id";
let cachedLocationId: string | null = null;
let inflight: Promise<string | null> | null = null;

function readStoredLocationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLocationId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Fetch (and cache) the GHL location ID via the ghl edge function.
 * Cached in module memory + localStorage to avoid repeat round-trips.
 */
export async function fetchGhlLocationId(): Promise<string | null> {
  if (cachedLocationId) return cachedLocationId;
  const stored = readStoredLocationId();
  if (stored) {
    cachedLocationId = stored;
    return stored;
  }
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
        writeStoredLocationId(id);
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

/** Synchronous getter — returns the cached location ID if already fetched. */
export function getCachedGhlLocationId(): string | null {
  if (cachedLocationId) return cachedLocationId;
  const stored = readStoredLocationId();
  if (stored) cachedLocationId = stored;
  return cachedLocationId;
}

/** Build the GHL contact URL. Returns null if location ID isn't known yet. */
export function getGhlContactUrl(ghlContactId: string | null | undefined): string | null {
  if (!ghlContactId) return null;
  const locationId = getCachedGhlLocationId();
  if (!locationId) return null;
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${ghlContactId}`;
}