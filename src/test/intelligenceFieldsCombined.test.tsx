import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update"]) chain[m] = () => chain;
  chain.maybeSingle = () =>
    Promise.resolve({ data: { created_by: "setter-1", assigned_user_id: "closer-1", source_call_log_id: "call-1" }, error: null });
  return { supabase: { from: () => chain, auth: { getUser: () => Promise.resolve({ data: { user: null } }) } } };
});
vi.mock("@/hooks/usePipelineItems", () => ({
  useSalesReps: () => ({ data: [{ user_id: "setter-1", display_name: "Ben" }, { user_id: "closer-1", display_name: "Bede" }] }),
}));
vi.mock("@/hooks/useGHLFieldSchema", () => ({ useGHLFieldSchema: () => ({ data: { byKey: {} } }) }));
vi.mock("@/lib/ghl", () => ({ ghlGetContact: vi.fn(), ghlUpdateContactFields: vi.fn() }));

import { getAllGhlFieldDefs } from "@/lib/ghlFieldFolders";
import { ContactIntelligencePanel, formatReadOnlyValue } from "@/components/dialer/ContactIntelligencePanel";

/** Every field the dialer's Intelligence tab had before it was aligned to GHL (PR #183), by GHL key. */
const DIALER_FIELDS_BEFORE_ALIGNMENT = [
  "contact.buying_signal_strength", "contact.budget_indication", "contact.authority_level", "contact.buying_timeline",
  "contact.need_identified", "contact.current_solution_satisfaction", "contact.contract__lockin_status", "contact.key_objection",
  "contact.work_type", "contact.business_size", "contact.service_area", "contact.number_of_trucksvans", "contact.years_in_business",
  "contact.estimated_annual_revenue", "contact.abn", "contact.website_not_always_formatted", "contact.website_quality",
  "contact.runs_google_ads", "contact.runs_facebook_ads", "contact.existing_agency", "contact.monthly_media_spend",
  "contact.current_marketing_channels", "contact.seo_visibility", "contact.social_media_presence", "contact.agency_satisfaction",
  "contact.lead_source_dependency", "contact.marketing_pain_points", "contact.last_call_sentiment", "contact.problem_resonance",
  "contact.key_quote", "contact.competitive_intel", "contact.agreed_next_steps", "contact.rep_coaching_notes", "contact.ai_call_summary",
  "contact.gatekeeper_name", "contact.gatekeeper_role", "contact.best_route_to_decision_maker", "contact.gatekeeper_notes",
  "contact.decision_maker_name", "contact.decision_maker_role", "contact.decision_maker_phone", "contact.decision_maker_phone_type",
  "contact.decision_maker_email", "contact.decision_maker_linkedin", "contact.dial_count", "contact.last_called_at",
  "contact.next_followup_date", "contact.best_time_to_call", "contact.preferred_contact_method", "contact.call_disposition",
  "contact.objection_notes", "contact.gmb_link", "contact.google_rating", "contact.google_review_count", "contact.trade_type",
  "contact.phone_number_quality", "contact.prospect_tier", "contact.meeting_set_by_role", "contact.setter_name",
  "contact.assigned_closer", "contact.meeting_source", "contact.meeting_booked_date", "contact.has_existing_agency",
  "contact.existing_agency_services",
];

describe("Intelligence tab carries the dialer's fields and GHL's", () => {
  it("keeps every field the dialer had before the GHL alignment", () => {
    const keys = new Set(getAllGhlFieldDefs().map((d) => d.key));
    expect(DIALER_FIELDS_BEFORE_ALIGNMENT.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("gives every field a GHL id and no key twice", () => {
    const defs = getAllGhlFieldDefs();
    expect(defs.filter((d) => !d.ghlId)).toEqual([]);
    expect(new Set(defs.map((d) => d.key)).size).toBe(defs.length);
    expect(new Set(defs.map((d) => d.ghlId)).size).toBe(defs.length);
  });

  it("never lets the panel edit what the dialer owns", () => {
    const owned = ["last_outcome", "meeting_booked_date", "lifecycle_stage", "lead_channel", "lead_type", "mobile_reaches_gatekeeper"];
    const defs = getAllGhlFieldDefs().filter((d) => d.supabaseColumn && owned.includes(d.supabaseColumn));
    expect(defs.map((d) => d.supabaseColumn).sort()).toEqual([...owned].sort());
    expect(defs.every((d) => d.readOnly)).toBe(true);
  });

  it("reads dialer values the way a rep would", () => {
    const def = (key: string) => getAllGhlFieldDefs().find((d) => d.key === key)!;
    expect(formatReadOnlyValue(def("contact.call_disposition"), "no_answer")).toBe("No Answer");
    expect(formatReadOnlyValue(def("contact.lifecycle_stage"), "attempting")).toBe("Attempting");
    expect(formatReadOnlyValue(def("contact.mobile_reaches_gatekeeper"), true)).toBe("Yes");
    expect(formatReadOnlyValue(def("contact.lifecycle_reason"), "Archived 17 Sep 2026: international number")).toBe("Archived 17 Sep 2026: international number");
  });

  it("shows dialer-owned values read-only and booking attribution from the latest meeting", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ContactIntelligencePanel
          contactId="c-1"
          ghlContactId={null}
          contact={{ last_outcome: "follow_up", meeting_booked_date: "2026-11-12T00:00:00Z", lifecycle_stage: "booked" }}
        />
      </QueryClientProvider>,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Appointments/ }), { button: 0 });
    expect(await screen.findByText("Ben")).toBeTruthy();
    expect(screen.getByText("Bede")).toBeTruthy();
    expect(screen.getByText("Dialer call")).toBeTruthy();
    expect(screen.getByText("Setter")).toBeTruthy();
    expect(screen.getByText("12 Nov 2026")).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Dialer Activity/ }), { button: 0 });
    const disposition = await screen.findByText("Follow Up");
    expect(disposition.closest("div")?.querySelector("input, textarea, button")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Lead Routing/ }), { button: 0 });
    expect(await screen.findByText("Booked")).toBeTruthy();
  });

  it("shows Marketing as one tab: the capture on top, then the folder's other fields, none twice", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ContactIntelligencePanel
          contactId="c-3"
          ghlContactId={null}
          contact={{}}
          marketing={<div>Marketing capture</div>}
        />
      </QueryClientProvider>,
    );
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent ?? "");
    expect(tabs.filter((t) => t.startsWith("Marketing"))).toHaveLength(1);
    // GHL's order: Marketing sits between the built-in General Info and Additional Info.
    const general = tabs.findIndex((t) => t.startsWith("General Info"));
    expect(tabs[general + 1]).toMatch(/^Marketing/);
    expect(tabs[general + 2]).toMatch(/^Additional Info/);

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Marketing/ }), { button: 0 });
    expect(await screen.findByText("Marketing capture")).toBeTruthy();
    expect(screen.getByText("Marketing Pain Points")).toBeTruthy();
    expect(screen.getByText("Agency Satisfaction")).toBeTruthy();
    for (const captured of ["Runs Google Ads", "Has Existing Agency", "Existing Agency Notes"]) {
      expect(screen.queryByText(captured)).toBeNull();
    }

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Additional Info/ }), { button: 0 });
    expect(await screen.findByText("GMB Link")).toBeTruthy();
    expect(screen.queryByText("Monthly Media Spend")).toBeNull();
  });

  it("is the one place to capture the decision maker: opens there, with one-tap picks", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ContactIntelligencePanel contactId="c-2" ghlContactId={null} contact={{}} defaultFolder="contact" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Decision Maker Name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Owner" }));
    expect((screen.getByDisplayValue("Owner") as HTMLInputElement).value).toBe("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Ask for by Name" }));
    expect(screen.getByDisplayValue("Ask for by Name")).toBeTruthy();
  });
});
