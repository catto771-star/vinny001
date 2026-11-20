import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Mark } from '../components/Layout';
import { Field } from '../components/ui';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === 'signup') setMessage('Conta criada. Confirme pelo e-mail, se o seu projeto exigir, e entre');
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:gap-16 md:px-10">
      <div className="enter">
        <div className="mb-8 flex items-center gap-2">
          <Mark size={22} />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Painel</span>
        </div>
        <p className="display max-w-[14ch]">Treino, dieta, tarefas e dinheiro num lugar só.</p>
        <p className="mt-4 max-w-sm text-[15px] text-fg2">Registre em segundos; o placar do dia se monta sozinho.</p>
      </div>
      <form onSubmit={submit} className="card enter w-full p-6 md:p-8" style={{ animationDelay: '80ms' }}>
        <h1 className="mb-1 text-2xl font-semibold tracking-[-0.02em]">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mb-6 text-sm text-fg3">{mode === 'login' ? 'Bem-vindo de volta.' : 'Leva menos de um minuto.'}</p>
        <Field label="E-mail"><input className="input" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <Field label="Senha"><input className="input" type="password" placeholder="senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
        <button className="btn-primary mt-2 h-12 w-full text-[15px] md:h-11" disabled={busy}>{busy ? (mode === 'login' ? 'Entrando…' : 'Criando…') : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        {message && <p className="mt-3 text-sm text-fg2" role="status">{message}</p>}
        <button type="button" className="mt-5 text-sm text-fg2 underline-offset-4 hover:text-fg hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Criar uma conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
