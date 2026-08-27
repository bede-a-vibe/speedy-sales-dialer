import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Search, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-5 bg-card/70 backdrop-blur-sm shrink-0">
            <SidebarTrigger className="mr-4 text-muted-foreground hover:text-foreground" />
            {title && (
              <h1 className="text-base font-semibold text-foreground tracking-tight">{title}</h1>
            )}
            <div className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                aria-label="Open command palette"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search or jump to…</span>
                <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              </button>
              <ThemeToggle />
              <span className="hidden sm:inline text-[11px] font-mono text-muted-foreground">{user?.email}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Sign out" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => signOut("local")} className="text-xs gap-2 cursor-pointer">
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out (this device)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive"
                    onClick={async () => {
                      try {
                        await signOut("global");
                        toast.success("Signed out of all devices.");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to sign out everywhere.");
                      }
                    }}
                  >
                    <MonitorSmartphone className="h-3.5 w-3.5" />
                    Sign out of all devices
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}
