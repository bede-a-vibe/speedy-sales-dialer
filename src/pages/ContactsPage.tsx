import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useContacts } from "@/hooks/useContacts";
import { useCallLogs } from "@/hooks/useCallLogs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { Search, Phone, Mail, Globe, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useContacts(industryFilter);
  const { data: callLogs = [] } = useCallLogs();

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      !search ||
      c.business_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_person?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getContactLogs = (contactId: string) =>
    callLogs.filter((l: any) => l.contact_id === contactId);

  return (
    <AppLayout title="Contacts">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="w-[180px] bg-card border-border">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-card border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="uncalled">Uncalled</SelectItem>
              <SelectItem value="called">Called</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs font-mono text-muted-foreground ml-auto">
            {filtered.length} contacts
          </span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-20 text-sm text-muted-foreground animate-pulse">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-sm text-muted-foreground">No contacts found.</div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Business</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Contact</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Industry</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Last Outcome</th>
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((contact) => {
                  const logs = getContactLogs(contact.id);
                  const isExpanded = expandedId === contact.id;
                  return (
                    <>
                      <tr
                        key={contact.id}
                        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{contact.business_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{contact.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{contact.contact_person || "—"}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-mono">
                            {contact.industry}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            contact.status === "called"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {contact.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {contact.last_outcome ? (
                            <span className="text-xs text-muted-foreground">
                              {OUTCOME_CONFIG[contact.last_outcome as CallOutcome]?.label || contact.last_outcome}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {logs.length > 0 ? (
                            isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          ) : null}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${contact.id}-expanded`}>
                          <td colSpan={6} className="bg-muted/20 px-4 py-3">
                            <div className="space-y-3">
                              {/* Contact details */}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {contact.email && (
                                  <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                    <Mail className="h-3 w-3" /> {contact.email}
                                  </a>
                                )}
                                {contact.website && (
                                  <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors">
                                    <Globe className="h-3 w-3" /> Website
                                  </a>
                                )}
                                {(contact.city || contact.state) && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {[contact.city, contact.state].filter(Boolean).join(", ")}
                                  </span>
                                )}
                                <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto">
                                  <Phone className="h-3 w-3" /> Call Now
                                </a>
                              </div>

                              {/* Call history */}
                              {logs.length > 0 ? (
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                                    Call History ({logs.length})
                                  </p>
                                  <div className="space-y-1">
                                    {logs.map((log: any) => {
                                      const config = OUTCOME_CONFIG[log.outcome as CallOutcome];
                                      return (
                                        <div key={log.id} className="flex items-center gap-3 text-xs bg-card border border-border rounded px-3 py-2">
                                          <div className={`w-2 h-2 rounded-full ${config?.bgClass || "bg-muted-foreground"}`} />
                                          <span className="font-medium text-foreground">{config?.label || log.outcome}</span>
                                          {log.notes && (
                                            <span className="text-muted-foreground italic truncate flex-1">"{log.notes}"</span>
                                          )}
                                          <span className="font-mono text-muted-foreground ml-auto shrink-0">
                                            {format(new Date(log.created_at), "MMM d, h:mm a")}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No call history.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
