"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { parseGender, type Gender } from "@/lib/auth/gender";

export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  gender: Gender | null;
};

type AuthContextValue = {
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: AuthUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  // The root layout re-runs on every navigation (including after a server-side
  // sign-out + redirect), so keep state in sync with the server's view of the
  // session. Keyed on the user id so a client-driven sign-in isn't clobbered.
  useEffect(() => {
    setUser(initialUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUser?.id ?? null]);

  useEffect(() => {
    const supabase = createClient();

    // Keep the header in sync with sign-in / sign-out / token refresh without a
    // full page reload. Seeded from the server (initialUser) so there's no flash.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(
        sessionUser
          ? {
              id: sessionUser.id,
              email: sessionUser.email ?? null,
              fullName:
                (sessionUser.user_metadata?.full_name as string | undefined) ??
                (sessionUser.user_metadata?.name as string | undefined) ??
                null,
              gender: parseGender(sessionUser.user_metadata?.gender),
            }
          : null,
      );
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo(() => ({ user }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
