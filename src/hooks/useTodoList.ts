import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateContactCaches } from "@/hooks/useContacts";
import {
  buildTodo, dueCount, DROP_NOTE_PREFIX, TODO_LOOKBACK_DAYS,
  type TodoBookingRow, type TodoFollowUpRow, type TodoItem,
} from "@/lib/todoList";

const CONTACT_FULL =
  "id, business_name, contact_person, dm_name, phone, phone_type, dm_phone, dm_phone_verified, industry, city, state, status, is_dnc, key_quote";
const CONTACT_SLIM = "id, status, is_dnc";
const PAGE = 1000;

/** PostgREST caps a response at 1,000 rows, so page until a short one comes back. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function fetchTodo(ownerId: string | null, slim: boolean): Promise<TodoItem[]> {
  const contact = slim ? CONTACT_SLIM : CONTACT_FULL;
  const since = new Date(Date.now() - TODO_LOOKBACK_DAYS * 86_400_000).toISOString();
  const [bookings, followUps] = await Promise.all([
    allRows<TodoBookingRow>((from, to) =>
      supabase
        .from("pipeline_items")
        .select(
          `id, contact_id, status, scheduled_for, appointment_outcome, outcome_reason, outcome_recorded_at, reschedule_count, created_by, created_at${slim ? "" : ", outcome_notes"}, contacts:contacts!pipeline_items_contact_id_fkey(${contact})`,
        )
        .eq("pipeline_type", "booked")
        .gte("scheduled_for", since)
        .order("scheduled_for", { ascending: false })
        .order("id")
        .range(from, to)),
    allRows<TodoFollowUpRow>((from, to) => {
      let q = supabase
        .from("pipeline_items")
        .select(
          `id, contact_id, assigned_user_id, created_by, scheduled_for, created_at, notes, follow_up_method, contacts:contacts!pipeline_items_contact_id_fkey(${contact})`,
        )
        .eq("pipeline_type", "follow_up")
        .eq("status", "open");
      // Created by me too: the no-show follow-up is assigned to the closer but the setter rebooks it.
      if (ownerId) q = q.or(`assigned_user_id.eq.${ownerId},created_by.eq.${ownerId}`);
      return q.order("scheduled_for", { ascending: false }).order("id").range(from, to);
    }),
  ]);

  const { data: drops, error } = await supabase
    .from("contact_notes")
    .select("contact_id, created_at")
    .like("content", `${DROP_NOTE_PREFIX}%`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const droppedAt = new Map<string, string>();
  for (const d of drops ?? []) if (!droppedAt.has(d.contact_id)) droppedAt.set(d.contact_id, d.created_at);

  return buildTodo({ bookings, followUps, droppedAt, ownerId });
}

/** The rep's To do list. `ownerId` null is everyone. */
export function useTodoList(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["todo", "list", ownerId ?? "all"],
    enabled: ownerId !== undefined,
    staleTime: 30_000,
    queryFn: () => fetchTodo(ownerId ?? null, false),
  });
}

/** How many are due now. Drives the sidebar badge, so it fetches only the columns the rules need. */
export function useTodoCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["todo", "count", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => dueCount(await fetchTodo(userId as string, true)),
  });
}

/** Last outbound Dialpad call per lead, so a row can say whether anyone has rung since. */
export function useLastCalls(contactIds: string[]) {
  const ids = [...new Set(contactIds)].sort();
  return useQuery({
    queryKey: ["todo", "last-calls", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const last = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("dialpad_calls")
          .select("contact_id, created_at")
          .in("contact_id", ids.slice(i, i + 100))
          .eq("direction", "outbound")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        for (const c of data ?? []) if (c.contact_id && !last.has(c.contact_id)) last.set(c.contact_id, c.created_at);
      }
      return last;
    },
  });
}

/** What the lead told us, loaded when a row is opened. */
export function useTodoDetail(contactId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["todo-detail", contactId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [contact, notes, calls] = await Promise.all([
        supabase
          .from("contacts")
          .select("key_quote, buying_signal_strength, budget_indication, buying_timeline, agreed_next_steps, existing_agency_name, existing_agency_services")
          .eq("id", contactId)
          .maybeSingle(),
        supabase
          .from("contact_notes")
          .select("id, content, created_at")
          .eq("contact_id", contactId)
          .neq("source", "call_transcript")
          .not("content", "ilike", "Imported builder metadata%")
          .not("content", "like", `${DROP_NOTE_PREFIX}%`)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("call_logs")
          .select("created_at, notes, dialpad_summary")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      for (const r of [contact, notes, calls]) if (r.error) throw r.error;
      const said = (calls.data ?? []).find((c) => c.dialpad_summary?.trim() || c.notes?.trim()) ?? null;
      return { facts: contact.data, notes: notes.data ?? [], call: said };
    },
  });
}

/** An update that RLS filters to zero rows reports no error, so ask for the row back. */
async function updateFollowUp(id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from("pipeline_items").update(patch as never).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("You can't change this follow-up. It belongs to another rep.");
}

type Undo = () => Promise<void>;

/** Every write the list makes. Each resolves to a function that puts things back. */
export function useTodoActions(userId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = (contactId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["todo"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
    if (contactId) invalidateContactCaches(queryClient, contactId);
  };

  const later = useMutation({
    mutationFn: async ({ item, at }: { item: TodoItem; at: Date }): Promise<Undo> => {
      const f = item.followUp;
      if (f) {
        await updateFollowUp(f.id, { scheduled_for: at.toISOString() });
        return () => updateFollowUp(f.id, { scheduled_for: f.scheduled_for });
      }
      if (!userId) throw new Error("Not signed in.");
      const label = item.kind === "no_show" ? "no-show" : "cancelled meeting";
      const { data, error } = await supabase
        .from("pipeline_items")
        .insert({
          contact_id: item.contact.id, pipeline_type: "follow_up", status: "open",
          assigned_user_id: item.ownerId, created_by: userId, scheduled_for: at.toISOString(),
          follow_up_method: "call", notes: `Rebook ${label}`,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      return () => updateFollowUp(id, { status: "canceled" });
    },
    onSettled: () => refresh(),
  });

  const done = useMutation({
    mutationFn: async ({ item }: { item: TodoItem }): Promise<Undo> => {
      const f = item.followUp;
      if (!f) throw new Error("Nothing to complete.");
      await updateFollowUp(f.id, { status: "completed", completed_at: new Date().toISOString() });
      return () => updateFollowUp(f.id, { status: "open", completed_at: null });
    },
    onSettled: () => refresh(),
  });

  const notInterested = useMutation({
    mutationFn: async ({ item }: { item: TodoItem }): Promise<Undo> => {
      if (!userId) throw new Error("Not signed in.");
      const contactId = item.contact.id;
      const before = item.contact.status ?? null;
      const undo: Undo[] = [];
      const rollback: Undo = async () => {
        for (const u of undo.reverse()) await u();
      };
      try {
        const note = await supabase
          .from("contact_notes")
          .insert({ contact_id: contactId, created_by: userId, source: "manual", content: `${DROP_NOTE_PREFIX} marked not interested from the To do list.` } as never)
          .select("id")
          .single();
        if (note.error) throw note.error;
        const noteId = (note.data as { id: string }).id;
        undo.push(async () => {
          const { error } = await supabase.from("contact_notes").delete().eq("id", noteId);
          if (error) throw error;
        });

        const f = item.followUp;
        if (f) {
          await updateFollowUp(f.id, { status: "completed", completed_at: new Date().toISOString() });
          undo.push(() => updateFollowUp(f.id, { status: "open", completed_at: null }));
        }

        const { data, error } = await supabase.from("contacts").update({ status: "not_interested" } as never).eq("id", contactId).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("You can't change this contact.");
        undo.push(async () => {
          const back = await supabase.from("contacts").update({ status: before } as never).eq("id", contactId);
          if (back.error) throw back.error;
        });
        return rollback;
      } catch (e) {
        // Never leave a lead half dropped.
        await rollback().catch(() => {});
        throw e;
      }
    },
    onSettled: (_d, _e, v) => refresh(v.item.contact.id),
  });

  const reassign = useMutation({
    mutationFn: async ({ item, to }: { item: TodoItem; to: string }): Promise<Undo> => {
      const f = item.followUp;
      if (!f) throw new Error("Only follow-ups can be handed over.");
      await updateFollowUp(f.id, { assigned_user_id: to });
      return () => updateFollowUp(f.id, { assigned_user_id: f.assigned_user_id });
    },
    onSettled: () => refresh(),
  });

  return { later, done, notInterested, reassign, refresh, busy: later.isPending || done.isPending || notInterested.isPending || reassign.isPending };
}
