import { useState } from "react";
import { LayoutDashboard, Phone, CalendarClock, BarChart3, Users, Settings, Target, CalendarPlus, GraduationCap, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { QuickBookDialog } from "@/components/QuickBookDialog";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useUserRole";
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

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Dialer", url: "/dialer", icon: Phone },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Pipelines", url: "/pipelines", icon: CalendarClock },
  { title: "Training", url: "/training", icon: GraduationCap },
];

const adminItems = [
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Call Funnel", url: "/reports/funnel", icon: GitBranch },
  { title: "Targets", url: "/targets", icon: Target },
  { title: "Dialpad Settings", url: "/dialpad-settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const isAdmin = useIsAdmin();
  const [quickBookOpen, setQuickBookOpen] = useState(false);

  return (
    <>
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Phone className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold text-sidebar-primary tracking-tight">SalesDialer</h1>
              <p className="text-[10px] text-sidebar-foreground font-mono uppercase tracking-widest">CRM</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
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

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-sidebar-accent/50 transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
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

      <SidebarFooter className="p-4 space-y-3">
        <Button
          variant="outline"
          size={collapsed ? "icon" : "default"}
          onClick={() => setQuickBookOpen(true)}
          className="w-full border-primary/30 text-primary hover:bg-primary/10"
        >
          <CalendarPlus className={cn("h-4 w-4", !collapsed && "mr-2")} />
          {!collapsed && "Quick Book"}
        </Button>
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
