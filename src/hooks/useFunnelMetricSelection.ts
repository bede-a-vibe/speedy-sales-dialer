import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const DEFAULT_SELECTION = [
  "dials",
  "unique_leads",
  "pickups",
  "conversations",
  "bookings_made",
  "pickup_booking",
  "conversation_booking",
  "lead_booked",
];

function storageKey(userId?: string) {
  return `funnel:metric-selection:${userId ?? "anon"}:v1`;
}

export function useFunnelMetricSelection() {
  const { user } = useAuth();
  const key = storageKey(user?.id);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_SELECTION;
    try {
      const raw = window.localStorage.getItem(storageKey(user?.id));
      if (!raw) return DEFAULT_SELECTION;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed;
      return DEFAULT_SELECTION;
    } catch {
      return DEFAULT_SELECTION;
    }
  });

  // Re-load when the user changes (after login).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setSelectedIds(DEFAULT_SELECTION);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
        setSelectedIds(parsed);
      }
    } catch {
      // ignore
    }
  }, [key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(selectedIds));
    } catch {
      // ignore quota errors
    }
  }, [key, selectedIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const remove = useCallback((id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const setAll = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  return { selectedIds, toggle, remove, setAll };
}