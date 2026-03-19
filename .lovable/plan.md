# Multi-Tier Achievement System

## Current State

All 7 achievements are daily-only, hardcoded in `AchievementBadges.tsx`. No weekly, monthly, or lifetime tracking exists. The data hooks (`useCallLogs`, `useStreak`) already fetch enough history to power longer-term achievements without new database tables — call_logs has full history and pipeline_items tracks bookings/outcomes.

## Design

Organize achievements into 4 tiers displayed as **tabbed sections** (Daily / Weekly / Monthly / Lifetime) within the existing achievements card. Each tab shows its own progress bar and badge grid.

### Achievement Definitions

**Daily (7 badges — keep existing + tweak)**

1. First Blood — Make your first call today
2. Warmed Up — Hit 10 calls
3. On Fire — Smash 25 calls
4. Target Hit — Reach daily dial target
5. Closer — Book 5 appointments today
6. Perfect Pitch — 15%+ pickup to booking rate today (≥100 calls)
7. Double Up — Hit 2× daily target

**Weekly (6 badges)**

1. Monday Momentum — Make 100+ calls on Monday
2. Weekly Warrior — Hit daily target 4 out of 5 days
3. Week Slayer — 600+ calls this week
4. Booking Machine — 20+ bookings this week
5. Iron Will — 5-day streak (no missed days)
6. Conversion King — 3%+ booking rate this week (≥50 calls)

**Monthly (5 badges)**

1. Thousand Club — 5,000+ calls this month
2. Monthly MVP — 75+ bookings this month
3. Consistency Crown — 15+ active days this month
4. Cash Collector — $10,000+ deal value closed this month
5. Streak Master — 20-day streak

**Lifetime (5 badges)**

1. Centurion — 100+ total calls (existing)
2. 1K Club — 1,000+ total calls
3. 10K Legend — 50,000+ total calls
4. Grand Closer — 1000+ total bookings
5. Veteran — 300-day all-time streak

### Data Sources (no new tables needed)


| Data                             | Source                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Daily/weekly/monthly call counts | `useCallLogs()` filtered by date range                                                |
| Bookings                         | `call_logs` where `outcome = 'booked'`                                                |
| Pickup rate                      | `call_logs` outcomes in `ANSWERED_OUTCOMES`                                           |
| Streak                           | `useStreak()` (already queries 60 days, extend to all-time for lifetime)              |
| Cash collected                   | `usePipelineItems()` — sum `deal_value` where `appointment_outcome = 'showed_closed'` |
| Days active this month           | Distinct dates from `call_logs`                                                       |


### UI Changes

- Replace single flat grid with a **tab bar** (Daily / Weekly / Monthly / Lifetime) inside the achievements card
- Each tab has its own progress bar ("X / Y unlocked") and badge grid
- Badge grid adapts columns: 7 cols for daily, 6 for weekly, 5 for monthly/lifetime
- Tab badges show unlocked count as a small number indicator

### New Hook

Create `useAchievementData(userId)` that fetches and memoizes:

- Total call count, this week's calls, this month's calls
- Total bookings, weekly bookings, monthly bookings  
- Days active this month
- Monthly cash collected from pipeline_items
- Weekly pickup rate, weekly booking rate

This centralizes the queries so `AchievementBadges` stays clean.

## Files Changed


| File                                             | Change                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `src/hooks/useAchievementData.ts`                | New hook — fetches call stats by period, bookings, cash, days active        |
| `src/hooks/useStreak.ts`                         | Extend lookback from 60 days to 365 for lifetime streak                     |
| `src/components/dashboard/AchievementBadges.tsx` | Rewrite — add tabs, define all 23 achievements across 4 tiers, use new hook |
