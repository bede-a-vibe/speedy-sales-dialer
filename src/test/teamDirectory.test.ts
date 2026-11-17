import { describe, expect, it } from "vitest";
import { attentionItems, buildDirectory, lastSignInLabel, type DirectoryMemberInput } from "@/lib/teamDirectory";

const member = (over: Partial<DirectoryMemberInput>): DirectoryMemberInput => ({
  ghl_user_id: null, dialer_user_id: null, name: "X", email: null, in_ghl: false, has_dialer_login: false,
  needs_dialpad: false, has_dialpad_seat: false, is_active: true, ...over,
});

describe("team directory", () => {
  const members = [
    member({ ghl_user_id: "g-bede", dialer_user_id: "u-bede", name: "Bede Alexander", email: "bede@odindigital.com.au", in_ghl: true, has_dialer_login: true, has_dialpad_seat: true }),
    member({ ghl_user_id: "g-matteo", dialer_user_id: "u-matteo", name: "Matteo Banzon", email: "matteobanzon@gmail.com", in_ghl: true, has_dialer_login: true }),
    member({ dialer_user_id: "u-contact", name: "Contact", email: "contact@frontendng.com", has_dialer_login: true }),
    member({ dialer_user_id: "u-test", name: "Test User", email: "test@salesdialer.com", has_dialer_login: true }),
    member({ ghl_user_id: "g-karla", name: "Karla", email: "karla@gmail.com", in_ghl: true }),
    member({ ghl_user_id: "g-jake", name: "Jake Dimo", email: "jake@veritasdigital.com.au", in_ghl: true, is_active: false }),
  ];
  const logins = [
    { user_id: "u-bede", email: "bede@odindigital.com.au", display_name: "Bede", last_sign_in_at: "2026-11-18T00:00:00Z" },
    { user_id: "u-matteo", email: "matteo@odindigital.com.au", display_name: "Matteo", last_sign_in_at: null },
    { user_id: "u-contact", email: "contact@frontendng.com", display_name: "Contact", last_sign_in_at: null },
    { user_id: "u-test", email: "test@salesdialer.com", display_name: "Test", last_sign_in_at: null },
  ];
  const roles = [
    { user_id: "u-bede", role: "sales_rep" as const },
    { user_id: "u-bede", role: "admin" as const },
    { user_id: "u-matteo", role: "sales_rep" as const },
    { user_id: "u-contact", role: "coach" as const },
  ];
  const stats = [
    { ghl_user_id: "g-matteo", rep_user_id: "u-matteo", meetings_booked: 139, pending: 96, show_rate_pct: 34.3 },
    { ghl_user_id: "g-karla", rep_user_id: null, meetings_booked: 5, pending: 3, show_rate_pct: 20 },
  ];
  const people = buildDirectory(members, logins, roles, [{ user_id: "u-bede", status: "active", last_synced_at: null }], stats);
  const byName = (n: string) => people.find((p) => p.name === n)!;

  it("merges login, roles, Fathom and stats into one row per person", () => {
    expect(byName("Bede Alexander").roles).toEqual(["admin", "sales_rep"]);
    expect(byName("Bede Alexander").fathom).toBe("connected");
    // The login email wins over the GHL email.
    expect(byName("Matteo Banzon").email).toBe("matteo@odindigital.com.au");
    expect(byName("Matteo Banzon").unrecorded).toBe(96);
    expect(byName("Matteo Banzon").fathom).toBe("not_connected");
    expect(byName("Karla").hasLogin).toBe(false);
    expect(byName("Karla").fathom).toBeNull();
    expect(byName("Jake Dimo").isActive).toBe(false);
  });

  it("flags what an admin should act on, active people only", () => {
    const items = attentionItems(people);
    expect(items.map((i) => i.key)).toEqual(["unrecorded-no-login", "outside-u-contact", "login-no-access"]);
    expect(items[0].text).toContain("3 meetings taken by Karla");
    expect(items[1].text).toContain("Contact (contact@frontendng.com) has Coach access with a non-Odin email");
    expect(items[2].text).toContain("Test User has a login but no access");
  });

  it("labels last sign-in", () => {
    const now = new Date("2026-11-18T05:00:00Z").getTime();
    expect(lastSignInLabel(null, now)).toBe("Never");
    expect(lastSignInLabel("2026-11-18T02:00:00Z", now)).toBe("3h ago");
    expect(lastSignInLabel("2026-11-06T05:00:00Z", now)).toBe("12d ago");
  });
});
