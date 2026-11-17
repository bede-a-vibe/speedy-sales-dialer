/**
 * Team & settings > People: one row per person, merging the GHL user list,
 * dialer logins, roles, Fathom connections and 180-day meeting stats.
 * Pure functions so the merge and the "needs attention" rules are tested.
 */
export type AppRole = "admin" | "coach" | "sales_rep";

export const ROLE_LABEL: Record<AppRole, string> = { admin: "Admin", sales_rep: "Sales rep", coach: "Coach" };
export const ROLE_ORDER: AppRole[] = ["admin", "sales_rep", "coach"];
export const ROLE_HINT: Record<AppRole, string> = {
  admin: "Full access: users, contacts, targets, pay, GHL sync",
  sales_rep: "Dial, log calls, run their own pipeline",
  coach: "Read-only: sees everything, changes nothing",
};
export const OWN_DOMAIN = "odindigital.com.au";

export interface DirectoryMemberInput {
  ghl_user_id: string | null;
  dialer_user_id: string | null;
  name: string;
  email: string | null;
  in_ghl: boolean;
  has_dialer_login: boolean;
  needs_dialpad: boolean;
  has_dialpad_seat: boolean;
  is_active: boolean;
}
export interface DirectoryLoginInput { user_id: string; email: string | null; display_name: string | null; last_sign_in_at?: string | null }
export interface DirectoryStatsInput { ghl_user_id: string | null; rep_user_id: string | null; meetings_booked: number; pending: number; show_rate_pct: number | null }
export interface DirectoryFathomInput { user_id: string; status: string | null; last_synced_at: string | null }

export type FathomState = "connected" | "problem" | "not_connected";

export interface DirectoryPerson {
  key: string;
  name: string;
  /** The login email when they have one, else the GHL email. */
  email: string | null;
  userId: string | null;
  ghlUserId: string | null;
  inGhl: boolean;
  hasLogin: boolean;
  roles: AppRole[];
  lastSignInAt: string | null;
  needsDialpad: boolean;
  hasDialpadSeat: boolean;
  isActive: boolean;
  fathom: FathomState | null;
  meetings: number;
  unrecorded: number;
  showRatePct: number | null;
}

export function buildDirectory(
  members: DirectoryMemberInput[],
  logins: DirectoryLoginInput[],
  roleRows: { user_id: string; role: AppRole }[],
  fathom: DirectoryFathomInput[],
  stats: DirectoryStatsInput[],
): DirectoryPerson[] {
  const loginById = new Map(logins.map((l) => [l.user_id, l]));
  const rolesById = new Map<string, AppRole[]>();
  for (const r of roleRows) rolesById.set(r.user_id, [...(rolesById.get(r.user_id) ?? []), r.role]);
  const fathomById = new Map(fathom.map((f) => [f.user_id, f]));
  const statsByGhl = new Map(stats.filter((s) => s.ghl_user_id).map((s) => [s.ghl_user_id!, s]));
  const statsByUser = new Map(stats.filter((s) => s.rep_user_id).map((s) => [s.rep_user_id!, s]));

  return members
    .map((m) => {
      const login = m.dialer_user_id ? loginById.get(m.dialer_user_id) : undefined;
      const st = (m.ghl_user_id ? statsByGhl.get(m.ghl_user_id) : undefined) ?? (m.dialer_user_id ? statsByUser.get(m.dialer_user_id) : undefined);
      const f = m.dialer_user_id ? fathomById.get(m.dialer_user_id) : undefined;
      const roles = (m.dialer_user_id ? rolesById.get(m.dialer_user_id) ?? [] : []).slice().sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
      return {
        key: m.ghl_user_id ?? m.dialer_user_id ?? m.name,
        name: m.name,
        email: login?.email ?? m.email,
        userId: m.dialer_user_id,
        ghlUserId: m.ghl_user_id,
        inGhl: m.in_ghl,
        hasLogin: m.has_dialer_login,
        roles,
        lastSignInAt: login?.last_sign_in_at ?? null,
        needsDialpad: m.needs_dialpad,
        hasDialpadSeat: m.has_dialpad_seat,
        isActive: m.is_active,
        fathom: m.has_dialer_login ? (f ? (f.status === "error" ? "problem" : "connected") : "not_connected") : null,
        meetings: st?.meetings_booked ?? 0,
        unrecorded: st?.pending ?? 0,
        showRatePct: st?.show_rate_pct ?? null,
      } satisfies DirectoryPerson;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface AttentionItem {
  key: string;
  tone: "warn" | "info";
  text: string;
}

const domainOf = (email: string | null) => (email?.split("@")[1] ?? "").toLowerCase();

/** What an admin should act on, most important first. Active people only. */
export function attentionItems(people: DirectoryPerson[]): AttentionItem[] {
  const active = people.filter((p) => p.isActive);
  const out: AttentionItem[] = [];

  const noLogin = active.filter((p) => !p.hasLogin && p.unrecorded > 0);
  if (noLogin.length > 0) {
    const total = noLogin.reduce((t, p) => t + p.unrecorded, 0);
    out.push({
      key: "unrecorded-no-login",
      tone: "warn",
      text: `${total} meetings taken by ${noLogin.map((p) => p.name).join(" and ")} have no outcome recorded, and they have no login. Give them one from their row, or record them from the Meetings page.`,
    });
  }

  for (const p of active.filter((x) => x.roles.length > 0 && domainOf(x.email) !== OWN_DOMAIN)) {
    out.push({
      key: `outside-${p.key}`,
      tone: "warn",
      text: `${p.name} (${p.email ?? "no email"}) has ${p.roles.map((r) => ROLE_LABEL[r]).join(" + ")} access with a non-Odin email.`,
    });
  }

  const idle = active.filter((p) => p.hasLogin && p.roles.length === 0);
  if (idle.length > 0) {
    out.push({
      key: "login-no-access",
      tone: "info",
      text: `${idle.map((p) => p.name).join(", ")} ${idle.length === 1 ? "has a login" : "have logins"} but no access. Give them a role or move them to former.`,
    });
  }
  return out;
}

/** "3h ago", "12d ago", a date, or "Never". */
export function lastSignInLabel(iso: string | null, now = Date.now()) {
  if (!iso) return "Never";
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "Unknown";
  const minutes = Math.round(ms / 60_000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
