import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

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
    else if (mode === 'signup') setMessage('Conta criada. Confirme pelo e-mail, se o seu projeto exigir, e entre.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Painel</h1>
        <p className="mb-4 text-sm text-slate-500">{mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}</p>
        <input className="input mb-2" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input mb-4" type="password" placeholder="senha" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <button className="btn-primary w-full justify-center" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
        <button type="button" className="mt-4 text-sm text-sky-700 underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Criar uma conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
