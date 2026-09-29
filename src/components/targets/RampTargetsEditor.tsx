import { useEffect, useState } from "react";
import { RotateCcw, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRampBands, useSaveRampBands } from "@/hooks/useKpiSettings";
import { useIsAdmin } from "@/hooks/useUserRole";

const FIELDS = [
  { key: "hoursPerDay", label: "Hours / day" },
  { key: "setsPerDay", label: "Meetings set / day" },
  { key: "booksPerHour", label: "Bookings / hour" },
  { key: "dialsPerDay", label: "Dials / day" },
  { key: "pickupRate", label: "Pick-up rate %" },
  { key: "showRate", label: "Show rate %" },
  { key: "closeRate", label: "Close rate %" },
] as const;

type Row = Record<(typeof FIELDS)[number]["key"], string>;

/** Admin-only editor for the tenure-band targets that drive the per-rep cards. */
export function RampTargetsEditor() {
  const isAdmin = useIsAdmin();
  const { data } = useRampBands();
  const save = useSaveRampBands();
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    if (!data) return;
    setRows(Object.fromEntries(data.bands.map((b: any) => [b.label,
      Object.fromEntries(FIELDS.map((f) => [f.key, b[f.key] == null ? "" : String(b[f.key])])) as Row])));
  }, [data]);

  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const onSave = async () => {
    const out: Record<string, any> = {};
    for (const [label, r] of Object.entries(rows)) {
      out[label] = Object.fromEntries(FIELDS.map((f) => [f.key, num(r[f.key])]));
      out[label].hoursPerDay = out[label].hoursPerDay ?? 0;
    }
    try { await save.mutateAsync(out); toast.success("Targets saved"); }
    catch (e: any) { toast.error(e.message ?? "Couldn't save targets"); }
  };
  const onReset = async () => {
    if (!confirm("Reset every tenure target back to the standard figures?")) return;
    try { await save.mutateAsync(null); toast.success("Targets reset to standard"); }
    catch (e: any) { toast.error(e.message ?? "Couldn't reset"); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-5 w-5 text-primary" /> Targets{data?.customised ? " (custom)" : ""}
        </CardTitle>
        <CardDescription>Daily targets by tenure — each rep gets the row that matches how long they've been here. Weekly = daily × 5, monthly = daily × 18.6. Leave a box blank for no target.{isAdmin ? "" : " Only admins can change these."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Tenure</th>
                {FIELDS.map((f) => <th key={f.key} className="py-2 pr-3 font-medium">{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(rows).map(([label, r]) => (
                <tr key={label} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{label}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="py-2 pr-3">
                      {isAdmin ? (
                        <Input type="number" step="0.01" inputMode="decimal" className="h-8 w-20 font-mono" value={r[f.key]}
                          onChange={(e) => setRows((s) => ({ ...s, [label]: { ...s[label], [f.key]: e.target.value } }))} />
                      ) : <span className="font-mono">{r[f.key] || "—"}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={onReset} disabled={save.isPending}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reset to defaults
            </Button>
            <Button onClick={onSave} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save targets"}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
