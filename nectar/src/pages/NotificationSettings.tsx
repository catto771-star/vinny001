import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { write } from '../lib/useTable';
import { ADVANCE_OPTIONS, VAPID_PUBLIC_KEY, advanceLabel, b64urlToBytes, deviceName, pushSupport } from '../lib/push';
import { isStandalone, useInstall } from '../lib/install';
import { Field } from '../components/ui';

interface Device { id: string; endpoint: string; device: string | null; created_at: string }
interface Prefs { reminders: boolean; tasks: boolean; digest: boolean; autopilot: boolean }
interface SettingsRow {
  reminders_advance_minutes: number[]; tasks_advance_minutes: number[]; habits_digest_time: string; notify_prefs: Prefs;
}

const PREF_LABEL: [keyof Prefs, string, string][] = [
  ['reminders', 'Lembretes', 'No horário e com a antecedência escolhida'],
  ['tasks', 'Tarefas com horário', 'Antes da hora marcada'],
  ['digest', 'Resumo do dia', 'Tarefas, atrasadas, hábitos e contas que vencem hoje'],
  ['autopilot', 'Piloto automático', 'Respostas dos pedidos à IA'],
];
const DEFAULTS: SettingsRow = {
  reminders_advance_minutes: [15], tasks_advance_minutes: [30], habits_digest_time: '08:00',
  notify_prefs: { reminders: true, tasks: true, digest: true, autopilot: true },
};

/** Installing the app: Chrome's own prompt where offered, the steps elsewhere. */
export function InstallCard() {
  const { installed, canPrompt, install } = useInstall();
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return (
    <section className="card" aria-label="Instalar o app">
      <div className="label mb-2 flex items-center gap-2"><Smartphone size={14} strokeWidth={1.5} />App no aparelho</div>
      {installed ? <p className="text-sm text-positive">O Painel está instalado neste aparelho.</p> : canPrompt ? (
        <>
          <p className="mb-3 text-sm text-fg2">Instale o Painel: ganha um ícone na tela inicial, abre em tela cheia e recebe notificações como um app.</p>
          <button className="btn-primary" onClick={() => void install()}><Download size={16} strokeWidth={1.5} />Instalar o app</button>
        </>
      ) : ios ? (
        <p className="text-sm text-fg2">No iPhone: abra no Safari, toque em <strong className="font-medium">Compartilhar</strong> e depois em <strong className="font-medium">Adicionar à Tela de Início</strong>. As notificações funcionam no app instalado (iOS 16.4 ou mais novo).</p>
      ) : (
        <p className="text-sm text-fg2">No Android, abra no Chrome e toque em <strong className="font-medium">⋮ → Instalar app</strong> (ou "Adicionar à tela inicial"). No computador, use o ícone de instalar na barra de endereço.</p>
      )}
    </section>
  );
}

export function NotificationsCard() {
  const support = pushSupport({
    ua: navigator.userAgent, standalone: isStandalone(), hasPush: 'PushManager' in window, hasSW: 'serviceWorker' in navigator,
  });
  const [permission, setPermission] = useState<NotificationPermission>(() => ('Notification' in window ? Notification.permission : 'denied'));
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [settings, setSettings] = useState<SettingsRow>(DEFAULTS);
  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [{ data: user }, { data: subs }, { data: row }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('push_subscriptions').select('id,endpoint,device,created_at').order('created_at'),
      supabase.from('user_settings').select('reminders_advance_minutes,tasks_advance_minutes,habits_digest_time,notify_prefs').maybeSingle(),
    ]);
    setUid(user.user?.id ?? null);
    setDevices((subs ?? []) as Device[]);
    if (row) setSettings({ ...DEFAULTS, ...row, notify_prefs: { ...DEFAULTS.notify_prefs, ...(row.notify_prefs ?? {}) } } as SettingsRow);
    if (support === 'ok') {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const here = !!endpoint && devices.some((d) => d.endpoint === endpoint);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setMessage('O navegador não deu permissão. Libere as notificações do site nas configurações do navegador.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const ok = await write(supabase.from('push_subscriptions').upsert(
        { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: deviceName(navigator.userAgent) }, { onConflict: 'endpoint' },
      ));
      if (ok) { setMessage('Notificações ativadas neste aparelho.'); await load(); }
    } catch (e) {
      setMessage(`Não foi possível ativar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await write(supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint));
      await sub.unsubscribe();
    }
    setMessage('Notificações desligadas neste aparelho.');
    await load();
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('notify', { body: { test: true } });
    setBusy(false);
    if (error) { setMessage('Não foi possível enviar o teste agora.'); return; }
    setMessage(data.sent ? `Teste enviado para ${data.sent} ${data.sent === 1 ? 'aparelho' : 'aparelhos'}.` : 'Nenhum aparelho recebeu: ative as notificações primeiro.');
    if (data.removed) await load();
  }

  async function save(patch: Partial<SettingsRow>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    // Who is signed in comes from the session at save time: a change made before the
    // screen finished loading would otherwise be dropped.
    const id = uid ?? (await supabase.auth.getSession()).data.session?.user.id;
    if (id) await write(supabase.from('user_settings').upsert({ user_id: id, ...patch }, { onConflict: 'user_id' }));
  }

  return (
    <section className="card" aria-label="Notificações">
      <div className="label mb-2 flex items-center gap-2"><Bell size={14} strokeWidth={1.5} />Notificações</div>
      {support === 'unsupported' && <p className="mb-3 text-sm text-fg2">Este navegador não recebe notificações. Use o Chrome (Android ou computador), o Edge ou o Firefox.</p>}
      {support === 'ios-install' && <p className="mb-3 text-sm text-fg2">No iPhone, as notificações só funcionam com o app instalado na Tela de Início (veja acima).</p>}
      {support === 'ok' && (
        <>
          <p className="mb-3 text-sm text-fg2">
            {here ? 'Ativadas neste aparelho. Chegam mesmo com o app fechado (verificação a cada 5 minutos).' : permission === 'denied'
              ? 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e tente de novo.'
              : 'Receba lembretes, tarefas e o resumo do dia neste aparelho, mesmo com o app fechado.'}
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {here
              ? <button className="btn-secondary" disabled={busy} onClick={disable}><BellOff size={16} strokeWidth={1.5} />Desligar neste aparelho</button>
              : <button className="btn-primary" disabled={busy || permission === 'denied'} onClick={enable}><Bell size={16} strokeWidth={1.5} />Ativar neste aparelho</button>}
            {devices.length > 0 && <button className="btn-ghost" disabled={busy} onClick={test}>Enviar teste</button>}
          </div>
        </>
      )}
      {message && <p className="mb-4 text-sm text-fg2" role="status">{message}</p>}

      {devices.length > 0 && (
        <div className="mb-5">
          <div className="mb-1 text-xs text-fg3">Aparelhos que recebem</div>
          <ul className="divide-y divide-line">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="mr-auto">{d.device ?? 'Aparelho'}{d.endpoint === endpoint && <span className="ml-2 text-xs text-positive">este</span>}</span>
                <button className="icon-btn h-7 w-7" aria-label={`Remover ${d.device ?? 'aparelho'}`} onClick={async () => {
                  if (await write(supabase.from('push_subscriptions').delete().eq('id', d.id))) await load();
                }}><Trash2 size={14} strokeWidth={1.5} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-1 text-xs text-fg3">O que avisar</div>
      <ul className="mb-4 divide-y divide-line">
        {PREF_LABEL.map(([key, label, hint]) => (
          <li key={key} className="flex items-center gap-3 py-2.5">
            <div className="mr-auto">
              <div className="text-sm">{label}</div>
              <div className="text-xs text-fg3">{hint}</div>
            </div>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input type="checkbox" role="switch" className="peer sr-only" checked={settings.notify_prefs[key]} aria-label={`Avisar: ${label}`}
                onChange={() => void save({ notify_prefs: { ...settings.notify_prefs, [key]: !settings.notify_prefs[key] } })} />
              <span className="h-7 w-12 rounded-full bg-sunken transition-colors duration-300 ease-out peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" />
              <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] peer-checked:translate-x-5" />
            </label>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Lembretes">
          <select className="input" value={settings.reminders_advance_minutes[0] ?? 0} onChange={(e) => void save({ reminders_advance_minutes: [Number(e.target.value)] })}>
            {ADVANCE_OPTIONS.map((m) => <option key={m} value={m}>{advanceLabel(m)}</option>)}
          </select>
        </Field>
        <Field label="Tarefas">
          <select className="input" value={settings.tasks_advance_minutes[0] ?? 0} onChange={(e) => void save({ tasks_advance_minutes: [Number(e.target.value)] })}>
            {ADVANCE_OPTIONS.map((m) => <option key={m} value={m}>{advanceLabel(m)}</option>)}
          </select>
        </Field>
        <Field label="Resumo do dia">
          <input className="input" type="time" value={settings.habits_digest_time.slice(0, 5)} onChange={(e) => e.target.value && void save({ habits_digest_time: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-fg3">Os lembretes avisam também na hora marcada.</p>
    </section>
  );
}
