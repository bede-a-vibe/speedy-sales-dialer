import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchContacts from "./tools/search-contacts";
import getContact from "./tools/get-contact";
import myCallActivity from "./tools/my-call-activity";
import listFollowUps from "./tools/list-follow-ups";
import addContactNote from "./tools/add-contact-note";
import tonightsEmailRound from "./tools/tonights-email-round";
import describeData from "./tools/describe-data";
import reportSnapshot from "./tools/report-snapshot";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "speedy-dialer",
  title: "Speedy Dialer",
  version: "0.1.0",
  instructions:
    "Tools for Speedy Dialer, Odin Digital's power dialer and CRM. Look contacts up with `search_contacts`, then use the returned ID with `get_contact` for the full record, recent calls and notes. `my_call_activity` summarises the signed-in rep's own dialling. `list_follow_ups` shows their scheduled follow-ups and booked appointments. `add_contact_note` writes a note to a contact's timeline. `tonights_email_round` lists the leads they flagged in the dialer as worth an email tonight that are still unsent. For REPORTS: call `describe_data` first for column meanings, outcome vocabulary, KPI formulas and the Melbourne-timezone rule, then `report_snapshot` for pre-aggregated dials/conversations/bookings/talk-time (per rep, or team-wide for admins). All access runs as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchContacts, getContact, myCallActivity, listFollowUps, addContactNote, tonightsEmailRound, describeData, reportSnapshot],
});