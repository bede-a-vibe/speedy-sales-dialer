import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, ChevronDown, ChevronUp, Phone, Mail, Linkedin, Save, Shield, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ghlUpdateContactFields } from "@/lib/ghl";
import { toast } from "sonner";

interface DecisionMakerCaptureProps {
  contactId: string;
  businessName: string;
  ghlContactId?: string | null;
  // Existing DM data (pre-populated if available)
  existingDmName?: string | null;
  existingDmTitle?: string | null;
  existingDmPhone?: string | null;
  existingDmEmail?: string | null;
  existingDmLinkedin?: string | null;
  existingGatekeeperName?: string | null;
  existingGatekeeperNotes?: string | null;
  existingBestRouteToDecisionMaker?: string | null;
  existingBestTimeToCall?: string | null;
  onSaved?: () => void;
}

// GHL field keys for DM/gatekeeper data
const GHL_DM_FIELD_MAP: Record<string, string> = {
  dm_name: "contact.decision_maker_name",
  dm_phone: "contact.decision_maker_direct_line",
  dm_email: "contact.decision_maker_email",
  dm_linkedin: "contact.decision_maker_linkedin",
  gatekeeper_name: "contact.gatekeeper_name",
  gatekeeper_notes: "contact.gatekeeper_notes",
  best_route_to_dm: "contact.best_route_to_dm",
};

const DM_TITLE_OPTIONS = [
  "Owner",
  "Director",
  "General Manager",
  "Marketing Manager",
  "Operations Manager",
  "Office Manager",
  "Partner",
  "Other",
];

const ROUTE_OPTIONS = [
  "Direct Line",
  "Mobile",
  "Email First",
  "LinkedIn",
  "Ask for by Name",
  "Callback Scheduled",
  "Gatekeeper Friendly",
  "Other",
];

const TIME_TO_CALL_OPTIONS = [
  "Morning",
  "Afternoon",
  "After Hours",
];

export function DecisionMakerCapture({
  contactId,
  businessName,
  ghlContactId,
  existingDmName,
  existingDmTitle,
  existingDmPhone,
  existingDmEmail,
  existingDmLinkedin,
  existingGatekeeperName,
  existingGatekeeperNotes,
  existingBestRouteToDecisionMaker,
  existingBestTimeToCall,
  onSaved,
}: DecisionMakerCaptureProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // DM fields
  const [dmName, setDmName] = useState(existingDmName || "");
  const [dmTitle, setDmTitle] = useState(existingDmTitle || "");
  const [dmPhone, setDmPhone] = useState(existingDmPhone || "");
  const [dmEmail, setDmEmail] = useState(existingDmEmail || "");
  const [dmLinkedin, setDmLinkedin] = useState(existingDmLinkedin || "");

  // Gatekeeper fields
  const [gatekeeperName, setGatekeeperName] = useState(existingGatekeeperName || "");
  const [gatekeeperNotes, setGatekeeperNotes] = useState(existingGatekeeperNotes || "");
  const [bestRoute, setBestRoute] = useState(existingBestRouteToDecisionMaker || "");
  const [bestTimeToCall, setBestTimeToCall] = useState(existingBestTimeToCall || "");

  const hasDmData = !!(existingDmName || existingDmPhone);
  const hasGatekeeperData = !!existingGatekeeperName;

  const handleSave = useCallback(async () => {
    if (!dmName.trim() && !gatekeeperName.trim()) {
      toast.error("Please enter at least a decision maker name or gatekeeper name.");
      return;
    }

    setIsSaving(true);
    try {
      const updates: Record<string, string | null> = {};

      // DM fields
      if (dmName.trim()) updates.dm_name = dmName.trim();
      if (dmTitle) updates.dm_role = dmTitle;
      if (dmPhone.trim()) {
        updates.dm_phone = dmPhone.trim();
      }
      if (dmEmail.trim()) updates.dm_email = dmEmail.trim();

      // Gatekeeper fields
      if (gatekeeperName.trim()) updates.gatekeeper_name = gatekeeperName.trim();
      if (bestRoute) updates.best_route_to_decision_maker = bestRoute;
      if (bestTimeToCall) (updates as any).best_time_to_call = bestTimeToCall;

      const { error } = await supabase
        .from("contacts")
        .update(updates as any)
        .eq("id", contactId);

      if (error) throw error;

      // Push to GHL if contact is linked
      if (ghlContactId) {
        try {
          const ghlFields: Record<string, string> = {};
          if (dmName.trim()) ghlFields["contact.decision_maker_name"] = dmName.trim();
          if (dmPhone.trim()) ghlFields["contact.decision_maker_direct_line"] = dmPhone.trim();
          if (dmEmail.trim()) ghlFields["contact.decision_maker_email"] = dmEmail.trim();
          if (dmLinkedin.trim()) ghlFields["contact.decision_maker_linkedin"] = dmLinkedin.trim();
          if (gatekeeperName.trim()) ghlFields["contact.gatekeeper_name"] = gatekeeperName.trim();
          if (gatekeeperNotes.trim()) ghlFields["contact.gatekeeper_notes"] = gatekeeperNotes.trim();
          if (bestRoute) ghlFields["contact.best_route_to_dm"] = bestRoute;
          if (bestTimeToCall) ghlFields["contact.best_time_to_call"] = bestTimeToCall;

          if (Object.keys(ghlFields).length > 0) {
            await ghlUpdateContactFields(ghlContactId, ghlFields);
          }
        } catch (ghlError) {
          console.warn("[DM Capture] GHL sync failed (non-blocking):", ghlError);
        }
      }

      toast.success("Decision maker details saved.");
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save decision maker details.");
    } finally {
      setIsSaving(false);
    }
  }, [contactId, dmName, dmTitle, dmPhone, dmEmail, dmLinkedin, gatekeeperName, gatekeeperNotes, bestRoute, bestTimeToCall, ghlContactId, onSaved]);

  return (
    <Card className="border-border bg-card/50">
      <CardHeader
        className="cursor-pointer select-none px-4 py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" />
            Decision Maker
            {hasDmData && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                {existingDmName}
              </span>
            )}
            {!hasDmData && hasGatekeeperData && (
              <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-400">
                Gatekeeper only
              </span>
            )}
          </CardTitle>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 px-4 pb-4 pt-0">
          {/* Decision Maker Section */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Owner / Marketing Manager
            </h4>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Name</label>
                <Input
                  value={dmName}
                  onChange={(e) => setDmName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Title / Role</label>
                <Select value={dmTitle} onValueChange={setDmTitle}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {DM_TITLE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" /> Direct Mobile
                </label>
                <Input
                  value={dmPhone}
                  onChange={(e) => setDmPhone(e.target.value)}
                  placeholder="04XX XXX XXX"
                  className="h-8 text-xs"
                  type="tel"
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> Email
                </label>
                <Input
                  value={dmEmail}
                  onChange={(e) => setDmEmail(e.target.value)}
                  placeholder="john@business.com.au"
                  className="h-8 text-xs"
                  type="email"
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </label>
                <Input
                  value={dmLinkedin}
                  onChange={(e) => setDmLinkedin(e.target.value)}
                  placeholder="linkedin.com/in/..."
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Gatekeeper Section */}
          <div className="space-y-3 border-t border-border pt-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Gatekeeper Intel
            </h4>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Gatekeeper Name</label>
                <Input
                  value={gatekeeperName}
                  onChange={(e) => setGatekeeperName(e.target.value)}
                  placeholder="e.g. Sarah (receptionist)"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Best Route to DM</label>
                <Select value={bestRoute} onValueChange={setBestRoute}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Gatekeeper Notes</label>
              <Textarea
                value={gatekeeperNotes}
                onChange={(e) => setGatekeeperNotes(e.target.value)}
                placeholder="e.g. Friendly, ask for John by name, best to call before 9am..."
                className="min-h-[60px] text-xs"
                rows={2}
              />
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="w-full"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Decision Maker Details"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
