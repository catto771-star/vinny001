import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { write } from '../lib/useTable';
import { ADVANCE_OPTIONS, VAPID_PUBLIC_KEY, advanceLabel, b64urlToBytes, deviceName, pushSupport } from '../lib/push';
import { isStandalone, useInstall } from '../lib/install';
import { Field } from '../components/ui';
const PREF_LABEL = [
    ['reminders', 'Lembretes', 'No horário e com a antecedência escolhida'],
    ['tasks', 'Tarefas com horário', 'Antes da hora marcada'],
    ['digest', 'Resumo do dia', 'Tarefas, atrasadas, hábitos e contas que vencem hoje'],
    ['autopilot', 'Piloto automático', 'Respostas dos pedidos à IA'],
];
const DEFAULTS = {
    reminders_advance_minutes: [15], tasks_advance_minutes: [30], habits_digest_time: '08:00',
    notify_prefs: { reminders: true, tasks: true, digest: true, autopilot: true },
};
/** Installing the app: Chrome's own prompt where offered, the steps elsewhere. */
export function InstallCard() {
    const { installed, canPrompt, install } = useInstall();
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    return (_jsxs("section", { className: "card", "aria-label": "Instalar o app", children: [_jsxs("div", { className: "label mb-2 flex items-center gap-2", children: [_jsx(Smartphone, { size: 14, strokeWidth: 1.5 }), "App no aparelho"] }), installed ? _jsx("p", { className: "text-sm text-positive", children: "O Painel est\u00E1 instalado neste aparelho." }) : canPrompt ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-3 text-sm text-fg2", children: "Instale o Painel: ganha um \u00EDcone na tela inicial, abre em tela cheia e recebe notifica\u00E7\u00F5es como um app." }), _jsxs("button", { className: "btn-primary", onClick: () => void install(), children: [_jsx(Download, { size: 16, strokeWidth: 1.5 }), "Instalar o app"] })] })) : ios ? (_jsxs("p", { className: "text-sm text-fg2", children: ["No iPhone: abra no Safari, toque em ", _jsx("strong", { className: "font-medium", children: "Compartilhar" }), " e depois em ", _jsx("strong", { className: "font-medium", children: "Adicionar \u00E0 Tela de In\u00EDcio" }), ". As notifica\u00E7\u00F5es funcionam no app instalado (iOS 16.4 ou mais novo)."] })) : (_jsxs("p", { className: "text-sm text-fg2", children: ["No Android, abra no Chrome e toque em ", _jsx("strong", { className: "font-medium", children: "\u22EE \u2192 Instalar app" }), " (ou \"Adicionar \u00E0 tela inicial\"). No computador, use o \u00EDcone de instalar na barra de endere\u00E7o."] }))] }));
}
export function NotificationsCard() {
    const support = pushSupport({
        ua: navigator.userAgent, standalone: isStandalone(), hasPush: 'PushManager' in window, hasSW: 'serviceWorker' in navigator,
    });
    const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
    const [endpoint, setEndpoint] = useState(null);
    const [devices, setDevices] = useState([]);
    const [settings, setSettings] = useState(DEFAULTS);
    const [uid, setUid] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    async function load() {
        const [{ data: user }, { data: subs }, { data: row }] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('push_subscriptions').select('id,endpoint,device,created_at').order('created_at'),
            supabase.from('user_settings').select('reminders_advance_minutes,tasks_advance_minutes,habits_digest_time,notify_prefs').maybeSingle(),
        ]);
        setUid(user.user?.id ?? null);
        setDevices((subs ?? []));
        if (row)
            setSettings({ ...DEFAULTS, ...row, notify_prefs: { ...DEFAULTS.notify_prefs, ...(row.notify_prefs ?? {}) } });
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
            if (perm !== 'granted') {
                setMessage('O navegador não deu permissão. Libere as notificações do site nas configurações do navegador.');
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) });
            const json = sub.toJSON();
            const ok = await write(supabase.from('push_subscriptions').upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: deviceName(navigator.userAgent) }, { onConflict: 'endpoint' }));
            if (ok) {
                setMessage('Notificações ativadas neste aparelho.');
                await load();
            }
        }
        catch (e) {
            setMessage(`Não foi possível ativar: ${e.message}`);
        }
        finally {
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
        if (error) {
            setMessage('Não foi possível enviar o teste agora.');
            return;
        }
        setMessage(data.sent ? `Teste enviado para ${data.sent} ${data.sent === 1 ? 'aparelho' : 'aparelhos'}.` : 'Nenhum aparelho recebeu: ative as notificações primeiro.');
        if (data.removed)
            await load();
    }
    async function save(patch) {
        const next = { ...settings, ...patch };
        setSettings(next);
        // Who is signed in comes from the session at save time: a change made before the
        // screen finished loading would otherwise be dropped.
        const id = uid ?? (await supabase.auth.getSession()).data.session?.user.id;
        if (id)
            await write(supabase.from('user_settings').upsert({ user_id: id, ...patch }, { onConflict: 'user_id' }));
    }
    return (_jsxs("section", { className: "card", "aria-label": "Notifica\u00E7\u00F5es", children: [_jsxs("div", { className: "label mb-2 flex items-center gap-2", children: [_jsx(Bell, { size: 14, strokeWidth: 1.5 }), "Notifica\u00E7\u00F5es"] }), support === 'unsupported' && _jsx("p", { className: "mb-3 text-sm text-fg2", children: "Este navegador n\u00E3o recebe notifica\u00E7\u00F5es. Use o Chrome (Android ou computador), o Edge ou o Firefox." }), support === 'ios-install' && _jsx("p", { className: "mb-3 text-sm text-fg2", children: "No iPhone, as notifica\u00E7\u00F5es s\u00F3 funcionam com o app instalado na Tela de In\u00EDcio (veja acima)." }), support === 'ok' && (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-3 text-sm text-fg2", children: here ? 'Ativadas neste aparelho. Chegam mesmo com o app fechado (verificação a cada 5 minutos).' : permission === 'denied'
                            ? 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e tente de novo.'
                            : 'Receba lembretes, tarefas e o resumo do dia neste aparelho, mesmo com o app fechado.' }), _jsxs("div", { className: "mb-4 flex flex-wrap gap-2", children: [here
                                ? _jsxs("button", { className: "btn-secondary", disabled: busy, onClick: disable, children: [_jsx(BellOff, { size: 16, strokeWidth: 1.5 }), "Desligar neste aparelho"] })
                                : _jsxs("button", { className: "btn-primary", disabled: busy || permission === 'denied', onClick: enable, children: [_jsx(Bell, { size: 16, strokeWidth: 1.5 }), "Ativar neste aparelho"] }), devices.length > 0 && _jsx("button", { className: "btn-ghost", disabled: busy, onClick: test, children: "Enviar teste" })] })] })), message && _jsx("p", { className: "mb-4 text-sm text-fg2", role: "status", children: message }), devices.length > 0 && (_jsxs("div", { className: "mb-5", children: [_jsx("div", { className: "mb-1 text-xs text-fg3", children: "Aparelhos que recebem" }), _jsx("ul", { className: "divide-y divide-line", children: devices.map((d) => (_jsxs("li", { className: "flex items-center gap-2 py-2 text-sm", children: [_jsxs("span", { className: "mr-auto", children: [d.device ?? 'Aparelho', d.endpoint === endpoint && _jsx("span", { className: "ml-2 text-xs text-positive", children: "este" })] }), _jsx("button", { className: "icon-btn h-7 w-7", "aria-label": `Remover ${d.device ?? 'aparelho'}`, onClick: async () => {
                                        if (await write(supabase.from('push_subscriptions').delete().eq('id', d.id)))
                                            await load();
                                    }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }, d.id))) })] })), _jsx("div", { className: "mb-1 text-xs text-fg3", children: "O que avisar" }), _jsx("ul", { className: "mb-4 divide-y divide-line", children: PREF_LABEL.map(([key, label, hint]) => (_jsxs("li", { className: "flex items-center gap-3 py-2.5", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("div", { className: "text-sm", children: label }), _jsx("div", { className: "text-xs text-fg3", children: hint })] }), _jsxs("label", { className: "relative inline-flex shrink-0 cursor-pointer items-center", children: [_jsx("input", { type: "checkbox", role: "switch", className: "peer sr-only", checked: settings.notify_prefs[key], "aria-label": `Avisar: ${label}`, onChange: () => void save({ notify_prefs: { ...settings.notify_prefs, [key]: !settings.notify_prefs[key] } }) }), _jsx("span", { className: "h-7 w-12 rounded-full bg-sunken transition-colors duration-300 ease-out peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand" }), _jsx("span", { className: "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] peer-checked:translate-x-5" })] })] }, key))) }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(Field, { label: "Lembretes", children: _jsx("select", { className: "input", value: settings.reminders_advance_minutes[0] ?? 0, onChange: (e) => void save({ reminders_advance_minutes: [Number(e.target.value)] }), children: ADVANCE_OPTIONS.map((m) => _jsx("option", { value: m, children: advanceLabel(m) }, m)) }) }), _jsx(Field, { label: "Tarefas", children: _jsx("select", { className: "input", value: settings.tasks_advance_minutes[0] ?? 0, onChange: (e) => void save({ tasks_advance_minutes: [Number(e.target.value)] }), children: ADVANCE_OPTIONS.map((m) => _jsx("option", { value: m, children: advanceLabel(m) }, m)) }) }), _jsx(Field, { label: "Resumo do dia", children: _jsx("input", { className: "input", type: "time", value: settings.habits_digest_time.slice(0, 5), onChange: (e) => e.target.value && void save({ habits_digest_time: e.target.value }) }) })] }), _jsx("p", { className: "text-xs text-fg3", children: "Os lembretes avisam tamb\u00E9m na hora marcada." })] }));
}
