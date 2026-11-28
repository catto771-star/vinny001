import { supabase } from "@/lib/supabase";

/** Chave pública VAPID (não é segredo): identifica o servidor de push do app. */
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** O app está instalado na Tela de Início (exigência do iPhone para receber push). */
export function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return /iPhone|iPad/.test(navigator.userAgent) && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Mantém o nome do erro do navegador (ex.: AbortError) e diz em que etapa falhou. */
function stepError(step: string, e: unknown): Error {
  const err = new Error(`${step} failed: ${(e as Error)?.message ?? String(e)}`);
  err.name = (e as Error)?.name ?? "Error";
  return err;
}

/** Pede permissão, assina o push neste aparelho e guarda no banco (só Admin). */
export async function enablePush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error("push_not_configured");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("push_denied");
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  } catch (e) {
    throw stepError("service worker", e);
  }
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  } catch (e) {
    throw stepError("push subscription", e);
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const device = /iPhone/.test(navigator.userAgent) ? "iPhone" : /iPad/.test(navigator.userAgent) ? "iPad" : "Browser";
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_device: device });
  if (error) throw error;
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
