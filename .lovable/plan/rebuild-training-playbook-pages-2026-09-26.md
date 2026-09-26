# Rebuild Training & Playbook pages

Both pages feel unfinished because half of Training is mock "preview" data (fake review packets, draft tasks, snapshot cards from `src/lib/trainingReview.ts`) and Playbook is a thin list with duplicated content. This plan rebuilds both around the real, working machinery that already exists (AI coach, roleplay trainer, winning-calls library, objection bank).

## Training page — declutter + real progress

**Remove (the clutter):**
- All `trainingReview.ts`-driven sections: coaching spotlights, review packets, review drafts, task queue, snapshot cards, "next additions" card
- The 13-tab mega-tab list (Real Calls, Coach, Streams, Manager, Scripts, Objections, Pipeline, Definitions, Patterns, Examples, Reviews, Packets, Playbook)
- Static filler arrays that duplicate the Playbook (objectionPlays etc.)

**New structure — 4 clean sections:**
1. **Your path** — the 14-day onboarding checklist, upgraded: steps that describe measurable actions (dial counts, roleplay rounds, drills) auto-tick from real `call_logs` / `roleplay_rounds` data instead of manual self-reporting; manual tick stays for the rest. Progress bar shows days complete.
2. **Your coach** — `CoachPanel` as the centrepiece (per-rep AI coaching from real calls), with a prominent "Practise this drill" button deep-linking into roleplay.
3. **Real calls** — `WinningCallsLibrary` (transcripts, audio, scorecards of calls that signed clients).
4. **Reference** — one accordion section keeping the genuinely useful static content: opener script, bad-time/voicemail recovery, DQ definitions, pipeline guidance, failure patterns, drills. Trimmed, not tabbed.
5. **Manager** (admins only) — `ManagerMetrics` + `ManagerPlaybook`, unchanged.

`src/lib/trainingReview.ts` and its test get deleted.

## Playbook page — real content + admin editing

**Restructure:**
- Lead with **Ask the Coach** + **Roleplay** as the hero (the two interactive tools), not a raw list
- Remove the duplicated `WinningCallsLibrary` (it lives on Training now)
- Objection bank below with search + category filters (kept), cards tightened

**Admin management (new):**
- Admins can add, edit and delete objections and their example responses directly in the UI (dialog form)
- Migration: add admin/coach write policies on `objection_bank` (currently read-only for everyone; writes only happen server-side from call analysis)

**More content:**
- Seed the bank with a proper set of NEPQ framework plays (opener brush-offs, "send me info", "we have an agency", price, timing, authority, competitor — ~20 objections with 2-3 responses each) so the bank is useful before call analysis accumulates more

## Technical notes

- Auto-progress: extend `useTrainingProgress` to compute objective step completion from `call_logs` (dial counts per day) and `roleplay_rounds` (rounds passed) — read-only derivation, no schema change
- `objection_bank` write policies: admin/coach INSERT/UPDATE/DELETE via `has_role`, per existing RBAC pattern
- Seed content inserted via run_sql (data, not schema)
- No changes to `coach-assistant`, `dialpad`, or any edge function
- Deleted: `src/lib/trainingReview.ts`, `src/test/trainingReview.test.ts`

## Verification

- Build clean, then Playwright pass over both pages as Bede (admin) and as Ben (rep): correct sections visible, admin edit buttons hidden for Ben, auto-ticked onboarding steps reflect real dial data
