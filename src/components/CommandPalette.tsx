import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Phone,
  Users,
  CalendarClock,
  GraduationCap,
  BarChart3,
  BookOpen,
  RefreshCw,
  Settings,
  ShieldCheck,
  CalendarPlus,
  PlusCircle,
  PlayCircle,
  Sun,
  Moon,
  Building2,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useCanViewAdmin, useIsAdmin } from "@/hooks/useUserRole";
import { QuickBookDialog } from "@/components/QuickBookDialog";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";

type ContactHit = {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string | null;
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const canViewAdmin = useCanViewAdmin();
  const isAdmin = useIsAdmin();

  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // Reset query when closing
  useEffect(() => {
    if (!open) {
      setQuery("");
      setContacts([]);
    }
  }, [open]);

  // Debounced contact search
  useEffect(() => {
    const s = query.trim();
    if (s.length < 2) {
      setContacts([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const like = `%${s.replace(/[%_]/g, "")}%`;
      const { data } = await supabase
        .from("contacts")
        .select("id, business_name, contact_person, phone")
        .eq("is_archived", false)
        .or(
          `business_name.ilike.${like},contact_person.ilike.${like},phone.ilike.${like}`,
        )
        .limit(8);
      if (!cancelled) setContacts((data ?? []) as ContactHit[]);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    // Defer so the dialog closes before the action fires
    setTimeout(fn, 0);
  };

  const routes = useMemo(() => {
    const main = [
      { title: "Dashboard", to: "/", icon: LayoutDashboard },
      { title: "Dialer", to: "/dialer", icon: Phone },
      { title: "Contacts", to: "/contacts", icon: Users },
      { title: "Pipelines", to: "/pipelines", icon: CalendarClock },
      { title: "My Work / Follow-ups", to: "/follow-ups", icon: CalendarClock },
      { title: "Playbook", to: "/playbook", icon: BookOpen },
      { title: "Training", to: "/training", icon: GraduationCap },
    ];
    const admin = canViewAdmin
      ? [
          { title: "Insights · Overview", to: "/insights?tab=overview", icon: BarChart3 },
          { title: "Insights · Funnel", to: "/insights?tab=funnel", icon: BarChart3 },
          { title: "Insights · Team", to: "/insights?tab=team", icon: BarChart3 },
          { title: "Insights · Targets", to: "/insights?tab=targets", icon: BarChart3 },
          { title: "GHL Sync", to: "/admin/ghl-sync", icon: RefreshCw },
          { title: "Enrichment", to: "/admin/enrichment", icon: Sparkles },
          { title: "Dialpad Settings", to: "/dialpad-settings", icon: Settings },
        ]
      : [];
    const adminOnly = isAdmin
      ? [{ title: "User Roles", to: "/admin/roles", icon: ShieldCheck }]
      : [];
    return [...main, ...admin, ...adminOnly];
  }, [canViewAdmin, isAdmin]);

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput
          placeholder="Search contacts or jump to…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {contacts.length > 0 && (
            <>
              <CommandGroup heading="Contacts">
                {contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`contact-${c.id}-${c.business_name}`}
                    onSelect={() => run(() => navigate(`/contacts/${c.id}`))}
                  >
                    <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">{c.business_name}</span>
                      <span className="truncate text-[11px] font-mono text-muted-foreground">
                        {[c.contact_person, c.phone].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading="Go to">
            {routes.map((r) => (
              <CommandItem
                key={r.to}
                value={`go-${r.title}`}
                onSelect={() => run(() => navigate(r.to))}
              >
                <r.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{r.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              value="action-start-dialing"
              onSelect={() => run(() => navigate("/dialer"))}
            >
              <PlayCircle className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Start Dialing</span>
            </CommandItem>
            <CommandItem
              value="action-new-task"
              onSelect={() => run(() => setNewTaskOpen(true))}
            >
              <PlusCircle className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>New Task</span>
            </CommandItem>
            <CommandItem
              value="action-quick-book"
              onSelect={() => run(() => setQuickBookOpen(true))}
            >
              <CalendarPlus className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Quick Book</span>
            </CommandItem>
            <CommandItem
              value="action-theme-toggle"
              onSelect={() =>
                run(() => setTheme(theme === "dark" ? "light" : "dark"))
              }
            >
              {theme === "dark" ? (
                <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
              ) : (
                <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
              )}
              <span>Toggle {theme === "dark" ? "light" : "dark"} mode</span>
              <CommandShortcut>theme</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <QuickBookDialog open={quickBookOpen} onOpenChange={setQuickBookOpen} />
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </>
  );
}