import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 50;

export function LeadTrackerTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-leads", statusFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("contacts")
        .select("id, business_name, industry, state, status, last_outcome, call_attempt_count, last_called_at, latest_appointment_outcome")
        .order("last_called_at", { ascending: false, nullsFirst: false })
        .limit(PAGE_SIZE);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim().length >= 2) q = q.ilike("business_name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const rows = data ?? [];

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Lead Tracker</h3>
        <Input
          placeholder="Search business name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[220px] text-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="uncalled">Uncalled</SelectItem>
            <SelectItem value="called">Called</SelectItem>
            <SelectItem value="booked">Booked</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
            <SelectItem value="not_interested">Not interested</SelectItem>
            <SelectItem value="dnc">DNC</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Showing {rows.length} (max {PAGE_SIZE})</span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Outcome</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
              <TableHead>Last Called</TableHead>
              <TableHead>Appt Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No leads match.</TableCell></TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm font-medium text-foreground">
                    <Link to={`/contacts/${c.id}`} className="hover:underline">{c.business_name}</Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.industry ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.state ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{c.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.last_outcome ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{c.call_attempt_count ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.last_called_at ? new Date(c.last_called_at).toLocaleDateString("en-AU") : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.latest_appointment_outcome ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
