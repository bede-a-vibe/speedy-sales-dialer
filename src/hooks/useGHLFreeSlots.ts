import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ghlGetFreeSlots } from "@/lib/ghl";

export interface GHLSlot {
  startTime: string; // ISO string
  endTime: string;   // ISO string
  label: string;     // "3:40 pm – 3:55 pm"
}

function formatSlotLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
}

/**
 * Fetches available GHL calendar slots for a given date.
 * Returns a flat array of { startTime, endTime, label } objects.
 */
export function useGHLFreeSlots(
  calendarId: string | undefined,
  date: Date | undefined,
  timezone = "Australia/Sydney",
) {
  const dateKey = date ? format(date, "yyyy-MM-dd") : "";

  return useQuery({
    queryKey: ["ghl-free-slots", calendarId, dateKey, timezone],
    queryFn: async (): Promise<GHLSlot[]> => {
      if (!calendarId || !dateKey) return [];

      // The GHL API returns { [date]: [slot1, slot2, ...] } or similar
      const raw = await ghlGetFreeSlots(calendarId, dateKey, dateKey, timezone);

      // The API may return nested data; handle both shapes
      const slotsData = (raw as any)?.slots ?? raw;

      // Slots may be keyed by date string, or a flat array
      let slotStrings: string[] = [];

      if (Array.isArray(slotsData)) {
        slotStrings = slotsData;
      } else if (typeof slotsData === "object" && slotsData !== null) {
        // { "2026-04-16": ["2026-04-16T09:00:00+10:00", ...] }
        for (const key of Object.keys(slotsData)) {
          if (Array.isArray(slotsData[key])) {
            slotStrings.push(...slotsData[key]);
          }
        }
      }

      if (slotStrings.length === 0) return [];

      // Each slot string is a start time ISO; we estimate end as the gap to the next slot (or +15 min)
      const sorted = [...slotStrings].sort();
      const result: GHLSlot[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const startTime = sorted[i];
        const nextStart = sorted[i + 1];
        const startMs = new Date(startTime).getTime();
        const defaultEndMs = startMs + 15 * 60 * 1000;
        const endMs = nextStart
          ? Math.min(new Date(nextStart).getTime(), startMs + 60 * 60 * 1000) // cap at 1 hour
          : defaultEndMs;
        const endTime = new Date(endMs).toISOString();

        result.push({
          startTime,
          endTime,
          label: formatSlotLabel(startTime, endTime),
        });
      }

      return result;
    },
    enabled: !!calendarId && !!dateKey,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
