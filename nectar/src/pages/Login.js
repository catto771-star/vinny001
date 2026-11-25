import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mark } from '../components/Layout';
import { Field } from '../components/ui';
export default function Login() {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        const { error } = mode === 'login'
            ? await supabase.auth.signInWithPassword({ email, password })
            : await supabase.auth.signUp({ email, password });
        setBusy(false);
        if (error)
            setMessage(error.message);
        else if (mode === 'signup')
            setMessage('Conta criada. Confirme pelo e-mail, se o seu projeto exigir, e entre');
    }
    return (_jsxs("div", { className: "mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:gap-16 md:px-10", children: [_jsxs("div", { className: "enter", children: [_jsxs("div", { className: "mb-8 flex items-center gap-2", children: [_jsx(Mark, { size: 22 }), _jsx("span", { className: "text-[17px] font-semibold tracking-[-0.02em]", children: "Painel" })] }), _jsx("p", { className: "display max-w-[14ch]", children: "Treino, dieta, tarefas e dinheiro num lugar s\u00F3." }), _jsx("p", { className: "mt-4 max-w-sm text-[15px] text-fg2", children: "Registre em segundos; o placar do dia se monta sozinho." })] }), _jsxs("form", { onSubmit: submit, className: "card enter w-full p-6 md:p-8", style: { animationDelay: '80ms' }, children: [_jsx("h1", { className: "mb-1 text-2xl font-semibold tracking-[-0.02em]", children: mode === 'login' ? 'Entrar' : 'Criar conta' }), _jsx("p", { className: "mb-6 text-sm text-fg3", children: mode === 'login' ? 'Bem-vindo de volta.' : 'Leva menos de um minuto.' }), _jsx(Field, { label: "E-mail", children: _jsx("input", { className: "input", type: "email", placeholder: "seu@email.com", value: email, onChange: (e) => setEmail(e.target.value), required: true, autoComplete: "email" }) }), _jsx(Field, { label: "Senha", children: _jsx("input", { className: "input", type: "password", placeholder: "senha", value: password, onChange: (e) => setPassword(e.target.value), required: true, minLength: 6, autoComplete: mode === 'login' ? 'current-password' : 'new-password' }) }), _jsx("button", { className: "btn-primary mt-2 h-12 w-full text-[15px] md:h-11", disabled: busy, children: busy ? (mode === 'login' ? 'Entrando…' : 'Criando…') : mode === 'login' ? 'Entrar' : 'Criar conta' }), message && _jsx("p", { className: "mt-3 text-sm text-fg2", role: "status", children: message }), _jsx("button", { type: "button", className: "mt-5 text-sm text-fg2 underline-offset-4 hover:text-fg hover:underline", onClick: () => setMode(mode === 'login' ? 'signup' : 'login'), children: mode === 'login' ? 'Criar uma conta' : 'Já tenho conta' })] })] }));
}
