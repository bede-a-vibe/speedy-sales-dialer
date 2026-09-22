import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Static data dictionary so an AI assistant (e.g. Claude) can interpret
 * Speedy Dialer data correctly when writing reports — no live data is
 * returned, only schema, vocabulary and KPI definitions.
 */
const DATA_DICTIONARY = {
  product: "Speedy Dialer — Odin Digital's power dialer and CRM for an Australian outbound sales team.",
  timezone_rule:
    "ALL daily and weekly metrics use Australia/Melbourne local-day boundaries, never UTC. A 'day' runs midnight-to-midnight in Melbourne (AEST UTC+10, AEDT UTC+11 in summer). Weeks run Monday–Sunday, Melbourne time. Timestamps themselves are stored in UTC (ISO 8601); convert before grouping by day.",
  entities: {
    contacts: {
      description: "One row per lead/business. Deduplicated on (business_name, phone). GHL (GoHighLevel) is the master CRM; contacts here are the operational dialling copy.",
      key_columns: {
        id: "UUID primary key — use this to reference a contact.",
        business_name: "Business name. Placeholder names like 'Unknown' mean unenriched.",
        contact_person: "Decision-maker name, when known.",
        phone: "Main business line, E.164 format (e.g. +613…). This is the number the dialer rings.",
        dm_phone: "Decision-maker direct line, E.164. Only trusted when phone_number_quality = 'confirmed'; 'suspect'/'dead' numbers must not be dialled.",
        email: "General business email.",
        dm_email: "Decision-maker email, when captured.",
        phone_number_quality: "unconfirmed | confirmed | suspect | dead — trust level of dm_phone.",
        state: "Australian state (VIC, NSW, QLD, SA, WA, TAS, NT, ACT).",
        industry: "Free-text industry.",
        is_dnc: "true = Do Not Call. Hard block — never dial, never suggest dialling.",
        last_outcome: "Outcome of the most recent logged call (see call_outcome enum).",
        key_quote: "Most useful verbatim quote captured on a call.",
        follow_up_note: "What the next call/email should say.",
        agreed_next_steps: "Next steps agreed with the prospect.",
        eod_email_flagged_at: "When a rep flagged this lead as 'worth an email tonight' in the dialer.",
        eod_email_sent_at: "When the rep marked that email as sent. Null + flagged = still owed.",
      },
    },
    call_logs: {
      description: "One row per dial. The source of truth for all activity metrics.",
      key_columns: {
        user_id: "The rep who made the call (auth user id).",
        contact_id: "The lead dialled.",
        outcome: "call_outcome enum (below).",
        created_at: "UTC timestamp of the call.",
        dialpad_talk_time_seconds: "Talk time from Dialpad — the ONLY trusted source for call duration.",
        reached_connection: "Funnel stage 1: connected with a human (>15s).",
        reached_problem_awareness: "Funnel stage 2: prospect acknowledged a problem.",
        reached_solution_awareness: "Funnel stage 3: prospect engaged with the solution.",
        reached_commitment: "Funnel stage 4: prospect gave a commitment.",
        "exit_reason_*": "Why the call stalled at that stage (free-text reason codes).",
        follow_up_date: "If set, a follow-up was scheduled on this call.",
        notes: "Rep's call notes.",
      },
    },
    contact_notes: {
      description: "Timeline notes on a contact. source column: manual | dialpad_summary | dialpad_transcript | ai_summary | call_transcript.",
    },
    pipelines: {
      description: "Follow-up and booking pipeline rows. pipeline_type: follow_up | booked. pipeline_status: open | completed | canceled.",
    },
  },
  call_outcome_enum: {
    no_answer: "Rang out / no pickup. Not a conversation.",
    voicemail: "Reached voicemail. Not a conversation.",
    gatekeeper: "Blocked by a gatekeeper; decision-maker not reached. Not a conversation.",
    not_interested: "Spoke to the prospect; declined.",
    follow_up: "Spoke to the prospect; a follow-up was scheduled.",
    booked: "Appointment booked. The primary conversion event.",
    wrong_number: "Number invalid or belongs to someone else. Excluded from connect-rate denominators where possible.",
    dnc: "Prospect asked not to be called. Number is now blocked.",
    disqualified: "Prospect is not a fit (wrong size, industry, etc.).",
  },
  kpi_definitions: {
    dials: "Count of call_logs in the window. Every logged call counts, including no_answer and wrong_number.",
    conversations:
      "Call logs where reached_connection = true (a real human conversation, >15s). This is the app's definition of a 'connect'.",
    connect_rate_pct: "conversations / dials × 100.",
    bookings: "Call logs with outcome = 'booked'.",
    booking_rate_pct: "bookings / conversations × 100 (bookings per conversation, NOT per dial).",
    talk_minutes: "Sum of dialpad_talk_time_seconds / 60, rounded.",
    funnel:
      "Stage counts use the reached_* boolean flags: connection → problem_awareness → solution_awareness → commitment → booked. Booked is only counted in the funnel when reached_connection is also true.",
    attribution:
      "Setters are credited for bookings they made; closers for appointments they sat. Appointment/revenue reporting splits these — check which one a report wants before quoting a number.",
  },
  gotchas: [
    "Never use dialpad_total_duration_seconds for talk time — it includes ring time. Use dialpad_talk_time_seconds.",
    "Never count dials to is_dnc = true contacts as opportunities; they're compliance blocks.",
    "dm_phone is only trustworthy when phone_number_quality = 'confirmed'.",
    "A contact with eod_email_flagged_at set and eod_email_sent_at null is still owed an email.",
    "Contacts are deduplicated on (business_name, phone) — the same business never appears twice with the same main line.",
  ],
};

export default defineTool({
  name: "describe_data",
  title: "Describe the data",
  description:
    "Data dictionary for Speedy Dialer: what each table and column means, the call outcome vocabulary, exact KPI formulas (connect rate, booking rate, funnel stages), the Melbourne-timezone rule for daily metrics, and common traps. Call this BEFORE writing a report from other tools' output so numbers are interpreted correctly.",
  inputSchema: {
    topic: z
      .enum(["all", "contacts", "call_logs", "kpis", "outcomes"])
      .optional()
      .describe("Narrow the dictionary to one area (default 'all')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ topic }) => {
    const t = topic ?? "all";
    const pick = () => {
      switch (t) {
        case "contacts":
          return { contacts: DATA_DICTIONARY.entities.contacts, gotchas: DATA_DICTIONARY.gotchas };
        case "call_logs":
          return {
            call_logs: DATA_DICTIONARY.entities.call_logs,
            call_outcome_enum: DATA_DICTIONARY.call_outcome_enum,
            timezone_rule: DATA_DICTIONARY.timezone_rule,
          };
        case "kpis":
          return { kpi_definitions: DATA_DICTIONARY.kpi_definitions, timezone_rule: DATA_DICTIONARY.timezone_rule };
        case "outcomes":
          return { call_outcome_enum: DATA_DICTIONARY.call_outcome_enum };
        default:
          return DATA_DICTIONARY;
      }
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(pick(), null, 2) }],
    };
  },
});
