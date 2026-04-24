

## Plan: Stop "Pickup → Conversation" and "Conversation → Booking" from being polluted by pre-launch data

### What's wrong today

The "Pickup → Conversation" and "Conversation → Booking" tiles in your screenshot show **1%** and **264%**. Both numbers are nonsense, and they're nonsense for the same reason:

- **Conversations** is defined as `call_logs.reached_connection = true`.
- The conversation-progress feature that writes that column only started recording values on **2026-04-23**.
- Every call log from **2026-03-17 → 2026-04-22** has `reached_connection = false` because that's the column default — not because the rep didn't actually have a conversation.
- Result: across any date range that includes pre-2026-04-23 data, the numerator (bookings, talk time) is huge and the denominator (conversations) is tiny → "Conversation → Booking" can easily exceed 100%.

I confirmed this directly in the database:

```
2026-04-22  dials=33  reached_connection=true  → 0
2026-04-23  dials=29  reached_connection=true  → 2   ← feature went live
2026-04-24  dials=54  reached_connection=true  → 12
```

So the data isn't broken — we just need to stop pretending the "Conversation" metric exists for dates before the tagging system was turned on.

### The fix

**Introduce a single launch-date constant** for the conversation-tagging system and use it to:

1. **Filter the conversations denominator** — only count `reached_connection = true` calls from on/after the launch date.
2. **Filter the conversation→booking numerator the same way** — only count bookings made on/after the launch date when computing the conversation→booking rate. Otherwise we'd still divide weeks of bookings by 2 days of conversations.
3. **Show "—" instead of a misleading percentage** when the date range being viewed has *no overlap* with the post-launch period (e.g. someone runs a March report).
4. **Add a small "Since YYYY-MM-DD" subtext** under both tiles so the team understands why these two are scoped differently from the other rates. This avoids future "why doesn't this match the other tile?" confusion.

The other six tiles in the strip (Dial → Pickup, Pickup → Booking, Booking → Showed, Showed → Closed, Lead → Booked, Talk / Conversation) all use metrics that have been recorded correctly the whole time and stay untouched.

### Where the change lives

**1. New constant** — somewhere stable like `src/data/constants.ts`:

```ts
// Conversation-progress tagging (reached_connection / reached_problem_awareness / etc.)
// went live on this date. Any call log before this date has reached_connection=false
// purely because the field didn't exist yet — not because the rep failed to converse.
// Metrics that depend on these tags must clip to this date or they will be polluted.
export const CONVERSATION_TAGGING_LAUNCH_DATE = "2026-04-23";
```

**2. `src/lib/reportMetrics.ts`** — change how `conversations` and `conversationToBookingRate` are computed:

- `conversations` becomes: filtered call logs where `reached_connection === true` **AND** `created_at >= CONVERSATION_TAGGING_LAUNCH_DATE`.
- A new field `conversationsEligibleDials` (number of dials in the range that are on/after the launch date) so we can also tell the UI when the slice is non-zero.
- `conversationToBookingRate` becomes: bookings made on/after the launch date *and* in the date range, divided by that same scoped `conversations` count. If `conversations === 0` *and* the date range ends before the launch date, return `null` (not 0) so the UI can render "—".
- Add a small flag `conversationMetricsScoped: boolean` or just expose the launch-date itself on the metrics object so the tile can render the "Since 23 Apr" footnote when the user's selected range overlaps the cutoff.

**3. `src/components/funnel/ConversionRateStrip.tsx`** — the only place these two tiles render:

- Replace the inline `pct(...)` math with the values straight off the new metrics object.
- When the value is `null`, show `—` and a subtext "No data since 23 Apr 2026".
- When the date range starts before the launch date, show the percentage and add a `subtext="Since 23 Apr 2026"` so anyone comparing tiles knows the scope.

**4. `src/lib/funnelStatsCatalog.ts`** — the `pickup_conversation` and `conversation_to_booking` entries used in the customizable Custom Stat Grid currently call the same raw fields. Update them to read the same scoped values from `metrics.dialer.conversations` / `metrics.dialer.conversationToBookingRate` (which will now already be scoped because the metrics layer changed). No catalog UI changes — just keep the labels and add `"(since 23 Apr)"` to the subtext for those two stats only.

**5. `src/lib/funnelMetrics.ts` (End-to-End Funnel chart)** — same family of bug. The funnel chart's "Connection / Problem-Awareness / Solution-Awareness / Commitment" bars all read `reached_*` flags. For any date range that includes pre-launch dates, the funnel collapses to near-zero after the Pickup stage, which looks alarming but isn't real. Apply the same launch-date clamp inside `computeFunnel`: only count `reached_*` flags from logs on/after the launch date, and add a single line of subtext on the funnel header card ("Connection-stage tracking started 23 Apr 2026") when the date range straddles the cutoff.

### What this does NOT change

- It does **not** delete or touch any historical call logs.
- It does **not** affect Dial → Pickup, Pickup → Booking, Booking → Showed, Showed → Closed, Lead → Booked, or Talk Time. Those have always been recorded correctly.
- It does **not** affect the Bookings Made KPI, Cash Collected, Show-Up Rate, or any rep leaderboards / targets — those don't depend on `reached_connection`.
- It does **not** change the dialer UI or how reps tag conversation progress going forward.

### Why a hardcoded launch date instead of "any date the user picks"

The launch date is a property of the *dataset*, not of the user's filter. If we just clamped to whatever range the user selected, the numbers would still be wrong any time someone picked a range starting before 23 Apr. The constant lets every viewer see honest numbers regardless of the filter, and it's documented in code so the next person who looks at it knows exactly why.

If you ever backfill the historical `reached_connection` values (e.g. by reprocessing transcripts), we just delete the constant and the metrics revert to using all data automatically.

### Out of scope

- Backfilling pre-23-Apr `reached_connection` values from transcripts (separate, larger job).
- Re-defining "Conversation" to mean something else (e.g. "any call >30s talk time"). The current definition is the right one for coaching; we just need it to be honest about when it started being recorded.
- Touching the rep-comparison or per-rep coaching scorecards. They use the same `conversations` field so they'll benefit automatically once the metrics layer change lands — no extra work needed.

