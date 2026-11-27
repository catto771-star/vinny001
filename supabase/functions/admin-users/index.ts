// Supabase Edge Function: gestão de contas (s.4).
// Só Manager, Owner e Developer (com a segunda etapa) usam. A chave de serviço fica
// só aqui no servidor; o cadastro na equipe é gravado com o JWT de quem chamou,
// para que as regras do banco (RLS) e a auditoria registrem o autor real.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body =
  | {
      action: "create";
      full_name: string;
      display_name?: string | null;
      email?: string | null;
      role: "station" | "porter" | "cleaner" | "manager" | "owner";
      locale: "pt-PT" | "en-IE" | "pl-PL";
      home_lodge_id?: string | null;
      password?: string | null;
    }
  | { action: "reset_password"; staff_id: string; password: string }
  | { action: "set_active"; staff_id: string; active: boolean };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function strongPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: isManagement, error: roleError } = await caller.rpc("is_management");
  if (roleError || isManagement !== true) return json(403, { error: "not_authorised" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }

  if (body.action === "create") {
    if (!body.full_name?.trim()) return json(400, { error: "name_required" });
    if (!["station", "porter", "cleaner", "manager", "owner"].includes(body.role)) return json(400, { error: "invalid_role" });
    // Beta: só a conta da casa (Staff) e a gestão (Admin) entram no sistema; Porter e Cleaner não têm login.
    const withLogin = ["station", "manager", "owner"].includes(body.role);
    if (body.role === "station" && !body.home_lodge_id) return json(400, { error: "home_lodge_required" });

    let userId: string | null = null;
    if (withLogin) {
      const email = body.email?.trim().toLowerCase();
      if (!email) return json(400, { error: "email_required" });
      if (!strongPassword(body.password)) return json(400, { error: "weak_password" });
      const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
      if (error || !data.user) return json(400, { error: error?.message ?? "create_failed" });
      userId = data.user.id;
    }

    const { data: staff, error: staffError } = await caller
      .from("staff")
      .insert({
        user_id: userId,
        full_name: body.full_name.trim(),
        display_name: body.display_name?.trim() || null,
        email: withLogin ? body.email?.trim().toLowerCase() : body.email?.trim() || null,
        role: body.role,
        locale: body.locale,
        home_lodge_id: body.role === "station" ? body.home_lodge_id || null : null,
        must_change_password: withLogin,
      })
      .select("id")
      .single();

    if (staffError) {
      if (userId) await admin.auth.admin.deleteUser(userId);
      return json(400, { error: staffError.message });
    }
    return json(200, { staff_id: staff.id });
  }

  if (body.action === "reset_password" || body.action === "set_active") {
    const { data: target, error } = await caller.from("staff").select("id, user_id, role").eq("id", body.staff_id).single();
    if (error || !target) return json(404, { error: "staff_not_found" });

    if (body.action === "reset_password") {
      if (!target.user_id) return json(400, { error: "no_login" });
      if (!strongPassword(body.password)) return json(400, { error: "weak_password" });
      // Marca primeiro (passa pela RLS: Developer só é alterado pelo próprio Developer).
      const { data: marked, error: markError } = await caller
        .from("staff").update({ must_change_password: true }).eq("id", target.id).select("id");
      if (markError || !marked?.length) return json(403, { error: "not_authorised" });
      const { error: pwError } = await admin.auth.admin.updateUserById(target.user_id, { password: body.password });
      if (pwError) return json(400, { error: pwError.message });
      return json(200, { ok: true });
    }

    // Desativar corta o acesso na hora (RLS) e bloqueia novos logins; o histórico fica.
    const { data: updated, error: updateError } = await caller
      .from("staff").update({ active: body.active }).eq("id", target.id).select("id");
    if (updateError || !updated?.length) return json(403, { error: "not_authorised" });
    if (target.user_id) {
      await admin.auth.admin.updateUserById(target.user_id, { ban_duration: body.active ? "none" : "876000h" });
    }
    return json(200, { ok: true });
  }

  return json(400, { error: "unknown_action" });
});
