import { useMemo } from "react";
import { Brain, Check, CircleDashed, Loader2, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GHL_FIELD_FOLDERS, type GhlFieldDef, type GhlFieldFolder } from "@/lib/ghlFieldFolders";
import { useGHLFieldSchema, type GhlCustomFieldSchema } from "@/hooks/useGHLFieldSchema";
import { useGHLContactFields, type FieldSaveStatus } from "@/hooks/useGHLContactFields";
import { cn } from "@/lib/utils";

interface ContactIntelligencePanelProps {
  contactId: string;
  ghlContactId?: string | null;
  /** Snapshot of the supabase contact row for hydration. */
  contact: Record<string, unknown>;
}

/**
 * Build the initial field values map by reading any mirrored Supabase columns
 * off the contact row. Non-mirrored fields will be filled later by the GHL
 * fetch inside `useGHLContactFields`.
 */
function buildInitialValues(contact: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const folder of GHL_FIELD_FOLDERS) {
    for (const def of folder.fields) {
      if (def.supabaseColumn && contact[def.supabaseColumn] !== undefined) {
        out[def.key] = contact[def.supabaseColumn];
      }
    }
  }
  return out;
}

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatRelative(ts: number | null): string {
  if (!ts) return "Not yet saved";
  const diff = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const min = Math.round(diff / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function StatusPill({ status }: { status: FieldSaveStatus | undefined }) {
  if (!status || status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-primary">
        <Check className="h-2.5 w-2.5" /> Synced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
      <AlertTriangle className="h-2.5 w-2.5" /> Will retry
    </span>
  );
}

interface FieldRowProps {
  def: GhlFieldDef;
  schema: GhlCustomFieldSchema | undefined;
  value: unknown;
  status: FieldSaveStatus | undefined;
  onChange: (next: unknown) => void;
}

function FieldRow({ def, schema, value, status, onChange }: FieldRowProps) {
  const dataType = schema?.dataType ?? "TEXT";
  const picklist = schema?.picklistOptions ?? [];
  const stringValue = value == null ? "" : String(value);

  const renderControl = () => {
    // Per-folder UI override wins.
    if (def.ui === "textarea" || dataType === "LARGE_TEXT") {
      return (
        <Textarea
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          rows={3}
          className="text-sm"
        />
      );
    }
    if (def.ui === "number" || dataType === "NUMERICAL" || dataType === "MONETORY") {
      return (
        <Input
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          className="h-8 text-sm"
        />
      );
    }
    if (def.ui === "date" || dataType === "DATE") {
      // Local datetime-input — small and fast for in-call use.
      const dateValue = (() => {
        if (!stringValue) return "";
        try {
          const d = new Date(stringValue);
          if (Number.isNaN(d.getTime())) return "";
          return d.toISOString().slice(0, 10);
        } catch {
          return "";
        }
      })();
      return (
        <Input
          type="date"
          value={dateValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      );
    }
    if ((dataType === "DROPDOWN" || dataType === "RADIO" || dataType === "SINGLE_OPTIONS") && picklist.length > 0) {
      return (
        <Select value={stringValue || "__unset__"} onValueChange={(v) => onChange(v === "__unset__" ? "" : v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={def.placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unset__" className="text-xs text-muted-foreground">
              — Clear —
            </SelectItem>
            {picklist.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        className="h-8 text-sm"
      />
    );
  };

  return (
    <div className={cn("flex flex-col gap-1", def.fullWidth && "md:col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] font-medium text-muted-foreground">{def.label}</Label>
        <StatusPill status={status} />
      </div>
      {renderControl()}
    </div>
  );
}

function FolderTabContent({
  folder,
  values,
  statuses,
  schemaByKey,
  onChange,
}: {
  folder: GhlFieldFolder;
  values: Record<string, unknown>;
  statuses: Record<string, FieldSaveStatus>;
  schemaByKey: Record<string, GhlCustomFieldSchema>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {folder.fields.map((def) => (
        <FieldRow
          key={def.key}
          def={def}
          schema={schemaByKey[def.key]}
          value={values[def.key]}
          status={statuses[def.key]}
          onChange={(v) => onChange(def.key, v)}
        />
      ))}
    </div>
  );
}

/**
 * Live GHL custom-fields panel for the active call. Renders one tab per
 * GHL folder, debounces saves to Supabase + GHL, and shows per-field status.
 */
export function ContactIntelligencePanel({ contactId, ghlContactId, contact }: ContactIntelligencePanelProps) {
  const initialValues = useMemo(() => buildInitialValues(contact), [contact]);
  const schemaQuery = useGHLFieldSchema();
  const schemaByKey = schemaQuery.data?.byKey ?? {};

  const { values, statuses, lastSavedAt, setField, isLoadingRemote } = useGHLContactFields({
    contactId,
    ghlContactId,
    initialValues,
  });

  const fillCounts = useMemo(() => {
    const counts: Record<string, { filled: number; total: number }> = {};
    for (const folder of GHL_FIELD_FOLDERS) {
      const total = folder.fields.length;
      const filled = folder.fields.filter((f) => isFilled(values[f.key])).length;
      counts[folder.id] = { filled, total };
    }
    return counts;
  }, [values]);

  const totalFilled = Object.values(fillCounts).reduce((acc, c) => acc + c.filled, 0);
  const totalFields = Object.values(fillCounts).reduce((acc, c) => acc + c.total, 0);
  const hasError = Object.values(statuses).some((s) => s === "error");

  const defaultTab = GHL_FIELD_FOLDERS[0]?.id ?? "qualification";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">{totalFilled}/{totalFields} fields filled</span>
          {isLoadingRemote ? (
            <span className="inline-flex items-center gap-1 text-[10px]">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading from GHL
            </span>
          ) : null}
        </div>
        {!ghlContactId ? (
          <Badge variant="outline" className="text-[10px]">No GHL link · saving locally</Badge>
        ) : hasError ? (
          <Badge variant="destructive" className="text-[10px]">Some fields will retry</Badge>
        ) : (
          <span className="text-[10px]">Last saved {formatRelative(lastSavedAt)}</span>
        )}
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {GHL_FIELD_FOLDERS.map((folder) => {
            const count = fillCounts[folder.id];
            return (
              <TabsTrigger
                key={folder.id}
                value={folder.id}
                className="flex h-7 items-center gap-1.5 px-2 text-[11px]"
              >
                <span>{folder.shortLabel ?? folder.label}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-sm px-1 text-[9px] font-mono",
                    count.filled > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count.filled === 0 ? <CircleDashed className="h-2 w-2" /> : null}
                  {count.filled}/{count.total}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {GHL_FIELD_FOLDERS.map((folder) => (
          <TabsContent key={folder.id} value={folder.id} className="mt-3">
            {folder.description ? (
              <p className="mb-3 text-[11px] text-muted-foreground">{folder.description}</p>
            ) : null}
            <FolderTabContent
              folder={folder}
              values={values}
              statuses={statuses}
              schemaByKey={schemaByKey}
              onChange={setField}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}