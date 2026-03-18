import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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
    const fallbackTimer = window.setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      window.clearTimeout(fallbackTimer);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        if (!isMounted) return;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      })
      .catch(() => {
        if (!isMounted) return;
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (!isMounted) return;
        window.clearTimeout(fallbackTimer);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
