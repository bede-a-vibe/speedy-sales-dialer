import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Target, TrendingUp, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const currency = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

const currencyPrecise = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  highlight?: boolean;
}

function Tile({ icon, label, value, subtext, highlight }: TileProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4",
        highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          highlight ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xl font-bold text-foreground">{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        {subtext && <p className="text-[10px] text-muted-foreground">{subtext}</p>}
      </div>
    </div>
  );
}

export function MySalesPanel() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: closes = [] } = useQuery({
    queryKey: ["my-sales-closes", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_items")
        .select("id, deal_value, monthly_recurring_value, outcome_recorded_at")
        .eq("pipeline_type", "booked")
        .eq("appointment_outcome", "showed_closed")
        .eq("created_by", userId!);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: dialCount = 0 } = useQuery({
    queryKey: ["my-sales-dials", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    const setupRevenue = closes.reduce((s, c) => s + (Number(c.deal_value) || 0), 0);
    const mrr = closes.reduce((s, c) => s + (Number(c.monthly_recurring_value) || 0), 0);
    const firstYearValue = setupRevenue + mrr * 12;
    const dialToSale = dialCount > 0 ? Math.round((closes.length / dialCount) * 1000) / 10 : 0;
    const revenuePerDial = dialCount > 0 ? firstYearValue / dialCount : 0;
    return { setupRevenue, mrr, firstYearValue, dialToSale, revenuePerDial };
  }, [closes, dialCount]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            My Sales (Lifetime)
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Closes you've booked, your dial-to-sale economics.
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {closes.length} signed
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<Target className="h-5 w-5" />}
          label="Closes"
          value={closes.length}
          subtext={`from ${dialCount.toLocaleString()} dials`}
          highlight
        />
        <Tile
          icon={<TrendingUp className="h-5 w-5" />}
          label="Dial → Sale"
          value={`${stats.dialToSale}%`}
          subtext={
            closes.length > 0 && dialCount > 0
              ? `~${Math.round(dialCount / closes.length)} dials / sale`
              : "—"
          }
        />
        <Tile
          icon={<Phone className="h-5 w-5" />}
          label="$ / Dial"
          value={currencyPrecise(stats.revenuePerDial)}
          subtext="first-year value / dial"
          highlight
        />
        <Tile
          icon={<DollarSign className="h-5 w-5" />}
          label="First-Year Value"
          value={currency(stats.firstYearValue)}
          subtext={`${currency(stats.setupRevenue)} setup + ${currency(stats.mrr)}/mo`}
        />
      </div>
    </div>
  );
}