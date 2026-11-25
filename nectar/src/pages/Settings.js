import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Bot, Check, Database, Download, HeartPulse, Plug, SlidersHorizontal, Smartphone, Trash2, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { write } from '../lib/useTable';
import { applyTheme, readTheme } from '../lib/theme';
import { ACCENTS, applyAccent, readAccent } from '../lib/accent';
import { CURRENCIES } from '../lib/money';
import { AI_MODELS, EXPORT_TABLES, OWN_ROWS_ONLY, START_KEY, TIMEZONES, exportFileName, modelLabel, readStart, tzLabel } from '../lib/prefs';
import { SECTIONS } from '../components/Layout';
import { Field, FieldGroup, PageHeader } from '../components/ui';
import { InstallCard, NotificationsCard } from './NotificationSettings';
const GROUPS = [
    { key: 'conta', label: 'Conta', icon: UserRound },
    { key: 'preferencias', label: 'Preferências', icon: SlidersHorizontal },
    { key: 'saude', label: 'Saúde', icon: HeartPulse },
    { key: 'notificacoes', label: 'Notificações', icon: Bell },
    { key: 'conectores', label: 'Conectores', icon: Plug },
    { key: 'app', label: 'App no aparelho', icon: Smartphone },
    { key: 'dados', label: 'Dados e privacidade', icon: Database },
];
const EMPTY = { display_name: null, timezone: 'America/Sao_Paulo', display_currency: 'BRL', height_cm: null, sex: null, assistant_model: 'anthropic/claude-sonnet-4' };
/** The settings row of the signed-in user, read once and saved field by field. */
function useSettingsRow() {
    const [row, setRow] = useState(EMPTY);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        void supabase.from('user_settings').select('display_name,timezone,display_currency,height_cm,sex,assistant_model').maybeSingle().then(({ data }) => {
            if (data)
                setRow({ ...EMPTY, ...data });
            setLoaded(true);
        });
    }, []);
    async function save(patch) {
        setRow((r) => ({ ...r, ...patch }));
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id;
        return uid ? write(supabase.from('user_settings').upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' })) : false;
    }
    return { row, loaded, save };
}
export default function Settings({ email }) {
    const [params, setParams] = useSearchParams();
    const group = (GROUPS.some((g) => g.key === params.get('secao')) ? params.get('secao') : 'conta');
    const settings = useSettingsRow();
    const current = GROUPS.find((g) => g.key === group);
    // On phones the sections are a row that scrolls: keep the current one in view.
    const nav = useRef(null);
    useEffect(() => { nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [group]);
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Configura\u00E7\u00F5es" }), _jsxs("div", { className: "grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]", children: [_jsx("nav", { ref: nav, "aria-label": "Se\u00E7\u00F5es de configura\u00E7\u00E3o", className: "-mx-1 flex gap-1 overflow-x-auto pb-1 md:mx-0 md:block md:space-y-0.5 md:overflow-visible", children: GROUPS.map(({ key, label, icon: Icon }) => (_jsxs("button", { "aria-current": key === group ? 'page' : undefined, onClick: () => setParams({ secao: key }), className: `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors duration-150 md:w-full ${key === group ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/50 hover:text-fg'}`, children: [_jsx(Icon, { size: 16, strokeWidth: 1.5, className: key === group ? 'text-brand' : 'text-fg3' }), label] }, key))) }), _jsxs("div", { className: "grid max-w-2xl content-start gap-6", "aria-label": current.label, children: [_jsx("h2", { className: "text-lg font-medium md:hidden", children: current.label }), group === 'conta' && _jsx(Account, { email: email, s: settings }), group === 'preferencias' && _jsx(Preferences, { s: settings }), group === 'saude' && _jsx(HealthProfile, { s: settings }), group === 'notificacoes' && _jsx(NotificationsCard, {}), group === 'conectores' && _jsx(Connectors, { s: settings }), group === 'app' && _jsx(InstallCard, {}), group === 'dados' && _jsx(DataPrivacy, {})] })] })] }));
}
const Card = ({ title, children, label }) => (_jsxs("section", { className: "card", "aria-label": label ?? title, children: [_jsx("div", { className: "label mb-3", children: title }), children] }));
function Account({ email, s }) {
    const [name, setName] = useState('');
    useEffect(() => { if (s.loaded)
        setName(s.row.display_name ?? ''); }, [s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
    const [nameSaved, setNameSaved] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    async function changePassword(e) {
        e.preventDefault();
        if (password !== confirm) {
            setMessage('As senhas não conferem.');
            return;
        }
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        setMessage(error ? `Não foi possível trocar: ${error.message}` : 'Senha trocada.');
        if (!error) {
            setPassword('');
            setConfirm('');
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { title: "Perfil", children: [_jsxs("form", { onSubmit: async (e) => { e.preventDefault(); if (await s.save({ display_name: name.trim() || null }))
                            setNameSaved(true); }, children: [_jsx(Field, { label: "Como quer ser chamado", children: _jsx("input", { className: "input", value: name, onChange: (e) => { setName(e.target.value); setNameSaved(false); }, placeholder: "O assistente usa este nome", maxLength: 60 }) }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { className: "btn-secondary", children: "Salvar nome" }), nameSaved && _jsx("span", { className: "text-sm text-positive", children: "Salvo" })] })] }), _jsxs("div", { className: "mt-4 border-t border-line pt-4 text-sm", children: [_jsx("span", { className: "text-fg3", children: "E-mail de acesso: " }), email] })] }), _jsxs("form", { className: "card", onSubmit: changePassword, "aria-label": "Trocar senha", children: [_jsx("div", { className: "label mb-3", children: "Trocar senha" }), _jsx(Field, { label: "Nova senha", children: _jsx("input", { className: "input", type: "password", minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), required: true, autoComplete: "new-password" }) }), _jsx(Field, { label: "Repita a nova senha", children: _jsx("input", { className: "input", type: "password", minLength: 8, value: confirm, onChange: (e) => setConfirm(e.target.value), required: true, autoComplete: "new-password" }) }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { className: "btn-primary", disabled: busy, children: "Trocar senha" }), message && _jsx("span", { className: "text-sm text-fg2", children: message })] })] }), _jsxs(Card, { title: "Sess\u00F5es", children: [_jsx("p", { className: "mb-3 text-sm text-fg2", children: "Saia s\u00F3 deste aparelho, ou de todos os aparelhos e navegadores onde o Painel est\u00E1 aberto (\u00FAtil se perder o celular)." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { className: "btn-secondary", onClick: () => supabase.auth.signOut(), children: "Sair deste aparelho" }), _jsx("button", { className: "btn-ghost text-negative", onClick: () => { if (window.confirm('Sair de todos os aparelhos? Você precisará entrar de novo em cada um.'))
                                    void supabase.auth.signOut({ scope: 'global' }); }, children: "Sair de todos os aparelhos" })] })] })] }));
}
function Preferences({ s }) {
    const [theme, setTheme] = useState(readTheme());
    const [accent, setAccent] = useState(readAccent());
    const paths = SECTIONS.map((x) => x.path);
    const [start, setStart] = useState(readStart(paths));
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zones = [...new Set([s.row.timezone, deviceTz, ...TIMEZONES])];
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { title: "Apar\u00EAncia", children: [_jsx(FieldGroup, { label: "Tema", children: _jsx("div", { className: "segmented w-fit", children: [['dark', 'Escuro'], ['light', 'Claro']].map(([k, l]) => (_jsx("button", { type: "button", "aria-pressed": theme === k, className: theme === k ? 'tab-active' : 'tab', onClick: () => { applyTheme(k); setTheme(k); }, children: l }, k))) }) }), _jsxs(FieldGroup, { label: "Cor de destaque", children: [_jsx("div", { className: "flex flex-wrap gap-3", role: "group", "aria-label": "Cor de destaque", children: ACCENTS.map((a) => {
                                    const on = accent === a.key;
                                    return (_jsx("button", { type: "button", "aria-pressed": on, "aria-label": a.label, title: a.label, onClick: () => { applyAccent(a.key); setAccent(a.key); }, className: `flex h-11 w-11 items-center justify-center rounded-full transition-[transform,box-shadow] duration-300 ease-out active:scale-90 ${on ? 'scale-100 shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--fg)]' : 'hover:scale-110'}`, style: { background: a.swatch }, children: _jsx(Check, { size: 18, strokeWidth: 3, style: { color: a.tick }, className: `transition-[opacity,transform] duration-300 ${on ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}` }) }, a.key));
                                }) }), _jsx("p", { className: "mt-2 text-xs text-fg3", children: ACCENTS.find((a) => a.key === accent)?.label })] }), _jsx(Field, { label: "Abrir o app em", children: _jsx("select", { className: "input", value: start, onChange: (e) => { setStart(e.target.value); try {
                                localStorage.setItem(START_KEY, e.target.value);
                            }
                            catch { /* this visit only */ } }, children: SECTIONS.filter((x) => x.path !== 'configuracoes').map((x) => _jsx("option", { value: x.path, children: x.label }, x.path)) }) }), _jsx("p", { className: "-mt-2 text-xs text-fg3", children: "Tema, cor de destaque e tela inicial valem para este aparelho." })] }), _jsxs(Card, { title: "Regi\u00E3o", children: [_jsx(Field, { label: "Fuso hor\u00E1rio", children: _jsx("select", { className: "input", value: s.row.timezone, onChange: (e) => void s.save({ timezone: e.target.value }), children: zones.map((z) => _jsxs("option", { value: z, children: [tzLabel(z), z === deviceTz ? ' · este aparelho' : ''] }, z)) }) }), _jsx("p", { className: "-mt-2 mb-4 text-xs text-fg3", children: "Usado pelas notifica\u00E7\u00F5es, pelo Piloto autom\u00E1tico e pelo assistente para saber que dia e hora s\u00E3o para voc\u00EA." }), _jsx(FieldGroup, { label: "Moeda para ver as finan\u00E7as", children: _jsx("div", { className: "segmented w-fit", children: CURRENCIES.map((c) => (_jsxs("button", { type: "button", "aria-pressed": s.row.display_currency === c.code, className: s.row.display_currency === c.code ? 'tab-active' : 'tab', onClick: () => void s.save({ display_currency: c.code }), children: [c.symbol, " ", c.name] }, c.code))) }) }), _jsx("p", { className: "-mt-2 text-xs text-fg3", children: "Os valores ficam guardados em reais e s\u00E3o convertidos pela cota\u00E7\u00E3o do dia. Tamb\u00E9m d\u00E1 para trocar no topo de Finan\u00E7as." })] })] }));
}
function HealthProfile({ s }) {
    const [height, setHeight] = useState('');
    useEffect(() => { if (s.loaded)
        setHeight(s.row.height_cm?.toString() ?? ''); }, [s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
    return (_jsxs(Card, { title: "Perfil de sa\u00FAde", children: [_jsx("p", { className: "mb-4 text-sm text-fg2", children: "Usados no c\u00E1lculo de gordura corporal das avalia\u00E7\u00F5es e no gasto cal\u00F3rico." }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Altura (cm)", children: _jsx("input", { className: "input", type: "number", min: 100, max: 250, value: height, onChange: (e) => setHeight(e.target.value), onBlur: () => { const v = height ? Number(height) : null; if (v !== s.row.height_cm)
                                void s.save({ height_cm: v }); } }) }), _jsx(FieldGroup, { label: "Sexo", children: _jsx("div", { className: "segmented w-fit", children: [['M', 'Masculino'], ['F', 'Feminino']].map(([k, l]) => (_jsx("button", { type: "button", "aria-pressed": s.row.sex === k, className: s.row.sex === k ? 'tab-active' : 'tab', onClick: () => void s.save({ sex: k }), children: l }, k))) }) })] })] }));
}
const STATUS = {
    ok: { label: 'Conectado', tone: 'bg-positive/15 text-positive' },
    off: { label: 'Não configurado', tone: 'bg-negative/15 text-negative' },
    soon: { label: 'Em breve', tone: 'bg-raised text-fg3' },
    checking: { label: 'Verificando…', tone: 'bg-raised text-fg3' },
};
function Connector({ name, status, children }) {
    return (_jsxs("section", { className: "card", "aria-label": name, children: [_jsxs("div", { className: "mb-2 flex items-center gap-2", children: [_jsx("span", { className: "mr-auto font-medium", children: name }), _jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs ${STATUS[status].tone}`, children: STATUS[status].label })] }), _jsx("div", { className: "text-sm text-fg2", children: children })] }));
}
function Connectors({ s }) {
    const [ai, setAi] = useState({ status: 'checking', model: null });
    const [testing, setTesting] = useState(null);
    useEffect(() => {
        void Promise.all([
            supabase.functions.invoke('assistant', { body: { status: true } }),
            supabase.from('chat_messages').select('metadata').eq('is_user', false).not('metadata->>model', 'is', null).order('created_at', { ascending: false }).limit(1),
        ]).then(([st, last]) => {
            const lastModel = last.data?.[0]?.metadata?.model ?? null;
            setAi({ status: st.data?.configured ? 'ok' : 'off', model: st.data?.model ?? lastModel });
        });
    }, []);
    async function testFx() {
        setTesting('Consultando o Banco Central…');
        const { data, error } = await supabase.functions.invoke('fx', { body: {} });
        setTesting(error ? 'Sem resposta das cotações agora.' : `1 US$ = R$ ${String(data.rates.USD).replace('.', ',')} · 1 € = R$ ${String(data.rates.EUR).replace('.', ',')} (${data.source}, ${data.date.split('-').reverse().join('/')}).`);
    }
    return (_jsxs(_Fragment, { children: [_jsxs(Connector, { name: "Assistente de IA (OpenRouter)", status: ai.status, children: [ai.status === 'off'
                        ? _jsx("p", { children: "Salve a chave do OpenRouter no Supabase em Edge Functions \u2192 Secrets, com o nome OPENROUTER_API_KEY." })
                        : (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Usa o modelo escolhido abaixo via OpenRouter com fallback autom\u00E1tico se a conta ficar sem cr\u00E9ditos.", ai.model && _jsxs(_Fragment, { children: [" \u00DAltimo modelo que respondeu: ", _jsx("span", { className: "figure text-fg", children: modelLabel(ai.model) }), "."] })] }), _jsx("div", { className: "mt-4", children: _jsx(Field, { label: "Modelo preferido", children: _jsx("select", { className: "input", value: s.row.assistant_model, onChange: (e) => void s.save({ assistant_model: e.target.value }), children: AI_MODELS.map((m) => (_jsxs("option", { value: m.id, children: [m.label, " \u2014 ", m.note] }, m.id))) }) }) })] })), _jsx("p", { className: "mt-1 text-xs text-fg3", children: "Cr\u00E9ditos e chaves em openrouter.ai, em Settings \u2192 Credits e Keys." })] }), _jsx(AssistantMemories, {}), _jsxs(Connector, { name: "Cota\u00E7\u00F5es (Banco Central do Brasil)", status: "ok", children: [_jsx("p", { children: "D\u00F3lar e euro pela PTAX, sem cadastro. Reserva: Banco Central Europeu." }), _jsx("button", { className: "btn-ghost -ml-2 mt-2", onClick: testFx, children: "Testar agora" }), testing && _jsx("p", { className: "mt-1 text-xs text-fg3", role: "status", children: testing })] }), _jsx(Connector, { name: "Alimentos (TACO, CoFID e Open Food Facts)", status: "ok", children: _jsx("p", { children: "Tabelas brasileira (TACO) e brit\u00E2nica (CoFID) embutidas; produtos de marca buscados no Open Food Facts." }) }), _jsx(GoogleCalendar, {})] }));
}
const MEM_CATS = ['preferencia', 'rotina', 'financas', 'saude', 'projetos', 'aprendizado'];
function AssistantMemories() {
    const [rows, setRows] = useState([]);
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('preferencia');
    const [busy, setBusy] = useState(false);
    async function load() {
        const { data } = await supabase.from('assistant_memories').select('id,category,content,source').order('updated_at', { ascending: false }).limit(50);
        setRows((data ?? []));
    }
    useEffect(() => { void load(); }, []);
    async function add(e) {
        e.preventDefault();
        const text = content.trim();
        if (!text || busy)
            return;
        setBusy(true);
        const ok = await write(supabase.from('assistant_memories').insert({ category, content: text, source: 'user' }));
        setBusy(false);
        if (ok) {
            setContent('');
            void load();
        }
    }
    async function remove(id) {
        if (await write(supabase.from('assistant_memories').delete().eq('id', id))) {
            setRows((list) => list.filter((r) => r.id !== id));
        }
    }
    return (_jsxs(Card, { title: "Mem\u00F3ria e aprendizado do Assistente", children: [_jsx("p", { className: "mb-4 text-sm text-fg2", children: "O Assistente aprende suas regras e rotina ao conversar e tamb\u00E9m segue tudo o que voc\u00EA cadastrar aqui." }), _jsx("form", { onSubmit: add, className: "mb-4 space-y-2", children: _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("select", { className: "input w-36 shrink-0", "aria-label": "Categoria da mem\u00F3ria", value: category, onChange: (e) => setCategory(e.target.value), children: MEM_CATS.map((c) => _jsx("option", { value: c, children: c }, c)) }), _jsx("input", { className: "input min-w-0 flex-1", value: content, onChange: (e) => setContent(e.target.value), placeholder: "Ex.: Gastos em euro padr\u00E3o v\u00E3o na conta Revolut", maxLength: 400 }), _jsx("button", { className: "btn-secondary shrink-0", disabled: busy || !content.trim(), children: "Ensinar" })] }) }), rows.length === 0 ? (_jsx("p", { className: "text-xs text-fg3", children: "Nenhuma mem\u00F3ria salva ainda. Ensine uma regra acima ou conte no chat." })) : (_jsx("ul", { className: "divide-y divide-line", children: rows.map((m) => (_jsxs("li", { className: "flex items-start gap-2.5 py-2.5 text-sm", children: [_jsx("span", { className: "badge bg-raised text-fg3", children: m.category }), _jsx("span", { className: "min-w-0 flex-1 text-fg", children: m.content }), _jsx("button", { type: "button", className: "icon-btn h-7 w-7 shrink-0", onClick: () => void remove(m.id), "aria-label": `Esquecer: ${m.content}`, children: _jsx(Trash2, { size: 14, strokeWidth: 1.6, "aria-hidden": "true" }) })] }, m.id))) }))] }));
}
function DataPrivacy() {
    const [progress, setProgress] = useState(null);
    async function exportAll() {
        const out = {};
        for (const [i, table] of EXPORT_TABLES.entries()) {
            setProgress(`Lendo ${i + 1} de ${EXPORT_TABLES.length}: ${table}`);
            const rows = [];
            for (let from = 0;; from += 1000) {
                let q = supabase.from(table).select('*').range(from, from + 999);
                if (OWN_ROWS_ONLY.includes(table))
                    q = q.not('user_id', 'is', null);
                const { data, error } = await q;
                if (error) {
                    rows.push({ erro: error.message });
                    break;
                }
                rows.push(...(data ?? []));
                if (!data || data.length < 1000)
                    break;
            }
            out[table] = rows;
        }
        const total = Object.values(out).reduce((n, r) => n + r.length, 0);
        const blob = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), tabelas: out }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = exportFileName(new Date());
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        setProgress(`Pronto: ${total} registros em ${a.download}. As fotos ficam no armazenamento; o arquivo traz o caminho de cada uma.`);
    }
    async function clearChat() {
        if (!confirm('Apagar toda a conversa com o assistente, incluindo os resumos do Piloto automático? O que ele criou (tarefas, notas, gastos) continua.'))
            return;
        const { data } = await supabase.auth.getSession();
        if (data.session && await write(supabase.from('chat_messages').delete().eq('user_id', data.session.user.id)))
            setProgress('Conversa apagada.');
    }
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { title: "Exportar meus dados", children: [_jsx("p", { className: "mb-3 text-sm text-fg2", children: "Baixe tudo o que est\u00E1 no Painel num arquivo JSON: tarefas, h\u00E1bitos, finan\u00E7as, sa\u00FAde, notas, metas, projetos, conversas e configura\u00E7\u00F5es." }), _jsxs("button", { className: "btn-primary", onClick: () => void exportAll(), disabled: !!progress && progress.startsWith('Lendo'), children: [_jsx(Download, { size: 16, strokeWidth: 1.5 }), "Exportar tudo"] }), progress && _jsx("p", { className: "mt-3 text-sm text-fg2", role: "status", children: progress })] }), _jsxs(Card, { title: "Assistente", children: [_jsx("p", { className: "mb-3 text-sm text-fg2", children: "A conversa fica guardada para o assistente lembrar do contexto. Voc\u00EA pode apag\u00E1-la quando quiser." }), _jsxs("button", { className: "btn-ghost -ml-2 text-negative", onClick: () => void clearChat(), children: [_jsx(Trash2, { size: 16, strokeWidth: 1.5 }), "Apagar a conversa"] })] }), _jsxs(Card, { title: "Onde ficam seus dados", children: [_jsx("p", { className: "text-sm text-fg2", children: "No seu projeto do Supabase (regi\u00E3o S\u00E3o Paulo), com acesso s\u00F3 pela sua conta. Fotos de corpo e refei\u00E7\u00F5es ficam em pastas privadas. A chave do OpenRouter fica nos segredos do Supabase e nunca vai para o navegador." }), _jsxs("p", { className: "mt-2 flex items-center gap-1.5 text-xs text-fg3", children: [_jsx(Bot, { size: 12, strokeWidth: 1.5 }), "O assistente s\u00F3 envia ao OpenRouter o necess\u00E1rio para responder cada pedido."] })] })] }));
}
const when = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Connect, see how the last sync went, sync now, disconnect. */
function GoogleCalendar() {
    const [params, setParams] = useSearchParams();
    const [acc, setAcc] = useState(undefined);
    const [busy, setBusy] = useState(null);
    const [message, setMessage] = useState(() => {
        const r = params.get('google');
        if (r === 'ok')
            return 'Google Agenda conectado. Seus eventos já estão na Agenda do Painel.';
        if (r === 'recusado')
            return 'A conexão foi cancelada na tela do Google.';
        if (r === 'erro')
            return `Não deu para conectar: ${params.get('motivo') ?? 'erro desconhecido'}.`;
        return null;
    });
    async function load() {
        const { data } = await supabase.from('google_accounts').select('email,connected_at,last_sync_at,last_error,last_result').maybeSingle();
        setAcc(data ?? null);
    }
    useEffect(() => {
        void load();
        // The result of the Google sign-in came in the address: shown once, then cleared.
        if (params.get('google'))
            setParams({ secao: 'conectores' }, { replace: true });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    async function connect() {
        setBusy('Abrindo o Google…');
        const { data, error } = await supabase.functions.invoke('gcal', { body: { action: 'auth_url' } });
        if (error || !data?.url) {
            setBusy(null);
            setMessage('Não deu para iniciar a conexão agora.');
            return;
        }
        window.location.assign(data.url);
    }
    async function syncNow() {
        setBusy('Sincronizando…');
        const { data, error } = await supabase.functions.invoke('gcal', { body: { action: 'sync' } });
        setBusy(null);
        setMessage(error || data?.error ? `A sincronização falhou: ${data?.error ?? 'sem resposta'}` : 'Sincronizado.');
        await load();
    }
    async function disconnect() {
        if (!window.confirm('Desconectar o Google Agenda? Os eventos que vieram do Google saem do Painel; os compromissos criados aqui ficam.'))
            return;
        setBusy('Desconectando…');
        await supabase.functions.invoke('gcal', { body: { action: 'disconnect' } });
        setBusy(null);
        setMessage('Google Agenda desconectado.');
        await load();
    }
    const r = acc?.last_result;
    const summary = r ? [
        r.trazidos ? `${r.trazidos} trazidos` : null, r.enviados ? `${r.enviados} enviados` : null,
        Number(r.atualizados_aqui) + Number(r.atualizados_no_google) ? `${Number(r.atualizados_aqui) + Number(r.atualizados_no_google)} atualizados` : null,
        Number(r.apagados_aqui) + Number(r.apagados_no_google) ? `${Number(r.apagados_aqui) + Number(r.apagados_no_google)} apagados` : null,
    ].filter(Boolean).join(', ') || 'nada mudou' : null;
    return (_jsxs(Connector, { name: "Google Agenda", status: acc === undefined ? 'checking' : acc ? (acc.last_error ? 'off' : 'ok') : 'off', children: [acc === null && (_jsxs(_Fragment, { children: [_jsx("p", { children: "Seus eventos do Google aparecem na Agenda do Painel, e os compromissos criados aqui v\u00E3o para o Google. Edi\u00E7\u00F5es e exclus\u00F5es valem dos dois lados." }), _jsx("button", { className: "btn-primary mt-3", disabled: !!busy, onClick: () => void connect(), children: "Conectar com o Google" }), _jsx("p", { className: "mt-2 text-xs text-fg3", children: "O Google vai avisar que o app n\u00E3o foi verificado: em uso pessoal, toque em Avan\u00E7ado \u2192 Acessar Painel." })] })), acc && (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Conectado como ", _jsx("span", { className: "text-fg", children: acc.email ?? 'sua conta' }), "."] }), _jsxs("p", { className: "mt-1 text-xs text-fg3", children: [acc.last_sync_at ? `Última sincronização: ${when(acc.last_sync_at)}${summary ? ` · ${summary}` : ''}` : 'Ainda não sincronizou', ' · ', "a cada 5 minutos, e na hora quando voc\u00EA salva um compromisso."] }), acc.last_error && _jsx("p", { className: "mt-2 text-sm text-negative", role: "alert", children: acc.last_error }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [acc.last_error?.includes('Conecte de novo')
                                ? _jsx("button", { className: "btn-primary", disabled: !!busy, onClick: () => void connect(), children: "Conectar de novo" })
                                : _jsx("button", { className: "btn-secondary", disabled: !!busy, onClick: () => void syncNow(), children: "Sincronizar agora" }), _jsx("button", { className: "btn-ghost text-negative", disabled: !!busy, onClick: () => void disconnect(), children: "Desconectar" })] })] })), (busy || message) && _jsx("p", { className: "mt-2 text-xs text-fg2", role: "status", children: busy ?? message })] }));
}
