import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import { installDemoFetchInterceptor, setDemoModeActive } from "@/lib/demoMode";
import { fetchGhlLocationId } from "@/lib/ghlUrls";
import { PageTransition } from "@/components/PageTransition";
import { FullPageLoading } from "@/components/FullPageLoading";
import { useSessionPolicy } from "@/hooks/useSessionPolicy";

// Every route is lazy, including the dashboard, so opening /dialer directly
// does not download the dashboard first. The busiest routes are prefetched
// once the browser is idle (RoutePrefetch) so moving between them is instant.
const loadDashboard = () => import("@/pages/DashboardPage");
const loadDialer = () => import("@/pages/DialerPage");
const loadContacts = () => import("@/pages/ContactsPage");
const loadPipelines = () => import("@/pages/PipelinesPage");
const DashboardPage = lazy(loadDashboard);
const DialerPage = lazy(loadDialer);
const ContactsPage = lazy(loadContacts);
const ContactDetailPage = lazy(() => import("@/pages/ContactDetailPage"));
const PipelinesPage = lazy(loadPipelines);
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const FollowUpsPage = lazy(() => import("@/pages/FollowUpsPage"));
const MeetingsPage = lazy(() => import("@/pages/MeetingsPage"));
const TrainingPage = lazy(() => import("@/pages/TrainingPage"));
const ManagerPage = lazy(() => import("@/pages/ManagerPage"));
const EodReportPage = lazy(() => import("@/pages/EodReportPage"));
const ClassroomPage = lazy(() => import("@/pages/ClassroomPage"));
const GhlSyncPage = lazy(() => import("@/pages/GhlSyncPage"));
const EnrichmentPage = lazy(() => import("@/pages/EnrichmentPage"));
const ClientsPage = lazy(() => import("@/pages/ClientsPage"));
const SecurityPage = lazy(() => import("@/pages/SecurityPage"));
const TeamPage = lazy(() => import("@/pages/TeamPage"));
const ConnectorsPage = lazy(() => import("@/pages/ConnectorsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));


function AdminRoute({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { canViewAdmin, isLoading } = useAdminAccess();

  if (authLoading || isLoading) {
    return <FullPageLoading />;
  }

  if (!canViewAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AdminOnlyRoute({ children }: { children: ReactNode }) {
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

/** Old /playbook links (bookmarks, coach deep-links) land on the Classroom with their query intact. */
function LegacyRedirect({ to }: { to: string }) {
  const loc = useLocation();
  return <Navigate to={{ pathname: to, search: loc.search }} replace />;
}

/** Keeps the global demo-mode flag in sync with the current user's role. */
function DemoModeSync() {
  const { isDemoMode } = useAdminAccess();
  useEffect(() => {
    installDemoFetchInterceptor();
    setDemoModeActive(Boolean(isDemoMode));
    return () => setDemoModeActive(false);
  }, [isDemoMode]);
  return null;
}

/** Resolves the GHL location ID once per authenticated session, any entry point. */
function GhlLocationSync() {
  useEffect(() => {
    void fetchGhlLocationId();
  }, []);
  return null;
}

/** After first paint, warm the chunks for the routes reps open most. */
function RoutePrefetch() {
  useEffect(() => {
    const run = () => {
      for (const load of [loadDialer, loadDashboard, loadContacts, loadPipelines]) {
        load().catch(() => {
          // A failed prefetch is harmless: the route loads (or recovers) on demand.
        });
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 2000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

/** Enforces the "stay signed in" choice (browser-close, idle and absolute limits). */
function SessionPolicyGuard() {
  useSessionPolicy();
  return null;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageLoading />;
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <Suspense fallback={<FullPageLoading />}>
      <SessionPolicyGuard />
      <DemoModeSync />
      <GhlLocationSync />
      <RoutePrefetch />
      <PageTransition>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dialer" element={<DialerPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/:id" element={<ContactDetailPage />} />
        <Route path="/pipelines" element={<PipelinesPage />} />
        <Route path="/follow-ups" element={<FollowUpsPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/admin/manager" element={(<AdminRoute><ManagerPage /></AdminRoute>)} />
        <Route path="/eod" element={<EodReportPage />} />
        <Route path="/classroom" element={<ClassroomPage />} />
        <Route path="/playbook" element={<LegacyRedirect to="/classroom" />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route
          path="/insights"
          element={(
            <AdminRoute>
              <InsightsPage />
            </AdminRoute>
          )}
        />
        <Route path="/reports" element={<Navigate to="/insights?tab=overview" replace />} />
        <Route path="/reports/funnel" element={<Navigate to="/insights?tab=funnel" replace />} />
        <Route path="/analytics" element={<Navigate to="/insights?tab=overview" replace />} />
        <Route path="/targets" element={<Navigate to="/admin/manager" replace />} />
        <Route path="/dialpad-settings" element={<Navigate to="/admin/team?tab=dialpad" replace />} />
        <Route
          path="/admin/ghl-sync"
          element={(
            <AdminRoute>
              <GhlSyncPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/admin/enrichment"
          element={(
            <AdminRoute>
              <EnrichmentPage />
            </AdminRoute>
          )}
        />
        <Route
          path="/clients"
          element={(
            <AdminRoute>
              <ClientsPage />
            </AdminRoute>
          )}
        />
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route
          path="/admin/team"
          element={(
            <AdminRoute>
              <TeamPage />
            </AdminRoute>
          )}
        />
        <Route path="/admin/roles" element={<Navigate to="/admin/team?tab=roles" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </PageTransition>
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
