import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import DashboardPage from "./pages/DashboardPage";
import DialerPage from "./pages/DialerPage";
import ContactsPage from "./pages/ContactsPage";
import PipelinesPage from "./pages/PipelinesPage";
import UploadPage from "./pages/UploadPage";
import ReportsPage from "./pages/ReportsPage";
import DialpadSettingsPage from "./pages/DialpadSettingsPage";
import TargetsPage from "./pages/TargetsPage";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import FollowUpsPage from "./pages/FollowUpsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function FullPageLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-sm text-muted-foreground font-mono animate-pulse">Loading...</div>
    </div>
  );
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { isAdmin, isLoading } = useAdminAccess();

  if (authLoading || isLoading) {
    return <FullPageLoading />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageLoading />;
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/dialer" element={<DialerPage />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/pipelines" element={<PipelinesPage />} />
      <Route path="/follow-ups" element={<FollowUpsPage />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route
        path="/targets"
        element={(
          <AdminRoute>
            <TargetsPage />
          </AdminRoute>
        )}
      />
      <Route
        path="/dialpad-settings"
        element={(
          <AdminRoute>
            <DialpadSettingsPage />
          </AdminRoute>
        )}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function ProtectedApp() {
  return (
    <AuthProvider>
      <ProtectedRoutes />
    </AuthProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
