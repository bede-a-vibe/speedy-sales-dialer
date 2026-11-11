import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ghlUpdateOpportunity } from "@/lib/ghl";
import { OPPORTUNITY_COLUMNS, OPPORTUNITY_FIELDS, type OpportunityFieldDef } from "@/lib/ghlOpportunityFields";
import { cn } from "@/lib/utils";

type Values = Record<string, string>;

const CLEAR = "__clear__";

function toInput(def: OpportunityFieldDef, v: unknown): string {
  if (v == null) return "";
  if (def.kind === "date") return String(v).slice(0, 10);
  return String(v);
}

function toColumn(def: OpportunityFieldDef, v: string): string | number | null {
  const t = v.trim();
  if (!t) return null;
  if (def.kind === "money" || def.kind === "number") {
    const n = Number(t.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? (def.kind === "number" ? Math.round(n) : n) : null;
  }
  return t;
}

/**
 * GHL's "Opportunity Details" folder on a meeting: deal type, service stream,
 * quoted setup and MRR, commitment, dates and churn. Saves to the meeting row
 * and, when the meeting is linked to a GHL opportunity, to that opportunity's
 * custom fields by id.
 */
export function OpportunityDetailsSection({ itemId, ghlOpportunityId }: { itemId: string; ghlOpportunityId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>({});
  const [saving, setSaving] = useState(false);

  const { data: row, isLoading } = useQuery({
    queryKey: ["opportunity-details", itemId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_items")
        .select(OPPORTUNITY_COLUMNS.join(", "))
        .eq("id", itemId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
  });

  useEffect(() => {
    if (!row) return;
    const next: Values = {};
    for (const def of OPPORTUNITY_FIELDS) next[def.column] = toInput(def, row[def.column]);
    setValues(next);
  }, [row]);

  const filled = OPPORTUNITY_FIELDS.filter((d) => (values[d.column] ?? "").trim()).length;
  const dirty = row ? OPPORTUNITY_FIELDS.some((d) => (values[d.column] ?? "") !== toInput(d, row[d.column])) : false;

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const update: Record<string, unknown> = {};
      // GHL's opportunity API takes camelCase fieldValue as a string (contacts use field_value).
      const ghlFields: Array<{ id: string; fieldValue: string }> = [];
      for (const def of OPPORTUNITY_FIELDS) {
        const v = values[def.column] ?? "";
        if (v === toInput(def, row[def.column])) continue;
        const col = toColumn(def, v);
        update[def.column] = col;
        ghlFields.push({ id: def.ghlId, fieldValue: col == null ? "" : String(col) });
      }
      if (Object.keys(update).length === 0) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("pipeline_items").update(update as any).eq("id", itemId);
      if (error) throw error;
      let ghlNote = "";
      if (ghlOpportunityId) {
        try {
          await ghlUpdateOpportunity(ghlOpportunityId, { customFields: ghlFields });
        } catch {
          ghlNote = " Saved in the dialer, but GHL didn't take it. Try again shortly.";
        }
      }
      qc.invalidateQueries({ queryKey: ["opportunity-details", itemId] });
      if (ghlNote) toast.warning(`Opportunity details saved.${ghlNote}`);
      else toast.success(ghlOpportunityId ? "Opportunity details saved to the dialer and GHL." : "Opportunity details saved. No GHL opportunity is linked yet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the opportunity details.");
    } finally {
      setSaving(false);
    }
  };

  const set = (column: string, v: string) => setValues((prev) => ({ ...prev, [column]: v }));

  return (
    <div className="rounded-md border border-dashed border-border p-3">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Opportunity Details</span>
          <span className={cn("rounded-sm px-1 font-mono text-[9px]", filled > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {filled}/{OPPORTUNITY_FIELDS.length}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {OPPORTUNITY_FIELDS.map((def) => (
                <label key={def.column} className="space-y-1">
                  <span className="block text-xs text-muted-foreground">{def.label}</span>
                  {def.kind === "select" ? (
                    <Select value={values[def.column] || CLEAR} onValueChange={(v) => set(def.column, v === CLEAR ? "" : v)}>
                      <SelectTrigger className="h-8 bg-background text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CLEAR} className="text-xs text-muted-foreground">— Clear —</SelectItem>
                        {(values[def.column] && !def.options?.includes(values[def.column]) ? [values[def.column], ...(def.options ?? [])] : def.options ?? []).map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={def.kind === "date" ? "date" : def.kind === "text" ? "text" : "number"}
                      inputMode={def.kind === "money" || def.kind === "number" ? "decimal" : undefined}
                      placeholder={def.kind === "money" ? "$" : undefined}
                      value={values[def.column] ?? ""}
                      onChange={(e) => set(def.column, e.target.value)}
                      className="h-8 bg-background text-sm"
                    />
                  )}
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {ghlOpportunityId ? "Saves to this meeting and its GHL opportunity." : "Saves to this meeting. No GHL opportunity is linked yet."}
            </p>
            <Button type="button" size="sm" variant="secondary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save opportunity details
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
