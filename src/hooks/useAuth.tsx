import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const redeemInvite = async (accessToken: string) => {
      const code = localStorage.getItem("mentorix_invite_code");
      if (!code) return;
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
      const endpoint = baseUrl ? `${baseUrl}/api/invite/redeem` : "/api/invite/redeem";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          if (typeof data?.new_balance === "number") {
            window.dispatchEvent(
              new CustomEvent("mentorix-credits-updated", { detail: data.new_balance })
            );
          }
          localStorage.removeItem("mentorix_invite_code");
          return;
        }
        if (response.status === 404) {
          localStorage.removeItem("mentorix_invite_code");
        }
      } catch (error) {
        // keep the code for a retry on next auth change
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
      if (data.session?.user) {
        supabase.rpc("ensure_user_bootstrap").catch(() => {});
        if (data.session?.access_token) {
          redeemInvite(data.session.access_token);
        }
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
      if (nextSession?.user) {
        supabase.rpc("ensure_user_bootstrap").catch(() => {});
        if (nextSession?.access_token) {
          redeemInvite(nextSession.access_token);
        }
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
