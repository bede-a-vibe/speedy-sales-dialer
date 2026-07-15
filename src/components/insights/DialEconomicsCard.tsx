import { useState } from "react";
import { Coins, PhoneCall, DollarSign, Handshake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialEconomics } from "@/hooks/useDialEconomics";
import { formatCurrency, formatCurrencyCents } from "@/lib/clientRevenue";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

function Metric({ label, value, sub, icon: Icon, highlight }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-lg border border-primary/30 bg-primary/5 p-3" : "rounded-lg border border-border bg-card p-3"}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className={`mt-1 font-mono font-bold tabular-nums ${highlight ? "text-2xl text-primary" : "text-xl text-foreground"}`}>{value}</p>
          {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
        </div>
        <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
      </div>
    </div>
  );
}

export function DialEconomicsCard() {
  const [days, setDays] = useState("30");
  const { data, isLoading } = useDialEconomics(Number(days));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Coins className="h-4 w-4 text-primary" /> Dial economics
            </CardTitle>
            <CardDescription className="text-xs">
              New monthly recurring revenue won per dial placed, in the window.
            </CardDescription>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="$ per dial"
          value={isLoading || !data ? "—" : formatCurrencyCents(data.mrrPerDial)}
          sub="new MRR ÷ dials"
          icon={DollarSign}
          highlight
        />
        <Metric label="Dials" value={isLoading || !data ? "—" : data.dials.toLocaleString()} sub="calls logged" icon={PhoneCall} />
        <Metric label="New MRR won" value={isLoading || !data ? "—" : formatCurrency(data.newMrr)} sub="/mo, deals started" icon={Coins} />
        <Metric
          label="Deals closed"
          value={isLoading || !data ? "—" : data.dealsClosed.toLocaleString()}
          sub={data && data.oneOffRevenue > 0 ? `+ ${formatCurrency(data.oneOffRevenue)} one-off` : undefined}
          icon={Handshake}
        />
      </CardContent>
    </Card>
  );
}
