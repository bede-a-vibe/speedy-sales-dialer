import { useEffect, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRampBands, useSaveRampBands } from "@/hooks/useKpiSettings";
import { useIsAdmin } from "@/hooks/useUserRole";

const FIELDS = [
  { key: "hoursPerDay", label: "Hours / day" },
  { key: "setsPerDay", label: "Meetings set / day" },
  { key: "booksPerHour", label: "Bookings / hour" },
  { key: "showRate", label: "Show rate %" },
] as const;

type Row = Record<(typeof FIELDS)[number]["key"], string>;

/** Admin-only editor for the tenure-band targets that drive the per-rep cards. */
export function RampTargetsEditor() {
  const isAdmin = useIsAdmin();
  const { data } = useRampBands();
  const save = useSaveRampBands();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    if (!open || !data) return;
    setRows(Object.fromEntries(data.bands.map((b) => [b.label, {
      hoursPerDay: String(b.hoursPerDay), setsPerDay: b.setsPerDay == null ? "" : String(b.setsPerDay),
      booksPerHour: b.booksPerHour == null ? "" : String(b.booksPerHour), showRate: b.showRate == null ? "" : String(b.showRate),
    }])));
  }, [open, data]);

  if (!isAdmin) return null;

  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const onSave = async () => {
    const out: Record<string, any> = {};
    for (const [label, r] of Object.entries(rows)) {
      out[label] = { hoursPerDay: num(r.hoursPerDay) ?? 0, setsPerDay: num(r.setsPerDay), booksPerHour: num(r.booksPerHour), showRate: num(r.showRate) };
    }
    try { await save.mutateAsync(out); toast.success("Targets saved"); setOpen(false); }
    catch (e: any) { toast.error(e.message ?? "Couldn't save targets"); }
  };
  const onReset = async () => {
    if (!confirm("Reset every tenure target back to the standard figures?")) return;
    try { await save.mutateAsync(null); toast.success("Targets reset to standard"); setOpen(false); }
    catch (e: any) { toast.error(e.message ?? "Couldn't reset"); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit targets{data?.customised ? " (custom)" : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Daily targets by tenure</DialogTitle>
            <DialogDescription>Each rep gets the row that matches how long they've been here. Weekly = daily × 5, monthly = daily × 18.6. Leave a box blank for no target.</DialogDescription>
          </DialogHeader>
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
                        <Input type="number" step="0.01" inputMode="decimal" className="h-8 w-24 font-mono" value={r[f.key]}
                          onChange={(e) => setRows((s) => ({ ...s, [label]: { ...s[label], [f.key]: e.target.value } }))} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={onReset} disabled={save.isPending}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reset to standard
            </Button>
            <Button onClick={onSave} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save targets"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
