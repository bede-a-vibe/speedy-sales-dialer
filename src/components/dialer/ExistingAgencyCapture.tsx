import { useEffect, useState } from "react";
import { Building2, Loader2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AGENCY_SERVICES } from "@/data/constants";
import { useUpdateContact } from "@/hooks/useContacts";
import { cn } from "@/lib/utils";

interface ExistingAgencyCaptureProps {
  contactId: string;
  hasExistingAgency: boolean | null;
  existingAgencyName: string | null;
  existingAgencyServices: string[];
  existingAgencyNotes: string | null;
}

/**
 * Capture whether a prospect already has an agency and which services they buy.
 * Prospects with an existing agency are typically higher-intent — they've
 * already accepted that marketing spend is worth it — so reps should be able
 * to filter for them from the dialer.
 */
export function ExistingAgencyCapture({
  contactId,
  hasExistingAgency,
  existingAgencyName,
  existingAgencyServices,
  existingAgencyNotes,
}: ExistingAgencyCaptureProps) {
  const updateContact = useUpdateContact();
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [hasAgency, setHasAgency] = useState<"unknown" | "yes" | "no">(
    hasExistingAgency === true ? "yes" : hasExistingAgency === false ? "no" : "unknown",
  );
  const [agencyName, setAgencyName] = useState(existingAgencyName ?? "");
  const [services, setServices] = useState<string[]>(existingAgencyServices ?? []);
  const [notes, setNotes] = useState(existingAgencyNotes ?? "");

  // Sync when the active contact changes
  useEffect(() => {
    setHasAgency(hasExistingAgency === true ? "yes" : hasExistingAgency === false ? "no" : "unknown");
    setAgencyName(existingAgencyName ?? "");
    setServices(existingAgencyServices ?? []);
    setNotes(existingAgencyNotes ?? "");
  }, [contactId, hasExistingAgency, existingAgencyName, existingAgencyServices, existingAgencyNotes]);

  const persist = async (patch: Record<string, unknown>, label: string) => {
    setSaving(label);
    try {
      await updateContact.mutateAsync({ id: contactId, ...patch });
      setSavedAt(Date.now());
    } finally {
      setSaving(null);
    }
  };

  const toggleService = (val: string) => {
    const next = services.includes(val) ? services.filter((s) => s !== val) : [...services, val];
    setServices(next);
    void persist({ existing_agency_services: next }, "services");
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Existing Agency</span>
        </div>
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving {saving}
          </span>
        ) : savedAt ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-primary">
            <Check className="h-2.5 w-2.5" /> Saved
          </span>
        ) : null}
      </div>

      <p className="text-[11px] leading-tight text-muted-foreground">
        Prospects already paying an agency are actively investing in growth — higher intent for us.
      </p>

      <div className="flex gap-2">
        {(["yes", "no", "unknown"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setHasAgency(opt);
              void persist(
                {
                  has_existing_agency: opt === "yes" ? true : opt === "no" ? false : null,
                  ...(opt !== "yes" ? { existing_agency_services: [], existing_agency_name: null } : {}),
                },
                "agency status",
              );
            }}
            className={cn(
              "flex-1 rounded border px-2 py-1.5 text-xs font-medium capitalize transition-colors",
              hasAgency === opt
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
            )}
          >
            {opt === "unknown" ? "Not sure" : opt === "yes" ? "Yes, has agency" : "No agency"}
          </button>
        ))}
      </div>

      {hasAgency === "yes" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Services they're buying
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {AGENCY_SERVICES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleService(s.value)}
                  className={cn(
                    "rounded border px-2 py-1.5 text-left text-xs transition-colors",
                    services.includes(s.value)
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Agency name
            </label>
            <Input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              onBlur={() => persist({ existing_agency_name: agencyName || null }, "agency name")}
              placeholder="e.g. King Kong, WebFX"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Notes (spend, contract, pain points)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => persist({ existing_agency_notes: notes || null }, "agency notes")}
              placeholder="e.g. $3k/mo, unhappy with reporting, contract ends Aug"
              className="min-h-[60px] text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ExistingAgencyCapture;