import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchContacts from "./tools/search-contacts";
import getContact from "./tools/get-contact";
import myCallActivity from "./tools/my-call-activity";
import listFollowUps from "./tools/list-follow-ups";
import addContactNote from "./tools/add-contact-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "speedy-dialer",
  title: "Speedy Dialer",
  version: "0.1.0",
  instructions:
    "Tools for Speedy Dialer, Odin Digital's power dialer and CRM. Look contacts up with `search_contacts`, then use the returned ID with `get_contact` for the full record, recent calls and notes. `my_call_activity` summarises the signed-in rep's own dialling. `list_follow_ups` shows their scheduled follow-ups and booked appointments. `add_contact_note` writes a note to a contact's timeline. All access runs as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchContacts, getContact, myCallActivity, listFollowUps, addContactNote],
});