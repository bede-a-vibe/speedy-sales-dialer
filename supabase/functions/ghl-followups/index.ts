import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getGhlHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: GHL_VERSION,
  };
}

type GhlTask = {
  id?: string;
  contactId?: string;
  contact_id?: string;
  dueDate?: string;
  due_date?: string;
  assignedTo?: string;
  assigned_to?: string;
  assignedUserId?: string;
  assigned_user_id?: string;
  userId?: string;
  user_id?: string;
  title?: string;
  body?: string;
  completed?: boolean;
  status?: string;
};

type ContactRow = {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string;
  status: string;
  is_dnc: boolean;
  ghl_contact_id: string;
};

function getScopeDateRange(anchorIso: string, scope: "today" | "overdue" | "week") {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error("Invalid date parameter");
  }
  anchor.setHours(0, 0, 0, 0);

  const start = new Date(anchor);
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);

  if (scope === "today") {
    return { dateFrom: start, dateTo: end };
  }

  if (scope === "week") {
    const weekEnd = new Date(end);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { dateFrom: start, dateTo: weekEnd };
  }

  // Keep overdue queries bounded for predictable performance.
  const overdueStart = new Date(start);
  overdueStart.setDate(overdueStart.getDate() - 90);
  const overdueEnd = new Date(start);
  overdueEnd.setMilliseconds(-1);
  return { dateFrom: overdueStart, dateTo: overdueEnd };
}

async function fetchDueTasks(apiKey: string, locationId: string, dateIso: string, scope: "today" | "overdue" | "week") {
  const headers = getGhlHeaders(apiKey);
  const { dateFrom, dateTo } = getScopeDateRange(dateIso, scope);
  const dueDate = dateIso.slice(0, 10);
  const pageLimit = 200;

  const parseTasks = (payload: unknown) => {
    if (typeof payload !== "object" || payload === null) return [] as GhlTask[];
    const p = payload as Record<string, unknown>;
    const tasks = Array.isArray(p.tasks)
      ? p.tasks
      : Array.isArray(p.items)
        ? p.items
        : Array.isArray(payload)
          ? payload
          : [];
    return tasks as GhlTask[];
  };

  // Try common GET endpoint shape first for same-day queries.
  if (scope === "today") {
    const getUrl = new URL(`${GHL_BASE}/tasks`);
    getUrl.searchParams.set("locationId", locationId);
    getUrl.searchParams.set("date", dueDate);
    getUrl.searchParams.set("limit", String(pageLimit));

    const getRes = await fetch(getUrl.toString(), { headers });
    if (getRes.ok) {
      const payload = await getRes.json().catch(() => ({}));
      return parseTasks(payload);
    }
  }

  // Fallback POST search endpoint, with bounded pagination.
  const allTasks: GhlTask[] = [];
  const maxPages = 5;
  for (let page = 1; page <= maxPages; page += 1) {
    const postRes = await fetch(`${GHL_BASE}/tasks/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId,
        page,
        pageLimit,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
      }),
    });

    if (!postRes.ok) {
      const details = await postRes.text().catch(() => "");
      throw new Error(`Unable to fetch GHL tasks: ${postRes.status} ${details}`);
    }

    const payload = await postRes.json().catch(() => ({}));
    const pageTasks = parseTasks(payload);
    allTasks.push(...pageTasks);
    if (pageTasks.length < pageLimit) break;
  }

  return allTasks;
}

async function resolveCurrentGhlUserId(apiKey: string, locationId: string, email: string | null) {
  if (!email) return null;

  const url = new URL(`${GHL_BASE}/users/search`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("companyId", locationId);
  const response = await fetch(url.toString(), { headers: getGhlHeaders(apiKey) });
  if (!response.ok) return null;

  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.users)
    ? payload.users
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  const normalizedEmail = email.toLowerCase();
  const match = items.find((user) => {
    const emails = Array.isArray(user?.emails) ? user.emails : [];
    return emails.some((e: unknown) => typeof e === "string" && e.toLowerCase() === normalizedEmail);
  });

  return typeof match?.id === "string" ? match.id : null;
}

function getTaskDueDate(task: GhlTask) {
  const raw = task.dueDate ?? task.due_date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isValidDateInput(value: string) {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function isTaskInScope(task: GhlTask, scope: "today" | "overdue" | "week", anchorDateIso: string) {
  const due = getTaskDueDate(task);
  if (!due) return false;

  const start = new Date(anchorDateIso);
  if (Number.isNaN(start.getTime())) return false;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  if (scope === "today") return due >= start && due <= end;
  if (scope === "overdue") return due < start;

  const weekEnd = new Date(end);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return due >= start && due <= weekEnd;
}

function isAssignedToUser(task: GhlTask, ghlUserId: string) {
  const candidates = [
    task.assignedTo,
    task.assigned_to,
    task.assignedUserId,
    task.assigned_user_id,
    task.userId,
    task.user_id,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  if (candidates.length === 0) return false;
  return candidates.includes(ghlUserId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("GHL_API_KEY");
    const locationId = Deno.env.get("GHL_LOCATION_ID");

    if (!supabaseUrl || !anon || !serviceRole || !apiKey || !locationId) {
      return json({ error: "Missing configuration" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceRole);

    const { data: auth, error: authErr } = await userClient.auth.getUser();
    if (authErr || !auth?.user) return json({ error: "Unauthorized" }, 401);
    const authEmail = auth.user.email ?? null;

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString();
    if (!isValidDateInput(date)) {
      return json({ error: "Invalid date query parameter" }, 400);
    }
    const scopeParam = url.searchParams.get("scope");
    const scope: "today" | "overdue" | "week" = scopeParam === "overdue" || scopeParam === "week" ? scopeParam : "today";

    const tasks = await fetchDueTasks(apiKey, locationId, date, scope);
    const currentGhlUserId = await resolveCurrentGhlUserId(apiKey, locationId, authEmail);
    const canFilterToRep = typeof currentGhlUserId === "string" && currentGhlUserId.length > 0;

    const openTasks = tasks.filter((task) => {
      const status = String(task.status ?? "").toLowerCase();
      const completed = task.completed === true || status === "completed" || status === "done";
      if (!canFilterToRep) return false;
      return !completed && isTaskInScope(task, scope, date) && isAssignedToUser(task, currentGhlUserId);
    });

    const ghlContactIds = [...new Set(openTasks
      .map((task) => task.contactId ?? task.contact_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0))];

    const { data: contacts } = ghlContactIds.length === 0
      ? { data: [] as ContactRow[] }
      : await adminClient
          .from("contacts")
          .select("id, business_name, contact_person, phone, status, is_dnc, ghl_contact_id")
          .in("ghl_contact_id", ghlContactIds);

    const contactMap = new Map((contacts ?? []).map((c) => [c.ghl_contact_id, c]));
    const seenItemKeys = new Set<string>();
    const items = openTasks
      .map((task) => {
        const ghlContactId = task.contactId ?? task.contact_id;
        if (!ghlContactId) return null;
        const contact = contactMap.get(ghlContactId);
        if (!contact) return null;
        const dedupeKey = `${task.id ?? "task"}:${ghlContactId}:${task.dueDate ?? task.due_date ?? ""}`;
        if (seenItemKeys.has(dedupeKey)) return null;
        seenItemKeys.add(dedupeKey);
        return {
          task_id: task.id ?? null,
          title: task.title ?? null,
          body: task.body ?? null,
          due_date: task.dueDate ?? task.due_date ?? null,
          contact,
        };
      })
      .filter((item): item is {
        task_id: string | null;
        title: string | null;
        body: string | null;
        due_date: string | null;
        contact: ContactRow;
      } => item !== null)
      .sort((a, b) => {
        const aRaw = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bRaw = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        const aTime = Number.isFinite(aRaw) ? aRaw : Number.POSITIVE_INFINITY;
        const bTime = Number.isFinite(bRaw) ? bRaw : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });

    return json({
      ok: true,
      date: date.slice(0, 10),
      scope,
      ghl_user_id: currentGhlUserId,
      task_count: openTasks.length,
      ghl_contact_ids: ghlContactIds,
      items,
      contacts: contacts ?? [],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
