import { useState } from "react";
import { LayoutDashboard, Phone, CalendarClock, BarChart3, Users, Settings, CalendarPlus, GraduationCap, RefreshCw, ShieldCheck, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { QuickBookDialog } from "@/components/QuickBookDialog";
import { Button } from "@/components/ui/button";
import { useCanViewAdmin, useIsAdmin, useIsCoach } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navLinkBase =
  "relative flex items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground";
const navLinkActive =
  "bg-sidebar-accent/70 text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_hsl(var(--sidebar-ring))] [&_svg]:drop-shadow-[0_0_6px_hsl(var(--sidebar-ring)/0.75)]";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Dialer", url: "/dialer", icon: Phone },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Pipelines", url: "/pipelines", icon: CalendarClock },
  { title: "Playbook", url: "/playbook", icon: BookOpen },
  { title: "Training", url: "/training", icon: GraduationCap },
];

const adminItems = [
  { title: "Insights", url: "/insights", icon: BarChart3 },
  { title: "GHL Sync", url: "/admin/ghl-sync", icon: RefreshCw },
  { title: "Dialpad Settings", url: "/dialpad-settings", icon: Settings },
];

const adminOnlyItems = [
  { title: "User Roles", url: "/admin/roles", icon: ShieldCheck },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const canViewAdmin = useCanViewAdmin();
  const isCoach = useIsCoach();
  const isAdmin = useIsAdmin();
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const { user } = useAuth();
  const email = user?.email ?? "";
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (email ? email.split("@")[0] : "User");
  const initials = (displayName || email || "U")
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "U";

  return (
    <>
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-gradient-to-b from-brand-navy to-brand-navy-2"
    >
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-primary flex items-center justify-center shadow-glow ring-1 ring-primary/40">
            <Phone className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-none">
                Speedy
                {isCoach && (
                  <span className="ml-2 inline-flex items-center rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-amber-400">
                    Coach
                  </span>
                )}
              </h1>
              <p className="mt-1 text-[10px] text-sidebar-foreground/70 font-mono uppercase tracking-widest">
                {isCoach ? "Demo Mode" : "CRM"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/50">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-9">
                    <NavLink
                      to={item.url}
                      end
                      className={navLinkBase}
                      activeClassName={navLinkActive}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canViewAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/50">
              {isCoach ? "Admin (read-only)" : "Admin"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="h-9">
                      <NavLink
                        to={item.url}
                        end
                        className={navLinkBase}
                        activeClassName={navLinkActive}
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {isAdmin && adminOnlyItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="h-9">
                      <NavLink
                        to={item.url}
                        end
                        className={navLinkBase}
                        activeClassName={navLinkActive}
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-3 border-t border-sidebar-border/60">
        <Button
          variant="outline"
          size={collapsed ? "icon" : "default"}
          onClick={() => setQuickBookOpen(true)}
          className="w-full border-primary/40 bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
        >
          <CalendarPlus className={cn("h-4 w-4", !collapsed && "mr-2")} />
          {!collapsed && "Quick Book"}
        </Button>
        <div
          className={cn(
            "flex items-center gap-2 rounded-md bg-white/5 p-2 ring-1 ring-white/5",
            collapsed && "justify-center bg-transparent ring-0 p-0"
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold uppercase text-primary ring-1 ring-primary/40">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium text-white">{displayName}</p>
              {email && (
                <p className="truncate text-[10px] font-mono text-sidebar-foreground/60">{email}</p>
              )}
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="text-[10px] text-sidebar-foreground/40 font-mono">
            v1.0 · Desktop Mode
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
    <QuickBookDialog open={quickBookOpen} onOpenChange={setQuickBookOpen} />
    </>
  );
}
