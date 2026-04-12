import { Phone, Mail, Search } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { FollowUpMethod } from "@/hooks/usePipelineItems";

const METHODS: { value: FollowUpMethod; label: string; icon: typeof Phone }[] = [
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "prospecting", label: "Prospecting", icon: Search },
];

interface FollowUpMethodSelectorProps {
  value: FollowUpMethod;
  onChange: (method: FollowUpMethod) => void;
  className?: string;
  allowedMethods?: FollowUpMethod[];
}

export function FollowUpMethodSelector({ value, onChange, className, allowedMethods }: FollowUpMethodSelectorProps) {
  const visibleMethods = allowedMethods?.length
    ? METHODS.filter(({ value: method }) => allowedMethods.includes(method))
    : METHODS;

  useEffect(() => {
    if (!visibleMethods.some(({ value: method }) => method === value)) {
      onChange(visibleMethods[0]?.value ?? "call");
    }
  }, [onChange, value, visibleMethods]);

  return (
    <div className={cn("flex gap-1", className)}>
      {visibleMethods.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            value === v
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function FollowUpMethodBadge({ method }: { method: FollowUpMethod }) {
  const config = {
    call: { label: "Call", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    email: { label: "Email", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
    prospecting: { label: "Prospecting", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  };
  const { label, className } = config[method] || config.call;
  const Icon = METHODS.find((m) => m.value === method)?.icon || Phone;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
