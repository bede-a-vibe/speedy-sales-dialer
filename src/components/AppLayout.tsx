import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user, signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border px-5 bg-card/70 backdrop-blur-sm shrink-0">
            <SidebarTrigger className="mr-4 text-muted-foreground hover:text-foreground" />
            {title && (
              <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
            )}
            <div className="ml-auto flex items-center gap-4">
              <ThemeToggle />
              <span className="hidden sm:inline text-[11px] font-mono text-muted-foreground">{user?.email}</span>
              <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
