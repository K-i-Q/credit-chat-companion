import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const jsonResponse = (
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...headers,
    },
  });

const getAuthToken = (req: Request) => {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
};

export const requireUser = async (req: Request) => {
  if (!supabaseAdmin) {
    return { error: jsonResponse({ error: "Supabase admin client not configured" }, 500) };
  }
  const token = getAuthToken(req);
  if (!token) {
    return { error: jsonResponse({ error: "Missing auth token" }, 401) };
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { error: jsonResponse({ error: "Invalid auth token" }, 401) };
  }
  return { user: data.user };
};

export const requireAdmin = async (req: Request) => {
  const base = await requireUser(req);
  if ("error" in base) return base;
  if (!supabaseAdmin) {
    return { error: jsonResponse({ error: "Supabase admin client not configured" }, 500) };
  }
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", base.user.id)
    .maybeSingle();
  if (error) {
    return { error: jsonResponse({ error: "Failed to read profile role" }, 500) };
  }
  if (data?.role !== "admin") {
    return { error: jsonResponse({ error: "Forbidden" }, 403) };
  }
  return { user: base.user };
};
