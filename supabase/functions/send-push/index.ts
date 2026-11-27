// Envia o push (app PWA dos Admins) de uma notificação nova.
// Chamado pelo banco (trigger em public.notifications via pg_net) com o segredo PUSH_HOOK_SECRET.
// Quem recebe sai de public.push_recipients (preferências de cada Admin).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const TAG_LABEL: Record<string, string> = {
  incident: "Incident", emergency: "Gardaí / Ambulance", health: "Health", damage: "Damage",
  conduct: "Conduct", visitor: "Visitor", delivery: "Delivery", general: "General",
};

function message(kind: string, p: Record<string, unknown>, lodge: string): { title: string; body: string; url: string } {
  switch (kind) {
    case "handover_tag":
      return { title: `${lodge} · ${((p.tags as string[]) ?? []).map((t) => TAG_LABEL[t] ?? t).join(", ")}`, body: String(p.excerpt ?? ""), url: "/handover" };
    case "maintenance_opened":
      return { title: `${lodge} · Maintenance (${p.priority})`, body: String(p.location ?? ""), url: "/maintenance" };
    case "warning_recorded":
      return { title: `${lodge} · Warning`, body: `${p.name ?? ""} — ${String(p.type ?? "").replace("_", " ")}`, url: "/warnings" };
    case "shift_hours_review":
      return { title: `${lodge} · Hours to confirm`, body: `${p.name ?? ""}'s shift differs from the Roster`, url: "/hours" };
    case "fridge_out_of_range":
      return { title: `${lodge} · Fridge out of range`, body: `${p.fridge_name ?? "Fridge"} at ${p.temperature} °C`, url: "/fridge" };
    case "delivery_received":
      return { title: `${lodge} · Delivery received`, body: `${p.supplier ?? ""} — ${p.product ?? ""}`, url: "/deliveries" };
    case "delivery_expiring":
      return { title: `${lodge} · Delivery expiring`, body: `${p.product ?? ""} (${p.supplier ?? ""})`, url: "/deliveries" };
    case "no_show_monthly_limit":
      return { title: `${lodge} · No Show limit`, body: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), url: "/no-shows" };
    case "coverage_below_minimum":
      return { title: "Coverage below minimum", body: "Some shifts have no one assigned", url: "/rota" };
    case "vacation_conflict":
      return { title: "Holiday conflict", body: String(p.name ?? ""), url: "/vacations" };
    default:
      return { title: lodge || "Notice", body: "", url: "/notifications" };
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_HOOK_SECRET")) return new Response("forbidden", { status: 403 });
  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) return new Response("bad request", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  webpush.setVapidDetails("mailto:noreply@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  const { data: n } = await admin.from("notifications").select("id, kind, lodge_id, payload").eq("id", notification_id).single();
  if (!n) return new Response("not found", { status: 404 });
  const { data: recipients } = await admin.rpc("push_recipients", { p_notification: notification_id });
  const ids = (recipients ?? []) as string[];
  if (ids.length === 0) return Response.json({ sent: 0 });
  const { data: lodge } = n.lodge_id ? await admin.from("lodges").select("short_name").eq("id", n.lodge_id).single() : { data: null };
  const msg = message(n.kind, n.payload ?? {}, lodge?.short_name ?? "");
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("staff_id", ids);

  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...msg, tag: `n${n.id}` }), { TTL: 3600 });
      sent++;
      await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); // aparelho saiu
    }
  }
  return Response.json({ sent });
});
