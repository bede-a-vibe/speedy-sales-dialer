import { Phone, Mail, Search, CheckSquare, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { FollowUpMethod } from "@/hooks/usePipelineItems";

const METHODS: { value: FollowUpMethod; label: string; icon: typeof Phone }[] = [
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "task", label: "Task", icon: CheckSquare },
  { value: "prospecting", label: "Prospecting", icon: Search },
];

export const FOLLOW_UP_METHOD_META: Record<
  FollowUpMethod,
  { label: string; icon: typeof Phone }
> = METHODS.reduce(
  (acc, m) => ({ ...acc, [m.value]: { label: m.label, icon: m.icon } }),
  {} as Record<FollowUpMethod, { label: string; icon: typeof Phone }>,
);

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
    sms: { label: "SMS", className: "bg-teal-500/10 text-teal-600 border-teal-500/20" },
    task: { label: "Task", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
    prospecting: { label: "Prospecting", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  } as const;
  const { label, className } = config[method] || config.call;
  const Icon = METHODS.find((m) => m.value === method)?.icon || Phone;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
