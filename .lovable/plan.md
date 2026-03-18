

## Hour-by-Hour Stats & Booking Heat Map

### What we'll build

1. **New "Hourly Activity" tab** in ReportsPage with two views:
   - **Hourly breakdown table per rep**: For a selected date, show dials, pickups, bookings, and talk time broken down by hour (0–23) for each rep
   - **Booking heat map**: A visual grid (days × hours) showing booking density with color intensity, letting managers spot peak booking hours

2. **New metric computation** in `reportMetrics.ts`:
   - `getHourlyMetrics()` — takes call logs and booked items, groups by `hour` (from `created_at`) and optionally by `user_id`, returning per-hour counts for dials, pickups, bookings, and talk time
   - `getBookingHeatMapData()` — takes booked items for a date range, groups by day-of-week × hour to produce a 7×24 matrix of booking counts

3. **New components**:
   - `src/components/reports/HourlyBreakdownTable.tsx` — table with hours as rows, showing dials/pickups/bookings/talk time per rep (or aggregated). Highlights peak hours
   - `src/components/reports/BookingHeatMap.tsx` — CSS grid (7 rows × 24 cols) with color-scaled cells (e.g., transparent → primary intensity). Axes: days of week (Mon–Sun) vertically, hours (6am–9pm) horizontally

### Data source
All data already exists in `call_logs.created_at` and `pipeline_items.created_at`. No schema changes needed — just parse the hour from timestamps client-side.

### Integration
- Add a new tab "Hourly / Heat Map" to the existing `<Tabs>` in `ReportsPage.tsx`
- Reuse the existing date range and rep filters
- The hourly table defaults to today's date with a single-date picker
- The heat map uses the full selected date range

### Technical details

**`getHourlyMetrics` signature:**
```typescript
function getHourlyMetrics(
  callLogs: ReportCallLog[],
  bookedItems: ReportBookingItem[],
  date: string,          // single day YYYY-MM-DD
  repUserId?: string
): Array<{ hour: number; dials: number; pickUps: number; bookings: number; talkTimeSeconds: number }>
```

**`getBookingHeatMapData` signature:**
```typescript
function getBookingHeatMapData(
  bookedItems: ReportBookingItem[]
): Array<{ dayOfWeek: number; hour: number; count: number }>
```

**Heat map rendering:** A 7×24 CSS grid where each cell's background opacity scales with `count / maxCount`. Tooltip on hover shows exact count + day/hour label.

### Files to create/modify
- `src/lib/reportMetrics.ts` — add two new functions
- `src/components/reports/HourlyBreakdownTable.tsx` — new component
- `src/components/reports/BookingHeatMap.tsx` — new component
- `src/pages/ReportsPage.tsx` — add new tab with both views

