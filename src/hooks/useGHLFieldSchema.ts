import { useQuery } from "@tanstack/react-query";
import { ghlGetCustomFields } from "@/lib/ghl";

/** Normalised GHL custom-field schema entry used by the dialer panel. */
export interface GhlCustomFieldSchema {
  /** GHL field ID (e.g. "wJEveppptnLy1hXMU0MP"). */
  id: string;
  /** GHL fieldKey (e.g. "contact.buying_signal_strength"). */
  key: string;
  /** Human label from GHL. */
  name: string;
  /** GHL data type — TEXT, LARGE_TEXT, DROPDOWN, RADIO, CHECKBOX, NUMERICAL, DATE, etc. */
  dataType: string;
  /** Picklist options for DROPDOWN / RADIO / CHECKBOX. */
  picklistOptions: string[];
}

interface RawGhlCustomField {
  id: string;
  fieldKey?: string;
  name?: string;
  dataType?: string;
  picklistOptions?: Array<string | { label?: string; value?: string }> | null;
}

function normaliseOptions(options: RawGhlCustomField["picklistOptions"]): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt) => {
      if (typeof opt === "string") return opt;
      if (opt && typeof opt === "object") return opt.value ?? opt.label ?? "";
      return "";
    })
    .filter((s): s is string => Boolean(s && s.trim()));
}

export function useGHLFieldSchema() {
  return useQuery({
    queryKey: ["ghl-custom-field-schema"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<{ byKey: Record<string, GhlCustomFieldSchema>; byId: Record<string, GhlCustomFieldSchema> }> => {
      const res = (await ghlGetCustomFields()) as { customFields?: RawGhlCustomField[] } | RawGhlCustomField[];
      const list: RawGhlCustomField[] = Array.isArray(res) ? res : res?.customFields ?? [];
      const byKey: Record<string, GhlCustomFieldSchema> = {};
      const byId: Record<string, GhlCustomFieldSchema> = {};
      for (const raw of list) {
        if (!raw?.id) continue;
        const entry: GhlCustomFieldSchema = {
          id: raw.id,
          key: raw.fieldKey ?? "",
          name: raw.name ?? raw.fieldKey ?? raw.id,
          dataType: (raw.dataType ?? "TEXT").toUpperCase(),
          picklistOptions: normaliseOptions(raw.picklistOptions),
        };
        byId[entry.id] = entry;
        if (entry.key) byKey[entry.key] = entry;
      }
      return { byKey, byId };
    },
  });
}