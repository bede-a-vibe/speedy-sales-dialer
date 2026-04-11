import { Phone, Mail, Globe, MapPin, ExternalLink, User, MessageSquareText, Shield, UserCheck, Clock, Smartphone, Landmark, Building2, AlertTriangle, PhoneOff, ArrowRight, Info, CheckCircle2, CircleDashed } from "lucide-react";

const PHONE_QUALITY_CONFIG: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  confirmed: { label: "Confirmed", color: "text-green-400 bg-green-500/15 border-green-500/30", icon: Phone },
  unconfirmed: { label: "Unconfirmed", color: "text-muted-foreground bg-accent border-border", icon: Phone },
  suspect: { label: "Suspect", color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", icon: AlertTriangle },
  dead: { label: "Dead", color: "text-red-400 bg-red-500/15 border-red-500/30", icon: PhoneOff },
};

const PHONE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  mobile: { label: "Mobile", color: "text-green-400 bg-green-500/15 border-green-500/30", icon: Smartphone },
  landline: { label: "Landline", color: "text-orange-400 bg-orange-500/15 border-orange-500/30", icon: Landmark },
  business_line: { label: "Business", color: "text-blue-400 bg-blue-500/15 border-blue-500/30", icon: Building2 },
  unknown: { label: "Unknown", color: "text-muted-foreground bg-accent border-border", icon: Phone },
};

interface ContactCardProps {
  contact: {
    business_name: string;
    contact_person: string | null;
    phone: string;
    phone_type?: string | null;
    email: string | null;
    website: string | null;
    gmb_link: string | null;
    industry: string;
    city: string | null;
    state: string | null;
    follow_up_note?: string | null;
    dm_name?: string | null;
    dm_role?: string | null;
    dm_title?: string | null;
    dm_phone?: string | null;
    dm_phone_type?: string | null;
    dm_email?: string | null;
    gatekeeper_name?: string | null;
    gatekeeper_notes?: string | null;
    best_route_to_decision_maker?: string | null;
    best_route_to_dm?: string | null;
    best_time_to_call?: string | null;
    phone_number_quality?: string | null;
    call_attempt_count?: number | null;
    voicemail_count?: number | null;
  };
  onMarkPhoneQuality?: (quality: string) => void;
  onAddDM?: () => void;
  onCallDM?: (phone: string) => void;
}

export function ContactCard({ contact, onAddDM, onCallDM, onMarkPhoneQuality }: ContactCardProps) {
  const phoneType = PHONE_TYPE_CONFIG[contact.phone_type || "unknown"] || PHONE_TYPE_CONFIG.unknown;
  const PhoneIcon = phoneType.icon;
  const hasDM = contact.dm_name || contact.dm_phone;
  const dmPhoneType = contact.dm_phone_type ? PHONE_TYPE_CONFIG[contact.dm_phone_type] : null;
  const bestRouteToDecisionMaker = contact.best_route_to_decision_maker || contact.best_route_to_dm;
  const decisionMakerRole = contact.dm_role || contact.dm_title;
  const isBusinessRoutedNumber = contact.phone_type === "landline" || contact.phone_type === "business_line";
  const dialStrategyLabel = contact.dm_phone
    ? "Best route"
    : isBusinessRoutedNumber
      ? "Switchboard route"
      : "Primary route";
  const dialStrategySummary = contact.dm_phone
    ? `Call the decision maker direct on ${contact.dm_phone}.`
    : isBusinessRoutedNumber
      ? contact.gatekeeper_name
        ? `Main line likely routes through ${contact.gatekeeper_name}.`
        : "Main line likely routes through reception or a gatekeeper."
      : "This looks like a direct number, so start here.";
  const businessLineWorkflowItems = isBusinessRoutedNumber
    ? [
        {
          label: "Number type",
          value: phoneType.label,
          complete: true,
        },
        {
          label: "Decision maker direct line",
          value: contact.dm_phone ? contact.dm_phone : "Still needed",
          complete: Boolean(contact.dm_phone),
        },
        {
          label: "Gatekeeper context",
          value: contact.gatekeeper_name ? contact.gatekeeper_name : "Not captured",
          complete: Boolean(contact.gatekeeper_name),
        },
        {
          label: "Routing guidance",
          value: bestRouteToDecisionMaker ? bestRouteToDecisionMaker : "Ask how to reach the right person fastest",
          complete: Boolean(bestRouteToDecisionMaker),
        },
      ]
    : [];

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      {/* Follow-up Note Banner */}
      {contact.follow_up_note && (
        <div className="flex items-start gap-2.5 bg-amber-500/15 border border-amber-500/30 rounded-md px-3.5 py-2.5 text-amber-200">
          <MessageSquareText className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="text-[10px] uppercase tracking-widest font-mono text-amber-400 mb-0.5">Follow-up Note</p>
            <p className="text-sm leading-snug">{contact.follow_up_note}</p>
          </div>
        </div>
      )}

      {/* Gatekeeper Warning Banner */}
      {contact.gatekeeper_name && isBusinessRoutedNumber && (
        <div className="flex items-start gap-2.5 bg-orange-500/15 border border-orange-500/30 rounded-md px-3.5 py-2.5 text-orange-200">
          <Shield className="h-4 w-4 mt-0.5 shrink-0 text-orange-400" />
          <div>
            <p className="text-[10px] uppercase tracking-widest font-mono text-orange-400 mb-0.5">Gatekeeper</p>
            <p className="text-sm leading-snug">
              <span className="font-semibold">{contact.gatekeeper_name}</span>
              {bestRouteToDecisionMaker && (
                <span className="ml-2 text-orange-300/70">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Route: {bestRouteToDecisionMaker}
                </span>
              )}
            </p>
            {contact.gatekeeper_notes && (
              <p className="mt-1 text-xs leading-snug text-orange-100/85">{contact.gatekeeper_notes}</p>
            )}
          </div>
        </div>
      )}

      {/* Business Name & Industry */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{contact.business_name}</h3>
          {contact.contact_person && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <User className="h-3.5 w-3.5" />
              {contact.contact_person}
            </p>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-widest font-mono bg-accent text-accent-foreground px-2 py-1 rounded">
          {contact.industry}
        </span>
      </div>

      {/* Business Phone with Type Badge */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <a
            href={`tel:${contact.phone}`}
            className="flex-1 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2.5 text-primary hover:bg-primary/20 transition-colors group"
          >
            <PhoneIcon className="h-4 w-4 group-hover:animate-pulse" />
            <span className="font-mono text-sm font-semibold">{contact.phone}</span>
          </a>
          <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1.5 rounded border ${phoneType.color}`}>
            {phoneType.label}
          </span>
        </div>

        {/* Call Stats & Phone Quality */}
        <div className="flex items-center gap-2 text-xs">
          {(contact.call_attempt_count ?? 0) > 0 && (
            <span className="font-mono text-muted-foreground bg-accent px-2 py-1 rounded border border-border">
              {contact.call_attempt_count} attempt{(contact.call_attempt_count ?? 0) !== 1 ? 's' : ''}
            </span>
          )}
          {(contact.voicemail_count ?? 0) > 0 && (
            <span className="font-mono text-amber-400 bg-amber-500/15 px-2 py-1 rounded border border-amber-500/30">
              {contact.voicemail_count} VM{(contact.voicemail_count ?? 0) !== 1 ? 's' : ''}
            </span>
          )}
          {onMarkPhoneQuality && (
            <div className="flex items-center gap-1 ml-auto">
              {['confirmed', 'suspect', 'dead'].map((q) => {
                const cfg = PHONE_QUALITY_CONFIG[q];
                const QIcon = cfg.icon;
                const isActive = contact.phone_number_quality === q;
                return (
                  <button
                    key={q}
                    onClick={() => onMarkPhoneQuality(q)}
                    title={`Mark as ${cfg.label}`}
                    className={`p-1 rounded border transition-colors ${
                      isActive ? cfg.color + ' ring-1 ring-offset-1 ring-offset-background' : 'text-muted-foreground/50 bg-transparent border-transparent hover:' + cfg.color
                    }`}
                  >
                    <QIcon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dial Strategy */}
      <div className="rounded-md border border-border bg-background/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">{dialStrategyLabel}</p>
        </div>
        <p className="text-sm text-foreground">{dialStrategySummary}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {bestRouteToDecisionMaker && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1">
              <ArrowRight className="h-3 w-3" /> Route: {bestRouteToDecisionMaker}
            </span>
          )}
          {contact.best_time_to_call && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1">
              <Clock className="h-3 w-3" /> Best time: {contact.best_time_to_call}
            </span>
          )}
        </div>
      </div>

      {isBusinessRoutedNumber && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-300" />
            <p className="text-[10px] uppercase tracking-widest font-mono text-sky-300">Business Line Workflow</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {businessLineWorkflowItems.map((item) => {
              const StatusIcon = item.complete ? CheckCircle2 : CircleDashed;
              return (
                <div key={item.label} className="rounded-md border border-sky-500/20 bg-background/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-sky-200/80">
                    <StatusIcon className={`h-3.5 w-3.5 ${item.complete ? 'text-green-400' : 'text-sky-300/70'}`} />
                    {item.label}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{item.value}</p>
                </div>
              );
            })}
          </div>
          {!contact.dm_phone && (
            <p className="text-xs text-sky-100/85">
              Best next step: use this call to confirm the correct decision maker and capture a direct mobile or extension before requeueing.
            </p>
          )}
        </div>
      )}

      {/* Decision Maker Section */}
      {hasDM ? (
        <div className="bg-green-500/10 border border-green-500/25 rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-green-400" />
            <p className="text-[10px] uppercase tracking-widest font-mono text-green-400">Decision Maker</p>
          </div>
          <div className="space-y-1.5">
            {contact.dm_name && (
              <p className="text-sm font-semibold text-foreground">
                {contact.dm_name}
                {decisionMakerRole && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({decisionMakerRole})</span>
                )}
              </p>
            )}
            {contact.dm_phone && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onCallDM?.(contact.dm_phone!)}
                  className="flex items-center gap-2 bg-green-500/20 border border-green-500/30 rounded-md px-3 py-1.5 text-green-300 hover:bg-green-500/30 transition-colors text-sm font-mono"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  {contact.dm_phone}
                </button>
                {dmPhoneType && (
                  <span className={`text-[9px] uppercase tracking-widest font-mono px-1.5 py-1 rounded border ${dmPhoneType.color}`}>
                    {dmPhoneType.label}
                  </span>
                )}
              </div>
            )}
            {contact.dm_email && (
              <a
                href={`mailto:${contact.dm_email}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                {contact.dm_email}
              </a>
            )}
          </div>
        </div>
      ) : (
        contact.phone_type === "landline" || contact.phone_type === "business_line" ? (
          <button
            onClick={onAddDM}
            className="w-full flex items-center justify-center gap-2 bg-secondary/50 border border-dashed border-border rounded-md px-3 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-sm"
          >
            <UserCheck className="h-4 w-4" />
            Add Decision Maker Details
          </button>
        ) : null
      )}

      {/* Contact Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`mailto:${contact.email}`}
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Mail className="h-4 w-4" />
          <span className="text-sm truncate">{contact.email || "No email"}</span>
        </a>

        <a
          href={contact.website || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Globe className="h-4 w-4" />
          <span className="text-sm truncate">Website</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>

        <a
          href={contact.gmb_link || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <MapPin className="h-4 w-4" />
          <span className="text-sm truncate">GMB Profile</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>

        {(contact.city || contact.state) && (
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground">
            <MapPin className="h-4 w-4" />
            <span className="text-sm truncate">{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
