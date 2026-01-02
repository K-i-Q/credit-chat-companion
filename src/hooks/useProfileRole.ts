import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";

export const useProfileRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }

    setLoading(true);
    supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setRole((data?.role as "admin" | "user") ?? "user");
      })
      .finally(() => setLoading(false));
  }, [user]);

  return { role, loading };
};
