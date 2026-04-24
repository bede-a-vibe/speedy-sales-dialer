import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ghlGetContact, ghlUpdateContactFields } from "@/lib/ghl";
import { getAllGhlFieldDefs, type GhlFieldDef } from "@/lib/ghlFieldFolders";

/** Per-field save status — drives the inline pill UI. */
export type FieldSaveStatus = "idle" | "saving" | "saved" | "error";

interface UseGHLContactFieldsOptions {
  contactId: string | null;
  ghlContactId?: string | null;
  /** Map of field-key → initial value pulled from the Supabase contact row. */
  initialValues?: Record<string, unknown>;
}

interface RawGhlContactCustomField {
  id: string;
  key?: string;
  value?: unknown;
}

interface RawGhlContact {
  contact?: {
    customFields?: RawGhlContactCustomField[];
  };
}

const DEBOUNCE_MS = 1500;

/**
 * Manages live values for the dialer's GHL Contact Intelligence panel.
 * - Hydrates from Supabase row + a one-shot GHL contact fetch
 * - Debounced auto-save: writes to GHL and (when mirrored) Supabase
 * - On GHL failure, enqueues a retry row in pending_ghl_pushes
 */
export function useGHLContactFields({ contactId, ghlContactId, initialValues }: UseGHLContactFieldsOptions) {
  const fieldDefs = useMemo(() => getAllGhlFieldDefs(), []);
  const fieldDefByKey = useMemo(() => {
    const map: Record<string, GhlFieldDef> = {};
    for (const f of fieldDefs) map[f.key] = f;
    return map;
  }, [fieldDefs]);

  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues ?? {});
  const [statuses, setStatuses] = useState<Record<string, FieldSaveStatus>>({});
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Reset whenever the active contact changes.
  useEffect(() => {
    setValues(initialValues ?? {});
    setStatuses({});
    setLastSavedAt(null);
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      debounceTimers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  // One-shot GHL fetch to pull custom fields not mirrored in Supabase.
  const ghlContactQuery = useQuery({
    queryKey: ["ghl-contact-custom-fields", ghlContactId],
    enabled: Boolean(ghlContactId),
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, unknown>> => {
      if (!ghlContactId) return {};
      const res = (await ghlGetContact(ghlContactId)) as RawGhlContact;
      const cfs = res?.contact?.customFields ?? [];
      const out: Record<string, unknown> = {};
      for (const cf of cfs) {
        if (cf?.key) out[cf.key] = cf.value;
      }
      return out;
    },
  });

  // Merge GHL-fetched values into local state (without clobbering local edits).
  useEffect(() => {
    if (!ghlContactQuery.data) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(ghlContactQuery.data)) {
        if (next[key] === undefined || next[key] === null || next[key] === "") {
          next[key] = val;
        }
      }
      return next;
    });
  }, [ghlContactQuery.data]);

  const persistField = useCallback(
    async (key: string, value: unknown) => {
      const def = fieldDefByKey[key];
      if (!contactId) return;
      setStatuses((s) => ({ ...s, [key]: "saving" }));

      // 1) Mirror to Supabase column when applicable (instant, fast queue reads).
      if (def?.supabaseColumn) {
        try {
          const update: Record<string, unknown> = {};
          update[def.supabaseColumn] = value === "" ? null : value;
          await supabase.from("contacts").update(update).eq("id", contactId);
        } catch (err) {
          // non-fatal — keep going to GHL
          console.warn("[GHL fields] Supabase mirror failed", key, err);
        }
      }

      // 2) Push to GHL.
      if (ghlContactId) {
        try {
          await ghlUpdateContactFields(ghlContactId, { [key]: value == null ? "" : String(value) });
          setStatuses((s) => ({ ...s, [key]: "saved" }));
          setLastSavedAt(Date.now());
        } catch (err) {
          console.error("[GHL fields] GHL push failed, queueing retry", key, err);
          setStatuses((s) => ({ ...s, [key]: "error" }));
          // Fall back to the existing retry queue so the value isn't lost.
          try {
            const { data: userRes } = await supabase.auth.getUser();
            const userId = userRes?.user?.id;
            if (userId) {
              await supabase.from("pending_ghl_pushes").insert({
                contact_id: contactId,
                user_id: userId,
                dialpad_call_id: `manual-${key}-${Date.now()}`,
                source: "contact_intelligence_panel",
                ai_fields: { [key]: value },
              });
            }
          } catch (queueErr) {
            console.error("[GHL fields] Failed to enqueue retry", queueErr);
          }
        }
      } else {
        // No GHL link yet — Supabase mirror is the only sink.
        setStatuses((s) => ({ ...s, [key]: "saved" }));
        setLastSavedAt(Date.now());
      }
    },
    [contactId, ghlContactId, fieldDefByKey],
  );

  const setField = useCallback(
    (key: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setStatuses((s) => ({ ...s, [key]: "saving" }));
      const existing = debounceTimers.current[key];
      if (existing) clearTimeout(existing);
      debounceTimers.current[key] = setTimeout(() => {
        delete debounceTimers.current[key];
        void persistField(key, value);
      }, DEBOUNCE_MS);
    },
    [persistField],
  );

  return {
    values,
    statuses,
    lastSavedAt,
    setField,
    isLoadingRemote: ghlContactQuery.isLoading,
    remoteError: ghlContactQuery.error as Error | null,
  };
}