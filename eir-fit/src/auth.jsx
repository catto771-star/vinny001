import React, { useState } from "react";
import { Activity, ArrowRight } from "lucide-react";
import { api } from "./api";
import { t } from "./i18n";
export function Auth({
  onLogin,
  languagePicker
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(t("")),
    [busy, setBusy] = useState(false);
  return <div className="auth-page">
      <div className="auth-language">{languagePicker}</div>
      <section className="auth-story">
        <a className="brand">
          <span className="brand-icon">
            <Activity />
          </span>
          eir fit.
        </a>
        <div>
          <span className="eyebrow">{" "}{t("TREINO. NUTRIÇÃO. EVOLUÇÃO.")}{" "}</span>
          <h1>
            {" "}{t("Seu próximo nível.")}{" "}
            <br />
            {" "}{t("Com as pessoas certas.")}{" "}
          </h1>
          <p>
            {" "}{t("Planos feitos para você.")}{" "}
            <br />
            {" "}{t("Profissionais que acompanham sua jornada.")}{" "}
          </p>
        </div>
        <span>{" "}{t("Um passo de cada vez. Juntos.")}{" "}</span>
      </section>
      <section className="auth-form">
        <div>
          <span className="eyebrow">{" "}{t("BEM-VINDO À EIR FIT")}{" "}</span>
          <h2>{register ? t("Comece sua jornada.") : t("Bom ter você de volta.")}</h2>
          <p className="muted">
            {register ? t("Crie sua conta. Alunos vinculam seus planos pelo convite do profissional.") : t("Entre para acessar seus planos e seu acompanhamento.")}
          </p>
          <form onSubmit={async e => {
          e.preventDefault();
          setError(t(""));
          setBusy(true);
          const f = Object.fromEntries(new FormData(e.target));
          try {
            if (register) await api("/auth/register", f);
            const r = await api("/auth/login", {
              email: f.email,
              password: f.password
            });
            onLogin(r.user);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}>
            {register && <label>
                {" "}{t("Nome completo")}{" "}
                <input name="name" required maxLength={200} autoComplete="name" />
              </label>}
            <label>
              {" "}{t("E-mail")}{" "}
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <label>
              {" "}{t("Senha")}{" "}
              <input type="password" name="password" required minLength={12} maxLength={128} autoComplete={register ? "new-password" : "current-password"} />
              <small>{" "}{t("Mínimo de 12 caracteres.")}{" "}</small>
            </label>
            {register && <label>
                {" "}{t("Seu perfil")}{" "}
                <select name="role" defaultValue={location.hash.startsWith("#invite=") ? "student" : "trainer"}>
                  <option value="student">{" "}{t("Aluno")}{" "}</option>
                  <option value="trainer">{" "}{t("Personal trainer")}{" "}</option>
                  <option value="nutritionist">{" "}{t("Nutricionista")}{" "}</option>
                  <option value="coach">{" "}{t("Coach · treino e dieta")}{" "}</option>
                </select>
              </label>}
            {error && <p role="alert" className="form-error">
                {error}
              </p>}
            <button className="primary full" disabled={busy}>
              {busy ? t("Aguarde…") : register ? t("Criar conta") : t("Entrar")}
              <ArrowRight size={17} />
            </button>
          </form>
          <button className="auth-toggle" onClick={() => {
          setRegister(!register);
          setError(t(""));
        }}>
            {register ? t("Já tem uma conta? Entrar") : t("Primeiro acesso? Criar conta")}
          </button>
        </div>
      </section>
    </div>;
}
