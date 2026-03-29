import { useCallback, useRef } from "react";
import { ghlUpsertContact } from "@/lib/ghl";
import { supabase } from "@/integrations/supabase/client";

interface Contact {
  id: string;
  phone: string;
  business_name: string;
  contact_person?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  ghl_contact_id?: string | null;
}

interface LinkResult {
  ghlContactId: string;
  isNew: boolean;
}

/**
 * Hook to ensure every contact presented in the dialer is linked to GHL.
 *
 * Uses the GHL upsert endpoint which:
 * - Finds an existing GHL contact by phone number (handles AU format normalisation)
 * - Or creates a new one if no match exists
 * - Returns the GHL contact ID either way
 *
 * The hook caches in-flight requests to avoid duplicate upserts for the same contact,
 * and stores the ghl_contact_id back on the Supabase contact for all future sync.
 */
export function useGHLContactLink() {
  // Cache of in-flight promises to prevent duplicate upserts
  const inflightRef = useRef<Map<string, Promise<LinkResult | null>>>(new Map());
  // Cache of already-linked contact IDs for this session
  const linkedCacheRef = useRef<Map<string, string>>(new Map());

  /**
   * Ensure a contact is linked to GHL. Returns the ghl_contact_id.
   *
   * - If already linked (has ghl_contact_id), returns immediately.
   * - If an upsert is already in-flight for this contact, returns the same promise.
   * - Otherwise, calls GHL upsert, saves the ID to Supabase, and returns it.
   *
   * Never throws — returns null on failure so the dialer can continue without GHL sync.
   */
  const ensureGHLLink = useCallback(async (contact: Contact): Promise<string | null> => {
    // 1. Already linked in the database
    if (contact.ghl_contact_id) {
      linkedCacheRef.current.set(contact.id, contact.ghl_contact_id);
      return contact.ghl_contact_id;
    }

    // 2. Already linked in this session's cache (e.g. after a previous ensureGHLLink call)
    const cached = linkedCacheRef.current.get(contact.id);
    if (cached) return cached;

    // 3. No phone number — can't link
    if (!contact.phone || contact.phone.trim() === "") {
      console.warn(`[GHL Link] Contact ${contact.id} has no phone number — skipping GHL link`);
      return null;
    }

    // 4. Already in-flight — return the existing promise
    const existing = inflightRef.current.get(contact.id);
    if (existing) {
      const result = await existing;
      return result?.ghlContactId ?? null;
    }

    // 5. Start the upsert
    const linkPromise = (async (): Promise<LinkResult | null> => {
      try {
        // Build tags from industry
        const tags: string[] = [];
        if (contact.industry) {
          tags.push(`industry:${contact.industry.toLowerCase().replace(/\s+/g, "-")}`);
        }

        const result = await ghlUpsertContact(
          {
            phone: contact.phone,
            companyName: contact.business_name || undefined,
            name: contact.contact_person || contact.business_name || undefined,
            email: contact.email || undefined,
            website: contact.website || undefined,
            city: contact.city || undefined,
            state: contact.state || undefined,
            tags,
          },
          contact.id, // supabaseContactId — edge function will save ghl_contact_id
        );

        if (result.ghlContactId) {
          // Cache the result
          linkedCacheRef.current.set(contact.id, result.ghlContactId);

          // Also update the local Supabase record (belt and braces — edge function does this too)
          supabase
            .from("contacts")
            .update({ ghl_contact_id: result.ghlContactId })
            .eq("id", contact.id)
            .then(({ error }) => {
              if (error) {
                console.error(`[GHL Link] Failed to save ghl_contact_id locally:`, error);
              }
            });

          console.log(
            `[GHL Link] ${result.isNew ? "Created" : "Linked"} GHL contact ${result.ghlContactId} for ${contact.business_name} (${contact.phone})`,
          );

          return result;
        }

        console.warn(`[GHL Link] Upsert returned no contact ID for ${contact.id}`);
        return null;
      } catch (err) {
        console.error(`[GHL Link] Failed to link contact ${contact.id}:`, err);

        // Retry once after a short delay for transient errors
        try {
          await new Promise((r) => setTimeout(r, 2000));

          const tags: string[] = [];
          if (contact.industry) {
            tags.push(`industry:${contact.industry.toLowerCase().replace(/\s+/g, "-")}`);
          }

          const retryResult = await ghlUpsertContact(
            {
              phone: contact.phone,
              companyName: contact.business_name || undefined,
              name: contact.contact_person || contact.business_name || undefined,
              email: contact.email || undefined,
              website: contact.website || undefined,
              city: contact.city || undefined,
              state: contact.state || undefined,
              tags,
            },
            contact.id,
          );

          if (retryResult.ghlContactId) {
            linkedCacheRef.current.set(contact.id, retryResult.ghlContactId);

            supabase
              .from("contacts")
              .update({ ghl_contact_id: retryResult.ghlContactId })
              .eq("id", contact.id)
              .then(({ error }) => {
                if (error) {
                  console.error(`[GHL Link] Retry: Failed to save ghl_contact_id locally:`, error);
                }
              });

            console.log(
              `[GHL Link] Retry succeeded: ${retryResult.isNew ? "Created" : "Linked"} GHL contact ${retryResult.ghlContactId}`,
            );

            return retryResult;
          }
        } catch (retryErr) {
          console.error(`[GHL Link] Retry also failed for contact ${contact.id}:`, retryErr);
        }

        return null;
      } finally {
        // Clean up in-flight tracker
        inflightRef.current.delete(contact.id);
      }
    })();

    inflightRef.current.set(contact.id, linkPromise);
    return linkPromise.then((r) => r?.ghlContactId ?? null);
  }, []);

  /**
   * Get the cached GHL contact ID for a Supabase contact, if available.
   * Does NOT trigger an upsert — use ensureGHLLink for that.
   */
  const getCachedGHLId = useCallback((contactId: string): string | null => {
    return linkedCacheRef.current.get(contactId) ?? null;
  }, []);

  /**
   * Manually set a GHL contact ID in the cache (e.g. after loading from DB).
   */
  const setCachedGHLId = useCallback((contactId: string, ghlContactId: string) => {
    linkedCacheRef.current.set(contactId, ghlContactId);
  }, []);

  return {
    ensureGHLLink,
    getCachedGHLId,
    setCachedGHLId,
  };
}
