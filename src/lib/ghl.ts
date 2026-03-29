import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

async function invokeGHL<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const url = `https://${PROJECT_ID}.supabase.co/functions/v1/ghl`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `GHL request failed (${res.status})`);
  }
  return json as T;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function ghlSearchContacts(payload: Record<string, unknown>) {
  return invokeGHL({ action: "search_contacts", payload });
}

export async function ghlGetContact(contactId: string) {
  return invokeGHL({ action: "get_contact", contactId });
}

export async function ghlCreateContact(payload: Record<string, unknown>) {
  return invokeGHL({ action: "create_contact", payload });
}

export async function ghlUpdateContact(contactId: string, payload: Record<string, unknown>) {
  return invokeGHL({ action: "update_contact", contactId, payload });
}

export async function ghlAddNote(contactId: string, noteBody: string) {
  return invokeGHL({ action: "add_note", contactId, payload: { body: noteBody } });
}

export async function ghlAddTag(contactId: string, tags: string[]) {
  return invokeGHL({ action: "add_tag", contactId, tags });
}

export async function ghlCreateTask(contactId: string, payload: Record<string, unknown>) {
  return invokeGHL({ action: "create_task", contactId, payload });
}

export async function ghlCreateOpportunity(payload: Record<string, unknown>) {
  return invokeGHL({ action: "create_opportunity", payload });
}

export async function ghlCreateAppointment(payload: Record<string, unknown>) {
  return invokeGHL({ action: "create_appointment", payload });
}

export async function ghlGetCalendars() {
  return invokeGHL({ action: "get_calendars" });
}

export async function ghlGetPipelines() {
  return invokeGHL({ action: "get_pipelines" });
}

export async function ghlGetSmartLists() {
  return invokeGHL({ action: "get_smart_lists" });
}

export async function ghlGetCustomFields() {
  return invokeGHL({ action: "get_custom_fields" });
}

export async function ghlGetUsers() {
  return invokeGHL({ action: "get_users" });
}
