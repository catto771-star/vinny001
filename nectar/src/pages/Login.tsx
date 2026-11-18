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
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="enter w-full max-w-sm rounded-[20px] border border-line bg-surface p-6">
        <div className="mb-6 flex items-center gap-2">
          <Mark size={22} />
          <span className="text-[17px] font-medium">Painel</span>
        </div>
        <h1 className="mb-1 text-xl font-medium">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mb-5 text-sm text-fg3">Treino, dieta, tarefas e hábitos num lugar só</p>
        <Field label="E-mail"><input className="input" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
        <Field label="Senha"><input className="input" type="password" placeholder="senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
        <button className="btn-primary h-10 w-full" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        {message && <p className="mt-3 text-sm text-fg2">{message}</p>}
        <button type="button" className="mt-4 text-sm text-fg2 underline-offset-4 hover:text-fg hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Criar uma conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
