import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BUSINESS_SIZES } from "@/data/constants";
import {
  DETAIL_FIELDS,
  OP_LABELS,
  describeDetailFilter,
  getDetailField,
  getEq,
  getPicked,
  getRange,
  opNeedsValue,
  opTakesList,
  opsForField,
  sanitizeDetailFilters,
  setEq,
  setPicked,
  setRange,
  type DetailFieldGroup,
  type DetailFilter,
  type DetailFilterOp,
  type DetailFilterValue,
} from "@/lib/dialerDetailFilters";
import type { DetailCoverage } from "@/hooks/useDetailCoverage";

const HEADCOUNT_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "1", min: 1, max: 1 },
  { label: "2", min: 2, max: 2 },
  { label: "3-4", min: 3, max: 4 },
  { label: "5-10", min: 5, max: 10 },
  { label: "11+", min: 11, max: null },
];

const GROUP_ORDER: DetailFieldGroup[] = ["Team", "Call intel", "Marketing", "Decision maker", "Other"];

const QUICK_FIELDS = DETAIL_FIELDS.filter((f) => f.quick);

/** Filters the panel shows in its own controls; everything else is a listed criterion. */
function isOwnedByPanel(f: DetailFilter, bandInDetails: boolean) {
  if (f.field === "team_size" && (f.op === "gte" || f.op === "lte")) return true;
  if (bandInDetails && f.field === "business_size" && f.op === "eq") return true;
  if (f.op === "in" && QUICK_FIELDS.some((q) => q.field === f.field)) return true;
  return false;
}

function CoverageCount({ field, coverage }: { field: string; coverage?: DetailCoverage }) {
  if (!coverage || coverage.total == null) return null;
  const n = coverage[field] ?? 0;
  return (
    <span className={cn("font-normal", n === 0 ? "text-destructive/80" : "text-muted-foreground/80")}>
      · {n === 0 ? "none captured yet" : `${n.toLocaleString()} captured`}
    </span>
  );
}

function parseWholeNumber(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

interface CapturedDetailsFiltersProps {
  /**
   * The dialer passes its own band state (sent as _business_size). Leave both
   * out and the band is kept as a business_size criterion instead (Contacts).
   */
  businessSize?: string;
  setBusinessSize?: (v: string) => void;
  detailFilters: DetailFilter[];
  setDetailFilters: (v: DetailFilter[]) => void;
  coverage?: DetailCoverage;
  disabled?: boolean;
}

export function CapturedDetailsFilters({
  businessSize,
  setBusinessSize,
  detailFilters,
  setDetailFilters,
  coverage,
  disabled = false,
}: CapturedDetailsFiltersProps) {
  const bandInDetails = setBusinessSize === undefined;
  const band = bandInDetails ? getEq(detailFilters, "business_size") ?? "all" : businessSize ?? "all";
  const pickBand = (next: string) => {
    if (setBusinessSize) setBusinessSize(next);
    else setDetailFilters(setEq(detailFilters, "business_size", next === "all" ? null : next));
  };
  const range = getRange(detailFilters, "team_size");
  const otherCriteria = detailFilters
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => !isOwnedByPanel(f, bandInDetails));

  const setHeadcount = (min: number | null, max: number | null) =>
    setDetailFilters(setRange(detailFilters, "team_size", { min, max }));

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground/80">
        Details reps and the call-transcript backfill have captured. Every criterion must match, and a lead with
        nothing captured for a field drops out once you filter on it.
      </p>

      {/* Team size: band + exact headcount */}
      <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
        <p className="text-xs font-medium text-foreground">
          Team size <CoverageCount field="business_size" coverage={coverage} />
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Team size band">
          {["all", ...BUSINESS_SIZES].map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={band === option ? "default" : "outline"}
              className="h-8 text-xs"
              aria-pressed={band === option}
              onClick={() => pickBand(option)}
              disabled={disabled}
            >
              {option === "all" ? "Any size" : option}
            </Button>
          ))}
        </div>

        <div className="space-y-1 pt-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Headcount incl. owner <CoverageCount field="team_size" coverage={coverage} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {HEADCOUNT_PRESETS.map((p) => {
              const active = range.min === p.min && range.max === p.max;
              return (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  aria-pressed={active}
                  onClick={() => (active ? setHeadcount(null, null) : setHeadcount(p.min, p.max))}
                  disabled={disabled}
                >
                  {p.label}
                </Button>
              );
            })}
            <div className="flex items-center gap-1">
              <Input
                aria-label="Minimum headcount"
                inputMode="numeric"
                placeholder="Min"
                className="h-7 w-16 text-xs"
                value={range.min ?? ""}
                onChange={(e) => setHeadcount(parseWholeNumber(e.target.value), range.max)}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                aria-label="Maximum headcount"
                inputMode="numeric"
                placeholder="Max"
                className="h-7 w-16 text-xs"
                value={range.max ?? ""}
                onChange={(e) => setHeadcount(range.min, parseWholeNumber(e.target.value))}
                disabled={disabled}
              />
            </div>
          </div>
          {range.min !== null && range.max !== null && range.min > range.max ? (
            <p className="text-[10px] text-destructive">Min is above max, so nothing will match.</p>
          ) : range.min !== null || range.max !== null ? (
            <p className="text-[10px] text-muted-foreground">
              Only leads with a stated headcount. Band-only leads are left out.
            </p>
          ) : null}
        </div>
      </div>

      {/* Common captured fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_FIELDS.map((def) => (
          <div key={def.field} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {def.label} <CoverageCount field={def.field} coverage={coverage} />
            </label>
            <MultiSelect
              options={[...(def.options ?? [])]}
              selected={getPicked(detailFilters, def.field)}
              onChange={(values) => setDetailFilters(setPicked(detailFilters, def.field, values))}
              placeholder="Any"
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      {/* Other criteria + builder */}
      <div className="space-y-2">
        {otherCriteria.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {otherCriteria.map(({ f, index }) => (
              <span
                key={`${f.field}-${f.op}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-foreground"
              >
                {describeDetailFilter(f)}
                <button
                  type="button"
                  onClick={() => setDetailFilters(detailFilters.filter((_, i) => i !== index))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${describeDetailFilter(f)}`}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <CriterionBuilder
          coverage={coverage}
          disabled={disabled}
          onAdd={(f) => setDetailFilters(sanitizeDetailFilters([...detailFilters, f]))}
        />
      </div>
    </div>
  );
}

function CriterionBuilder({
  coverage,
  disabled,
  onAdd,
}: {
  coverage?: DetailCoverage;
  disabled: boolean;
  onAdd: (f: DetailFilter) => void;
}) {
  const [field, setField] = useState<string>("");
  const [op, setOp] = useState<DetailFilterOp | "">("");
  const [text, setText] = useState("");
  const [picked, setPickedValues] = useState<string[]>([]);

  const def = field ? getDetailField(field) : undefined;
  const ops = field ? opsForField(field) : [];
  const grouped = useMemo(
    () => GROUP_ORDER.map((g) => ({ group: g, fields: DETAIL_FIELDS.filter((f) => f.group === g) })).filter((g) => g.fields.length > 0),
    [],
  );

  const pickField = (next: string) => {
    setField(next);
    setOp(opsForField(next)[0] ?? "");
    setText("");
    setPickedValues([]);
  };

  let value: DetailFilterValue | undefined;
  let valid = Boolean(def && op);
  if (def && op && opNeedsValue(op)) {
    if (opTakesList(op)) {
      const list = def.options ? picked : text.split(",").map((s) => s.trim()).filter(Boolean);
      value = def.kind === "int" ? list.map((s) => parseWholeNumber(s)).filter((n): n is number => n !== null) : list;
      valid = (value as unknown[]).length > 0;
    } else if (def.kind === "int") {
      const n = parseWholeNumber(text);
      value = n ?? undefined;
      valid = n !== null;
    } else if (def.kind === "bool") {
      value = text === "true";
      valid = text === "true" || text === "false";
    } else {
      value = text.trim();
      valid = value.length > 0;
    }
  }

  const add = () => {
    if (!def || !op || !valid) return;
    onAdd(opNeedsValue(op) ? { field: def.field, op, value } : { field: def.field, op });
    setText("");
    setPickedValues([]);
  };

  const showOptionSelect = def && op && def.options && !opTakesList(op) && op !== "contains" && def.kind !== "int";

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-2">
      <div className="min-w-[180px] flex-1 space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Add criterion</label>
        <Select value={field} onValueChange={pickField} disabled={disabled}>
          <SelectTrigger className="h-8 border-border bg-card text-xs" aria-label="Criterion field">
            <SelectValue placeholder="Pick a captured detail…" />
          </SelectTrigger>
          <SelectContent>
            {grouped.map(({ group, fields }) => (
              <SelectGroup key={group}>
                <SelectLabel className="text-[10px] uppercase tracking-wide">{group}</SelectLabel>
                {fields.map((f) => (
                  <SelectItem key={f.field} value={f.field} className="text-xs">
                    {f.label}
                    {coverage && coverage.total != null ? (
                      <span className="ml-1 text-muted-foreground">({(coverage[f.field] ?? 0).toLocaleString()})</span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {def ? (
        <div className="w-[170px] space-y-1">
          <label className="sr-only">Operator</label>
          <Select value={op} onValueChange={(v) => setOp(v as DetailFilterOp)} disabled={disabled}>
            <SelectTrigger className="h-8 border-border bg-card text-xs" aria-label="Criterion operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ops.map((o) => (
                <SelectItem key={o} value={o} className="text-xs">
                  {OP_LABELS[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {def && op && opNeedsValue(op) ? (
        <div className="min-w-[160px] flex-1 space-y-1">
          {def.kind === "bool" ? (
            <Select value={text} onValueChange={setText} disabled={disabled}>
              <SelectTrigger className="h-8 border-border bg-card text-xs" aria-label="Criterion value">
                <SelectValue placeholder="Yes or no" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true" className="text-xs">Yes</SelectItem>
                <SelectItem value="false" className="text-xs">No</SelectItem>
              </SelectContent>
            </Select>
          ) : opTakesList(op) && def.options ? (
            <MultiSelect options={[...def.options]} selected={picked} onChange={setPickedValues} placeholder="Pick values" disabled={disabled} />
          ) : showOptionSelect ? (
            <Select value={text} onValueChange={setText} disabled={disabled}>
              <SelectTrigger className="h-8 border-border bg-card text-xs" aria-label="Criterion value">
                <SelectValue placeholder="Pick a value" />
              </SelectTrigger>
              <SelectContent>
                {def.options!.map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              aria-label="Criterion value"
              className="h-8 text-xs"
              inputMode={def.kind === "int" ? "numeric" : undefined}
              placeholder={def.kind === "int" ? "Number" : opTakesList(op) ? "Values, comma separated" : "Text"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              disabled={disabled}
            />
          )}
        </div>
      ) : null}

      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={add} disabled={disabled || !valid}>
        <Plus className="mr-1 h-3 w-3" />
        Add
      </Button>
    </div>
  );
}
