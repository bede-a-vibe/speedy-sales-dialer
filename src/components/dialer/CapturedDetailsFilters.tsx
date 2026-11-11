import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BUSINESS_SIZES } from "@/data/constants";
import {
  DETAIL_FIELDS,
  DETAIL_GROUPS,
  OP_LABELS,
  controlFor,
  controlOwns,
  countInGroup,
  getTextMode,
  setTextMode,
  type DetailFieldDef,
  type TextMode,
  describeDetailFilter,
  getDetailField,
  getEq,
  getPicked,
  getRange,
  getDateRange,
  setDateRange,
  opNeedsValue,
  opTakesList,
  opsForField,
  sanitizeDetailFilters,
  setEq,
  setPicked,
  setRange,
  type DetailFilter,
  type DetailFilterOp,
  type DetailFilterValue,
} from "@/lib/dialerDetailFilters";
import type { DetailCoverage } from "@/hooks/useDetailCoverage";
import { useSalesReps } from "@/hooks/usePipelineItems";

const HEADCOUNT_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "1", min: 1, max: 1 },
  { label: "2", min: 2, max: 2 },
  { label: "3-4", min: 3, max: 4 },
  { label: "5-10", min: 5, max: 10 },
  { label: "11+", min: 11, max: null },
];

/** Shown in the Team size block at the top, not in the field groups. */
const TEAM_BLOCK_FIELDS = new Set(["business_size", "team_size"]);

/** Filters the panel shows in its own controls; everything else is a listed criterion. */
function isOwnedByPanel(f: DetailFilter, bandInDetails: boolean) {
  if (f.field === "team_size" && (f.op === "gte" || f.op === "lte")) return true;
  if (f.field === "business_size") return bandInDetails && f.op === "eq";
  return controlOwns(f);
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

function parseDecimal(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,6}(\.\d{1,4})?$/.test(t)) return null;
  return Number(t);
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

  // Fields with nothing captured are hidden until asked for, unless one is in use.
  const [showEmpty, setShowEmpty] = useState(false);
  const coverageKnown = coverage != null && coverage.total != null;
  const groupFields = DETAIL_FIELDS.filter((f) => !TEAM_BLOCK_FIELDS.has(f.field));
  const isEmpty = (f: DetailFieldDef) =>
    coverageKnown && (coverage?.[f.field] ?? 0) === 0 && !detailFilters.some((d) => d.field === f.field);
  const hiddenEmpty = groupFields.filter(isEmpty).length;
  const visibleFields = showEmpty ? groupFields : groupFields.filter((f) => !isEmpty(f));

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

      {/* Every captured field, grouped like the Capture details tabs */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {hiddenEmpty > 0 && !showEmpty
            ? `${hiddenEmpty} field${hiddenEmpty === 1 ? "" : "s"} with nothing captured yet are hidden.`
            : "All captured-detail fields."}
        </p>
        {hiddenEmpty > 0 || showEmpty ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowEmpty((v) => !v)}>
            {showEmpty ? "Hide empty fields" : "Show empty fields"}
          </Button>
        ) : null}
      </div>
      <div className="space-y-2">
        {DETAIL_GROUPS.map((group) => {
          const fields = visibleFields.filter((f) => f.group === group);
          if (fields.length === 0) return null;
          return (
            <FieldGroup key={group} title={group} setCount={countInGroup(detailFilters, group)}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((def) => (
                  <FieldFilter
                    key={def.field}
                    def={def}
                    detailFilters={detailFilters}
                    setDetailFilters={setDetailFilters}
                    coverage={coverage}
                    disabled={disabled}
                  />
                ))}
              </div>
            </FieldGroup>
          );
        })}
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
    () => DETAIL_GROUPS.map((g) => ({ group: g, fields: DETAIL_FIELDS.filter((f) => f.group === g) })).filter((g) => g.fields.length > 0),
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
    } else if (def.kind === "int" || def.kind === "num") {
      const n = def.kind === "num" ? parseDecimal(text) : parseWholeNumber(text);
      value = n ?? undefined;
      valid = n !== null;
    } else if (def.kind === "date") {
      value = text.trim();
      valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
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
              type={def.kind === "date" ? "date" : undefined}
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

function FieldGroup({ title, setCount, children }: { title: string; setCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border/60">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted/30"
        >
          <span>
            {title}
            {setCount > 0 ? (
              <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-normal text-primary">
                {setCount} set
              </span>
            ) : null}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface FieldFilterProps {
  def: DetailFieldDef;
  detailFilters: DetailFilter[];
  setDetailFilters: (v: DetailFilter[]) => void;
  coverage?: DetailCoverage;
  disabled: boolean;
}

/** One field's own filter: pick-list, min/max, yes/no, or captured/contains. */
function FieldFilter({ def, detailFilters, setDetailFilters, coverage, disabled }: FieldFilterProps) {
  const control = controlFor(def);
  // Label on top, control pinned to the bottom, so a wrapped label never knocks a row out of line.
  return (
    <div className="flex flex-col justify-between gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {def.label} <CoverageCount field={def.field} coverage={coverage} />
      </label>
      {control === "pick" ? (
        <PickFilter def={def} detailFilters={detailFilters} setDetailFilters={setDetailFilters} disabled={disabled} />
      ) : control === "dates" ? (
        <DateRangeInputs def={def} detailFilters={detailFilters} setDetailFilters={setDetailFilters} disabled={disabled} />
      ) : control === "range" ? (
        <RangeInputs def={def} detailFilters={detailFilters} setDetailFilters={setDetailFilters} disabled={disabled} />
      ) : control === "yesno" ? (
        <Select
          value={(() => {
            const v = detailFilters.find((f) => f.field === def.field && f.op === "eq")?.value;
            return v === true || v === "true" ? "true" : v === false || v === "false" ? "false" : "any";
          })()}
          onValueChange={(v) => setDetailFilters(setEq(detailFilters, def.field, v === "any" ? null : v === "true"))}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 border-border bg-card text-xs" aria-label={def.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any" className="text-xs">Any</SelectItem>
            <SelectItem value="true" className="text-xs">Yes</SelectItem>
            <SelectItem value="false" className="text-xs">No</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <TextFieldFilter def={def} detailFilters={detailFilters} setDetailFilters={setDetailFilters} disabled={disabled} />
      )}
    </div>
  );
}

/** Pick-list: the field's own options, or the sales reps' names for setter and closer. */
function PickFilter({ def, detailFilters, setDetailFilters, disabled }: Omit<FieldFilterProps, "coverage">) {
  const { data: reps = [] } = useSalesReps();
  const options = useMemo(() => {
    if (def.optionsFrom !== "reps") return [...(def.options ?? [])];
    // Same name the server reads: display name, else the email's local part.
    const names = reps.map((r) => r.display_name?.trim() || r.email?.split("@")[0] || "").filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [def.optionsFrom, def.options, reps]);
  return (
    <MultiSelect
      options={options}
      selected={getPicked(detailFilters, def.field)}
      onChange={(values) => setDetailFilters(setPicked(detailFilters, def.field, values))}
      placeholder="Any"
      disabled={disabled}
    />
  );
}

/** From/to dates, by Melbourne date. */
function DateRangeInputs({ def, detailFilters, setDetailFilters, disabled }: Omit<FieldFilterProps, "coverage">) {
  const range = getDateRange(detailFilters, def.field);
  const set = (from: string | null, to: string | null) => setDetailFilters(setDateRange(detailFilters, def.field, { from, to }));
  return (
    <div className="flex items-center gap-1">
      <Input
        type="date"
        aria-label={`${def.label} from`}
        className="h-8 text-xs"
        value={range.from ?? ""}
        onChange={(e) => set(e.target.value || null, range.to)}
        disabled={disabled}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label={`${def.label} to`}
        className="h-8 text-xs"
        value={range.to ?? ""}
        onChange={(e) => set(range.from, e.target.value || null)}
        disabled={disabled}
      />
    </div>
  );
}

function RangeInputs({ def, detailFilters, setDetailFilters, disabled }: Omit<FieldFilterProps, "coverage">) {
  const range = getRange(detailFilters, def.field);
  const set = (min: number | null, max: number | null) => setDetailFilters(setRange(detailFilters, def.field, { min, max }));
  const parse = def.kind === "num" ? parseDecimal : parseWholeNumber;
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={`Minimum ${def.label}`}
        inputMode="numeric"
        placeholder="Min"
        className="h-8 text-xs"
        value={range.min ?? ""}
        onChange={(e) => set(parse(e.target.value), range.max)}
        disabled={disabled}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        aria-label={`Maximum ${def.label}`}
        inputMode="numeric"
        placeholder="Max"
        className="h-8 text-xs"
        value={range.max ?? ""}
        onChange={(e) => set(range.min, parse(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}

/** Free-text fields: any / captured / not captured / contains some text. */
function TextFieldFilter({ def, detailFilters, setDetailFilters, disabled }: Omit<FieldFilterProps, "coverage">) {
  const current = getTextMode(detailFilters, def.field);
  // "Contains" with no text yet lives only here, so picking it doesn't snap back to Any.
  const [draftContains, setDraftContains] = useState(false);
  const [text, setText] = useState(current.text);
  useEffect(() => {
    setText(current.text);
  }, [current.text]);
  useEffect(() => {
    if (current.mode !== "any") setDraftContains(false);
  }, [current.mode]);
  const mode: TextMode = current.mode === "any" && draftContains ? "contains" : current.mode;
  const commit = () => setDetailFilters(setTextMode(detailFilters, def.field, "contains", text));

  return (
    <div className="flex gap-1">
      <Select
        value={mode}
        onValueChange={(v) => {
          const next = v as TextMode;
          setDraftContains(next === "contains");
          setDetailFilters(setTextMode(detailFilters, def.field, next === "contains" ? "any" : next));
          if (next !== "contains") setText("");
        }}
        disabled={disabled}
      >
        <SelectTrigger className={cn("h-8 border-border bg-card text-xs", mode === "contains" ? "w-[110px] shrink-0" : "w-full")} aria-label={def.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any" className="text-xs">Any</SelectItem>
          <SelectItem value="is_set" className="text-xs">Captured</SelectItem>
          <SelectItem value="is_not_set" className="text-xs">Not captured</SelectItem>
          <SelectItem value="contains" className="text-xs">Contains…</SelectItem>
        </SelectContent>
      </Select>
      {mode === "contains" ? (
        <Input
          aria-label={`${def.label} contains`}
          className="h-8 text-xs"
          placeholder="Text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
