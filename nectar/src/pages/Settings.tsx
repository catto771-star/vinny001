import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Bot, Database, Download, HeartPulse, Plug, SlidersHorizontal, Smartphone, Trash2, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { write } from '../lib/useTable';
import { applyTheme, readTheme, type Theme } from '../lib/theme';
import { CURRENCIES, type Currency } from '../lib/money';
import { EXPORT_TABLES, OWN_ROWS_ONLY, START_KEY, TIMEZONES, exportFileName, readStart, tzLabel } from '../lib/prefs';
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
] as const;
type Group = (typeof GROUPS)[number]['key'];

interface Row { display_name: string | null; timezone: string; display_currency: Currency; height_cm: number | null; sex: 'M' | 'F' | null }
const EMPTY: Row = { display_name: null, timezone: 'America/Sao_Paulo', display_currency: 'BRL', height_cm: null, sex: null };

/** The settings row of the signed-in user, read once and saved field by field. */
function useSettingsRow() {
  const [row, setRow] = useState<Row>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void supabase.from('user_settings').select('display_name,timezone,display_currency,height_cm,sex').maybeSingle().then(({ data }) => {
      if (data) setRow({ ...EMPTY, ...data } as Row);
      setLoaded(true);
    });
  }, []);
  async function save(patch: Partial<Row>) {
    setRow((r) => ({ ...r, ...patch }));
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    return uid ? write(supabase.from('user_settings').upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' })) : false;
  }
  return { row, loaded, save };
}

export default function Settings({ email }: { email: string }) {
  const [params, setParams] = useSearchParams();
  const group = (GROUPS.some((g) => g.key === params.get('secao')) ? params.get('secao') : 'conta') as Group;
  const settings = useSettingsRow();
  const current = GROUPS.find((g) => g.key === group)!;
  // On phones the sections are a row that scrolls: keep the current one in view.
  const nav = useRef<HTMLElement>(null);
  useEffect(() => { nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [group]);

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav ref={nav} aria-label="Seções de configuração" className="-mx-1 flex gap-1 overflow-x-auto pb-1 md:mx-0 md:block md:space-y-0.5 md:overflow-visible">
          {GROUPS.map(({ key, label, icon: Icon }) => (
            <button
              key={key} aria-current={key === group ? 'page' : undefined} onClick={() => setParams({ secao: key })}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors duration-150 md:w-full ${key === group ? 'bg-raised text-fg' : 'text-fg2 hover:bg-raised/50 hover:text-fg'}`}
            >
              <Icon size={16} strokeWidth={1.5} className={key === group ? 'text-brand' : 'text-fg3'} />{label}
            </button>
          ))}
        </nav>
        <div className="grid max-w-2xl content-start gap-6" aria-label={current.label}>
          <h2 className="text-lg font-medium md:hidden">{current.label}</h2>
          {group === 'conta' && <Account email={email} s={settings} />}
          {group === 'preferencias' && <Preferences s={settings} />}
          {group === 'saude' && <HealthProfile s={settings} />}
          {group === 'notificacoes' && <NotificationsCard />}
          {group === 'conectores' && <Connectors />}
          {group === 'app' && <InstallCard />}
          {group === 'dados' && <DataPrivacy />}
        </div>
      </div>
    </>
  );
}

type S = ReturnType<typeof useSettingsRow>;
const Card = ({ title, children, label }: { title: string; children: ReactNode; label?: string }) => (
  <section className="card" aria-label={label ?? title}><div className="label mb-3">{title}</div>{children}</section>
);

function Account({ email, s }: { email: string; s: S }) {
  const [name, setName] = useState('');
  useEffect(() => { if (s.loaded) setName(s.row.display_name ?? ''); }, [s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nameSaved, setNameSaved] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMessage('As senhas não conferem.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    setMessage(error ? `Não foi possível trocar: ${error.message}` : 'Senha trocada.');
    if (!error) { setPassword(''); setConfirm(''); }
  }

  return (
    <>
      <Card title="Perfil">
        <form onSubmit={async (e) => { e.preventDefault(); if (await s.save({ display_name: name.trim() || null })) setNameSaved(true); }}>
          <Field label="Como quer ser chamado"><input className="input" value={name} onChange={(e) => { setName(e.target.value); setNameSaved(false); }} placeholder="O assistente usa este nome" maxLength={60} /></Field>
          <div className="flex items-center gap-3">
            <button className="btn-secondary">Salvar nome</button>
            {nameSaved && <span className="text-sm text-positive">Salvo</span>}
          </div>
        </form>
        <div className="mt-4 border-t border-line pt-4 text-sm"><span className="text-fg3">E-mail de acesso: </span>{email}</div>
      </Card>
      <form className="card" onSubmit={changePassword} aria-label="Trocar senha">
        <div className="label mb-3">Trocar senha</div>
        <Field label="Nova senha"><input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" /></Field>
        <Field label="Repita a nova senha"><input className="input" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></Field>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy}>Trocar senha</button>
          {message && <span className="text-sm text-fg2">{message}</span>}
        </div>
      </form>
      <Card title="Sessões">
        <p className="mb-3 text-sm text-fg2">Saia só deste aparelho, ou de todos os aparelhos e navegadores onde o Painel está aberto (útil se perder o celular).</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>Sair deste aparelho</button>
          <button className="btn-ghost text-negative" onClick={() => { if (window.confirm('Sair de todos os aparelhos? Você precisará entrar de novo em cada um.')) void supabase.auth.signOut({ scope: 'global' }); }}>Sair de todos os aparelhos</button>
        </div>
      </Card>
    </>
  );
}

function Preferences({ s }: { s: S }) {
  const [theme, setTheme] = useState<Theme>(readTheme());
  const paths = SECTIONS.map((x) => x.path);
  const [start, setStart] = useState(readStart(paths));
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [...new Set([s.row.timezone, deviceTz, ...TIMEZONES])];
  return (
    <>
      <Card title="Aparência">
        <FieldGroup label="Tema">
          <div className="segmented w-fit">
            {([['dark', 'Escuro'], ['light', 'Claro']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={theme === k} className={theme === k ? 'tab-active' : 'tab'} onClick={() => { applyTheme(k); setTheme(k); }}>{l}</button>
            ))}
          </div>
        </FieldGroup>
        <Field label="Abrir o app em">
          <select className="input" value={start} onChange={(e) => { setStart(e.target.value); try { localStorage.setItem(START_KEY, e.target.value); } catch { /* this visit only */ } }}>
            {SECTIONS.filter((x) => x.path !== 'configuracoes').map((x) => <option key={x.path} value={x.path}>{x.label}</option>)}
          </select>
        </Field>
        <p className="-mt-2 text-xs text-fg3">Tema e tela inicial valem para este aparelho.</p>
      </Card>
      <Card title="Região">
        <Field label="Fuso horário">
          <select className="input" value={s.row.timezone} onChange={(e) => void s.save({ timezone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{tzLabel(z)}{z === deviceTz ? ' · este aparelho' : ''}</option>)}
          </select>
        </Field>
        <p className="-mt-2 mb-4 text-xs text-fg3">Usado pelas notificações, pelo Piloto automático e pelo assistente para saber que dia e hora são para você.</p>
        <FieldGroup label="Moeda para ver as finanças">
          <div className="segmented w-fit">
            {CURRENCIES.map((c) => (
              <button key={c.code} type="button" aria-pressed={s.row.display_currency === c.code} className={s.row.display_currency === c.code ? 'tab-active' : 'tab'} onClick={() => void s.save({ display_currency: c.code })}>{c.symbol} {c.name}</button>
            ))}
          </div>
        </FieldGroup>
        <p className="-mt-2 text-xs text-fg3">Os valores ficam guardados em reais e são convertidos pela cotação do dia. Também dá para trocar no topo de Finanças.</p>
      </Card>
    </>
  );
}

function HealthProfile({ s }: { s: S }) {
  const [height, setHeight] = useState('');
  useEffect(() => { if (s.loaded) setHeight(s.row.height_cm?.toString() ?? ''); }, [s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title="Perfil de saúde">
      <p className="mb-4 text-sm text-fg2">Usados no cálculo de gordura corporal das avaliações e no gasto calórico.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Altura (cm)">
          <input className="input" type="number" min={100} max={250} value={height} onChange={(e) => setHeight(e.target.value)}
            onBlur={() => { const v = height ? Number(height) : null; if (v !== s.row.height_cm) void s.save({ height_cm: v }); }} />
        </Field>
        <FieldGroup label="Sexo">
          <div className="segmented w-fit">
            {([['M', 'Masculino'], ['F', 'Feminino']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={s.row.sex === k} className={s.row.sex === k ? 'tab-active' : 'tab'} onClick={() => void s.save({ sex: k })}>{l}</button>
            ))}
          </div>
        </FieldGroup>
      </div>
    </Card>
  );
}

type Status = 'ok' | 'off' | 'soon' | 'checking';
const STATUS: Record<Status, { label: string; tone: string }> = {
  ok: { label: 'Conectado', tone: 'bg-positive/15 text-positive' },
  off: { label: 'Não configurado', tone: 'bg-negative/15 text-negative' },
  soon: { label: 'Em breve', tone: 'bg-raised text-fg3' },
  checking: { label: 'Verificando…', tone: 'bg-raised text-fg3' },
};

function Connector({ name, status, children }: { name: string; status: Status; children: ReactNode }) {
  return (
    <section className="card" aria-label={name}>
      <div className="mb-2 flex items-center gap-2">
        <span className="mr-auto font-medium">{name}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS[status].tone}`}>{STATUS[status].label}</span>
      </div>
      <div className="text-sm text-fg2">{children}</div>
    </section>
  );
}

function Connectors() {
  const [ai, setAi] = useState<{ status: Status; model: string | null }>({ status: 'checking', model: null });
  const [testing, setTesting] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      supabase.functions.invoke('assistant', { body: { status: true } }),
      supabase.from('chat_messages').select('metadata').eq('is_user', false).not('metadata->>model', 'is', null).order('created_at', { ascending: false }).limit(1),
    ]).then(([st, last]) => {
      const lastModel = (last.data?.[0]?.metadata as { model?: string } | undefined)?.model ?? null;
      setAi({ status: st.data?.configured ? 'ok' : 'off', model: st.data?.model ?? lastModel });
    });
  }, []);
  async function testFx() {
    setTesting('Consultando o Banco Central…');
    const { data, error } = await supabase.functions.invoke('fx', { body: {} });
    setTesting(error ? 'Sem resposta das cotações agora.' : `1 US$ = R$ ${String(data.rates.USD).replace('.', ',')} · 1 € = R$ ${String(data.rates.EUR).replace('.', ',')} (${data.source}, ${data.date.split('-').reverse().join('/')}).`);
  }
  return (
    <>
      <Connector name="Assistente de IA (OpenRouter)" status={ai.status}>
        {ai.status === 'off'
          ? <p>Salve a chave do OpenRouter no Supabase em Edge Functions → Secrets, com o nome OPENROUTER_API_KEY.</p>
          : <p>Usa o DeepSeek quando há crédito na conta do OpenRouter e modelos gratuitos quando não há.{ai.model && <> Último modelo que respondeu: <span className="figure text-fg">{ai.model}</span>.</>}</p>}
        <p className="mt-2 text-xs text-fg3">Créditos e chaves em openrouter.ai, em Settings → Credits e Keys.</p>
      </Connector>
      <Connector name="Cotações (Banco Central do Brasil)" status="ok">
        <p>Dólar e euro pela PTAX, sem cadastro. Reserva: Banco Central Europeu.</p>
        <button className="btn-ghost -ml-2 mt-2" onClick={testFx}>Testar agora</button>
        {testing && <p className="mt-1 text-xs text-fg3" role="status">{testing}</p>}
      </Connector>
      <Connector name="Alimentos (TACO, CoFID e Open Food Facts)" status="ok">
        <p>Tabelas brasileira (TACO) e britânica (CoFID) embutidas; produtos de marca buscados no Open Food Facts.</p>
      </Connector>
      <GoogleCalendar />
    </>
  );
}

function DataPrivacy() {
  const [progress, setProgress] = useState<string | null>(null);
  async function exportAll() {
    const out: Record<string, unknown[]> = {};
    for (const [i, table] of EXPORT_TABLES.entries()) {
      setProgress(`Lendo ${i + 1} de ${EXPORT_TABLES.length}: ${table}`);
      const rows: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase.from(table).select('*').range(from, from + 999);
        if (OWN_ROWS_ONLY.includes(table)) q = q.not('user_id', 'is', null);
        const { data, error } = await q;
        if (error) { rows.push({ erro: error.message }); break; }
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
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
    if (!confirm('Apagar toda a conversa com o assistente, incluindo os resumos do Piloto automático? O que ele criou (tarefas, notas, gastos) continua.')) return;
    const { data } = await supabase.auth.getSession();
    if (data.session && await write(supabase.from('chat_messages').delete().eq('user_id', data.session.user.id))) setProgress('Conversa apagada.');
  }
  return (
    <>
      <Card title="Exportar meus dados">
        <p className="mb-3 text-sm text-fg2">Baixe tudo o que está no Painel num arquivo JSON: tarefas, hábitos, finanças, saúde, notas, metas, projetos, conversas e configurações.</p>
        <button className="btn-primary" onClick={() => void exportAll()} disabled={!!progress && progress.startsWith('Lendo')}><Download size={16} strokeWidth={1.5} />Exportar tudo</button>
        {progress && <p className="mt-3 text-sm text-fg2" role="status">{progress}</p>}
      </Card>
      <Card title="Assistente">
        <p className="mb-3 text-sm text-fg2">A conversa fica guardada para o assistente lembrar do contexto. Você pode apagá-la quando quiser.</p>
        <button className="btn-ghost -ml-2 text-negative" onClick={() => void clearChat()}><Trash2 size={16} strokeWidth={1.5} />Apagar a conversa</button>
      </Card>
      <Card title="Onde ficam seus dados">
        <p className="text-sm text-fg2">No seu projeto do Supabase (região São Paulo), com acesso só pela sua conta. Fotos de corpo e refeições ficam em pastas privadas. A chave do OpenRouter fica nos segredos do Supabase e nunca vai para o navegador.</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fg3"><Bot size={12} strokeWidth={1.5} />O assistente só envia ao OpenRouter o necessário para responder cada pedido.</p>
      </Card>
    </>
  );
}

interface GoogleStatus { email: string | null; connected_at: string; last_sync_at: string | null; last_error: string | null; last_result: Record<string, number | boolean> | null }

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Connect, see how the last sync went, sync now, disconnect. */
function GoogleCalendar() {
  const [params, setParams] = useSearchParams();
  const [acc, setAcc] = useState<GoogleStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(() => {
    const r = params.get('google');
    if (r === 'ok') return 'Google Agenda conectado. Seus eventos já estão na Agenda do Painel.';
    if (r === 'recusado') return 'A conexão foi cancelada na tela do Google.';
    if (r === 'erro') return `Não deu para conectar: ${params.get('motivo') ?? 'erro desconhecido'}.`;
    return null;
  });
  async function load() {
    const { data } = await supabase.from('google_accounts').select('email,connected_at,last_sync_at,last_error,last_result').maybeSingle();
    setAcc((data as GoogleStatus | null) ?? null);
  }
  useEffect(() => {
    void load();
    // The result of the Google sign-in came in the address: shown once, then cleared.
    if (params.get('google')) setParams({ secao: 'conectores' }, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setBusy('Abrindo o Google…');
    const { data, error } = await supabase.functions.invoke('gcal', { body: { action: 'auth_url' } });
    if (error || !data?.url) { setBusy(null); setMessage('Não deu para iniciar a conexão agora.'); return; }
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
    if (!window.confirm('Desconectar o Google Agenda? Os eventos que vieram do Google saem do Painel; os compromissos criados aqui ficam.')) return;
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

  return (
    <Connector name="Google Agenda" status={acc === undefined ? 'checking' : acc ? (acc.last_error ? 'off' : 'ok') : 'off'}>
      {acc === null && (
        <>
          <p>Seus eventos do Google aparecem na Agenda do Painel, e os compromissos criados aqui vão para o Google. Edições e exclusões valem dos dois lados.</p>
          <button className="btn-primary mt-3" disabled={!!busy} onClick={() => void connect()}>Conectar com o Google</button>
          <p className="mt-2 text-xs text-fg3">O Google vai avisar que o app não foi verificado: em uso pessoal, toque em Avançado → Acessar Painel.</p>
        </>
      )}
      {acc && (
        <>
          <p>Conectado como <span className="text-fg">{acc.email ?? 'sua conta'}</span>.</p>
          <p className="mt-1 text-xs text-fg3">
            {acc.last_sync_at ? `Última sincronização: ${when(acc.last_sync_at)}${summary ? ` · ${summary}` : ''}` : 'Ainda não sincronizou'}
            {' · '}a cada 5 minutos, e na hora quando você salva um compromisso.
          </p>
          {acc.last_error && <p className="mt-2 text-sm text-negative" role="alert">{acc.last_error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {acc.last_error?.includes('Conecte de novo')
              ? <button className="btn-primary" disabled={!!busy} onClick={() => void connect()}>Conectar de novo</button>
              : <button className="btn-secondary" disabled={!!busy} onClick={() => void syncNow()}>Sincronizar agora</button>}
            <button className="btn-ghost text-negative" disabled={!!busy} onClick={() => void disconnect()}>Desconectar</button>
          </div>
        </>
      )}
      {(busy || message) && <p className="mt-2 text-xs text-fg2" role="status">{busy ?? message}</p>}
    </Connector>
  );
}
