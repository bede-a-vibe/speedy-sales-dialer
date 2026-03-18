import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { authBrowserClient } from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let hasResolvedAuth = false;

    const finishAuthInit = () => {
      if (!isMounted || hasResolvedAuth) return;
      hasResolvedAuth = true;
      setLoading(false);
    };

    const fallbackTimer = window.setTimeout(() => {
      finishAuthInit();
    }, 8000);

    const { data: { subscription } } = authBrowserClient.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (event !== "INITIAL_SESSION") {
        window.clearTimeout(fallbackTimer);
        finishAuthInit();
      }
    });

    void authBrowserClient.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) throw error;

        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (!isMounted) return;

        void authBrowserClient.auth.signOut({ scope: "local" });
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        window.clearTimeout(fallbackTimer);
        finishAuthInit();
      });

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await authBrowserClient.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
