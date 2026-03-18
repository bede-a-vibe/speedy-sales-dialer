import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

    // Safety fallback: force loading=false after 10s no matter what
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 10_000);

    // Wrap getSession with a 5s timeout
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Session fetch timed out")), 5000)
    );

    Promise.race([sessionPromise, timeoutPromise])
      .then(({ data: { session: s } }) => {
        if (!isMounted) return;
        setSession(s);
        setUser(s?.user ?? null);
      })
      .catch(() => {
        if (!isMounted) return;
        setUser(null);
        setSession(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
        clearTimeout(safetyTimer);
      });

    // Handle subsequent auth changes (sign in/out/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      }
    );

    return () => {
      isMounted = false;
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
