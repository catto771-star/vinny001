import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Field, PageHeader } from '../components/ui';
import { InstallCard, NotificationsCard } from './NotificationSettings';

export default function Settings({ email }: { email: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: FormEvent) {
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

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid max-w-xl gap-6">
        <InstallCard />
        <NotificationsCard />
        <section className="card">
          <div className="label mb-2">Conta</div>
          <p className="mb-4 text-sm">{email}</p>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </section>
        <form className="card" onSubmit={changePassword}>
          <div className="label mb-3">Trocar senha</div>
          <Field label="Nova senha">
            <input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Repita a nova senha">
            <input className="input" type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </Field>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={busy}>Trocar senha</button>
            {message && <span className="text-sm text-fg2">{message}</span>}
          </div>
        </form>
      </div>
    </>
  );
}
