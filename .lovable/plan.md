

## Plan: Reorganize Log This Call panel + move Notes beneath it

Restructure the merged "Log This Call" panel so the most-used outcomes sit at the top, conversation tagging in the middle, and the heavier outcomes at the bottom. Then move the Notes panel directly beneath it so reps don't have to scan around.

### What you see

**1. New "Log This Call" panel order**

```
┌─ LOG THIS CALL ──────────────────── REQUIRED ─┐
│                                                 │
│  QUICK OUTCOMES                                 │
│  [ 📵  No Answer                        1 ]    │
│  [ 📧  Voicemail                        2 ]    │
│                                                 │
│  ──────────── Conversation ────────────         │
│                                                 │
│  [⚠ Hung up before I could speak]              │
│                                                 │
│  Opener:  [None / not tracked            ▾]    │
│                                                 │
│  Stages:  ☐ Connected        ☐ Problem         │
│           ☐ Solution         ☐ Commitment      │
│                                                 │
│  Why ended? (Lost at Connection)                │
│  [Not tracked                            ▾]    │
│  [Optional context...                      ]    │
│                                                 │
│  ──────────── Other Outcomes ───────────        │
│  [ 👎  Not Interested                   3 ]    │
│  [ ✋  DNC                              4 ]    │
│  [ 📅  Follow Up                        5 ]    │
│  [ ✅  Book                             6 ]    │
│                                                 │
└─────────────────────────────────────────────────┘
```

Why this order:
- **No Answer / Voicemail** are by far the most common — top of panel, one-click logging without scrolling
- **Conversation tagging** sits in the middle because it only matters when you actually had a conversation (i.e., you're about to pick one of the bottom outcomes)
- **Not Interested / DNC / Follow Up / Book** are the post-conversation outcomes — they live below the conversation block so the flow reads top-to-bottom: "Did they pick up? → If yes, tag what happened → Then pick the conversation outcome"

**2. Notes panel moves directly below Log This Call**

Currently `ContactNotesPanel` sits further down the right column (after Dialpad Sync / Queue Intel area). After this change it sits **immediately under** the Log This Call panel — so the right column becomes:

```
┌─ Log This Call ──────────┐
│  (outcomes + conversation)│
└──────────────────────────┘
┌─ Call Notes ─────────────┐
│  (textarea + history)    │
└──────────────────────────┘
┌─ Pipeline / Booking ─────┐  ← only when an outcome needs it
└──────────────────────────┘
┌─ Log & Skip actions ─────┐
└──────────────────────────┘
┌─ Dialpad Sync ───────────┐
└──────────────────────────┘
┌─ Queue Intel ────────────┐
└──────────────────────────┘
```

**3. Conditional behavior preserved**

- The "Conversation" middle section + the four bottom outcomes are still hidden when needed by existing logic (e.g., the "Hung up before I could speak" path)
- Keyboard shortcuts (1–6) unchanged
- All callbacks, state, validation untouched

### Files

**New**
- `src/components/dialer/LogCallPanel.tsx` — single card rendering: top quick outcomes (No Answer, Voicemail), divider + embedded conversation tagging, divider + remaining outcomes (Not Interested, DNC, Follow Up, Book). Receives the same props the two old sections did (selected outcome, onOutcomeSelect, conversation state + onChange, outcomeIsBooked).

**Edited**
- `src/components/dialer/ConversationProgressPanel.tsx` — add optional `embedded?: boolean` prop. When true, drop the outer `rounded-lg border bg-card p-4` chrome and the redundant `<TrendingUp /> Conversation Progress` heading; render only the inner controls. Switch the four stage checkboxes from vertical stack to a `grid grid-cols-2 gap-2` layout. Default behavior unchanged for any other consumer.
- `src/pages/DialerPage.tsx`:
  - Replace the existing Call Outcome card section + the standalone `<ConversationProgressPanel ... />` with a single `<LogCallPanel ... />` passing the same props through.
  - Move the `<ContactNotesPanel ... />` JSX block so it renders directly after `<LogCallPanel />` in the right column (before Pipeline/Booking, Log & Skip, Dialpad Sync, Queue Intel).

### Out of scope
- Compacting outcome buttons into an icon grid
- Changing keyboard shortcuts or outcome labels
- Auto-collapsing sections
- Touching Pipeline Assignment / Booking Schedule logic
- Changing how the Notes panel itself renders internally (just relocating it)

