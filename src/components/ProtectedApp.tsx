import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import DashboardPage from "@/pages/DashboardPage";

const DialerPage = lazy(() => import("@/pages/DialerPage"));
const ContactsPage = lazy(() => import("@/pages/ContactsPage"));
const ContactDetailPage = lazy(() => import("@/pages/ContactDetailPage"));
const PipelinesPage = lazy(() => import("@/pages/PipelinesPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const CallFunnelPage = lazy(() => import("@/pages/CallFunnelPage"));
const DialpadSettingsPage = lazy(() => import("@/pages/DialpadSettingsPage"));
const TargetsPage = lazy(() => import("@/pages/TargetsPage"));
const FollowUpsPage = lazy(() => import("@/pages/FollowUpsPage"));
const TrainingPage = lazy(() => import("@/pages/TrainingPage"));
const GhlSyncPage = lazy(() => import("@/pages/GhlSyncPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

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
    <Suspense fallback={<FullPageLoading />}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dialer" element={<DialerPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/pipelines" element={<PipelinesPage />} />
        <Route path="/follow-ups" element={<FollowUpsPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/funnel" element={<CallFunnelPage />} />
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
        <Route
          path="/admin/ghl-sync"
          element={(
            <AdminRoute>
              <GhlSyncPage />
            </AdminRoute>
          )}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function ProtectedApp() {
  return (
    <AuthProvider>
      <ProtectedRoutes />
    </AuthProvider>
  );
}
