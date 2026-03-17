import React, { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useContacts, useUpdateContact } from "@/hooks/useContacts";
import { useCallLogs } from "@/hooks/useCallLogs";
import { useIsAdmin } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { Search, Phone, Mail, Globe, MapPin, ChevronDown, ChevronUp, Pencil, Trash2, Download } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@/hooks/useContacts";

const AUSTRALIAN_STATE_OPTIONS = [
  { value: "all", label: "All States" },
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
] as const;

const AUSTRALIAN_STATE_ALIASES: Record<string, string[]> = {
  NSW: ["nsw", "new south wales"],
  VIC: ["vic", "victoria"],
  QLD: ["qld", "queensland"],
  WA: ["wa", "western australia"],
  SA: ["sa", "south australia"],
  TAS: ["tas", "tasmania"],
  ACT: ["act", "australian capital territory"],
  NT: ["nt", "northern territory"],
};

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<Partial<Contact>>({});

  const { data: contacts = [], isLoading } = useContacts(industryFilter);
  const { data: callLogs = [] } = useCallLogs();
  const isAdmin = useIsAdmin();
  const updateContact = useUpdateContact();
  const queryClient = useQueryClient();

  const filtered = contacts.filter((c) => {
    const normalizedState = c.state?.trim().toLowerCase() ?? "";
    const matchesSearch =
      !search ||
      c.business_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_person?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || c.status === statusFilter;
    const matchesState =
      stateFilter === "all" || AUSTRALIAN_STATE_ALIASES[stateFilter]?.includes(normalizedState);
    return matchesSearch && matchesStatus && matchesState;
  });

  const getContactLogs = (contactId: string) =>
    callLogs.filter((l: any) => l.contact_id === contactId);

  const openEdit = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContact(contact);
    setEditForm({
      business_name: contact.business_name,
      contact_person: contact.contact_person,
      phone: contact.phone,
      email: contact.email,
      website: contact.website,
      gmb_link: contact.gmb_link,
      industry: contact.industry,
      city: contact.city,
      state: contact.state,
    });
  };

  const saveEdit = async () => {
    if (!editContact) return;
    try {
      await updateContact.mutateAsync({ id: editContact.id, ...editForm });
      toast.success("Contact updated.");
      setEditContact(null);
    } catch {
      toast.error("Failed to update contact.");
    }
  };

  const deleteContact = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this contact permanently?")) return;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete contact.");
    } else {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
      toast.success("Contact deleted.");
    }
  };

  const exportCSV = () => {
    const headers = ["Business Name", "Contact Person", "Phone", "Email", "Industry", "City", "State", "Status", "Last Outcome"];
    const rows = filtered.map((c) => [
      c.business_name,
      c.contact_person || "",
      c.phone,
      c.email || "",
      c.industry,
      c.city || "",
      c.state || "",
      c.status,
      c.last_outcome || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} contacts.`);
  };

  return (
    <AppLayout title="Contacts">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
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
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-mono text-muted-foreground">
              {filtered.length} contacts
            </span>
            <Button variant="outline" size="sm" onClick={exportCSV} className="border-border">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </div>
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
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((contact) => {
                  const logs = getContactLogs(contact.id);
                  const isExpanded = expandedId === contact.id;
                  return (
                    <React.Fragment key={contact.id}>
                      <tr
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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => openEdit(contact, e)}
                              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={(e) => deleteContact(contact.id, e)}
                                className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {logs.length > 0 && (
                              isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-muted/20 px-4 py-3">
                            <div className="space-y-3">
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editContact} onOpenChange={(open) => !open && setEditContact(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Contact</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Business Name</Label>
                <Input
                  value={editForm.business_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Contact Person</Label>
                <Input
                  value={editForm.contact_person || ""}
                  onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input
                  value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="bg-card border-border font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  value={editForm.email || ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Industry</Label>
                <Select
                  value={editForm.industry || ""}
                  onValueChange={(v) => setEditForm({ ...editForm, industry: v })}
                >
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input
                  value={editForm.website || ""}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">GMB Link</Label>
                <Input
                  value={editForm.gmb_link || ""}
                  onChange={(e) => setEditForm({ ...editForm, gmb_link: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input
                  value={editForm.city || ""}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input
                  value={editForm.state || ""}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="bg-card border-border"
                />
              </div>
              <div className="col-span-2">
                <Button onClick={saveEdit} className="w-full bg-primary text-primary-foreground font-semibold">
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
