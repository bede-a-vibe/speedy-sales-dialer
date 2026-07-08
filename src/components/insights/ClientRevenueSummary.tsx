import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ArrowRight } from "lucide-react";
import { useClientRollup } from "@/hooks/useClientDeals";
import { formatCurrency } from "@/lib/clientRevenue";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Compact client-MRR summary for the Insights → Overview tab. Reads client_deals. */
export function ClientRevenueSummary() {
  const { totals, isLoading } = useClientRollup();
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Client revenue</h3>
          </div>
          <Link
            to="/clients"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View clients <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total MRR" value={isLoading ? "—" : formatCurrency(totals.totalMrr)} sub="/mo ex-GST" />
          <Stat label="Active clients" value={isLoading ? "—" : totals.activeClients.toLocaleString()} />
          <Stat label="Revenue to date" value={isLoading ? "—" : formatCurrency(totals.totalRevenueToDate)} sub="realised" />
          <Stat label="Lost MRR" value={isLoading ? "—" : formatCurrency(totals.churnedMrr)} sub="/mo churned" />
        </div>
      </CardContent>
    </Card>
  );
}
