import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isLocale, useI18n } from "@/i18n";
import { isManagementRole, type DutyPost, type Lodge, type Staff } from "@/lib/types";

/**
 * Estado de acesso (s.4):
 * - conta criada pela gestão, e-mail e senha pessoais; primeira senha trocada no primeiro acesso;
 * - Manager/Owner/Developer com verificação em duas etapas;
 * - sessão encerra por inatividade;
 * - usuário desativado perde o acesso na hora (o banco deixa de reconhecê-lo).
 */
export type AuthStage =
  | "loading"
  | "signed_out"
  | "not_staff"
  | "change_password"
  | "mfa_enrol"
  | "mfa_verify"
  | "ready";

type AuthContextValue = {
  stage: AuthStage;
  session: Session | null;
  staff: Staff | null;
  lodges: Lodge[];
  post: DutyPost | null;
  isManagement: boolean;
  /** Pode registrar em algum Lodge (gestão ou posto assumido). */
  canWriteLodge: (lodgeId: string) => boolean;
  serverOffsetMs: number;
  notice: string | null;
  refresh: () => Promise<void>;
  refreshPost: () => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "wheel"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLocale, t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [stage, setStage] = useState<AuthStage>("loading");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [lodges, setLodges] = useState<Lodge[]>([]);
  const [post, setPost] = useState<DutyPost | null>(null);
  const [idleMinutes, setIdleMinutes] = useState(15);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const signOut = useCallback(async (message?: string) => {
    setNotice(message ?? null);
    await supabase.auth.signOut();
  }, []);

  const refreshPost = useCallback(async () => {
    const { data } = await supabase.rpc("my_open_post");
    const row = data as DutyPost | null;
    setPost(row && row.id ? row : null);
  }, []);

  const load = useCallback(
    async (current: Session | null) => {
      const seq = ++loadSeq.current;
      if (!current) {
        setStaff(null);
        setPost(null);
        setStage("signed_out");
        return;
      }

      const { data: me, error } = await supabase
        .from("staff")
        .select("*")
        .eq("user_id", current.user.id)
        .maybeSingle();
      if (seq !== loadSeq.current) return;

      if (error || !me) {
        setStaff(null);
        setStage("not_staff");
        return;
      }

      const staffRow = me as Staff;
      setStaff(staffRow);
      if (isLocale(staffRow.locale)) setLocale(staffRow.locale);

      if (staffRow.must_change_password) {
        setStage("change_password");
        return;
      }

      if (isManagementRole(staffRow.role)) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (seq !== loadSeq.current) return;
        if (aal?.currentLevel !== "aal2") {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          if (seq !== loadSeq.current) return;
          const verified = factors?.totp?.some((f) => f.status === "verified");
          setStage(verified ? "mfa_verify" : "mfa_enrol");
          return;
        }
      }

      const [{ data: lodgeRows }, { data: idle }, { data: serverNow }] = await Promise.all([
        supabase.from("lodges").select("id, code, name, short_name, has_dinner, has_laundry").eq("active", true).order("name"),
        supabase.rpc("param_value", { p_key: "security.session_idle_minutes" }),
        supabase.rpc("server_now"),
      ]);
      if (seq !== loadSeq.current) return;

      setLodges((lodgeRows ?? []) as Lodge[]);
      if (typeof idle === "number" && idle > 0) setIdleMinutes(idle);
      if (typeof serverNow === "string") setServerOffsetMs(new Date(serverNow).getTime() - Date.now());
      await refreshPost();
      if (seq !== loadSeq.current) return;
      setStage("ready");
    },
    [refreshPost, setLocale],
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") {
        setTimeout(() => void load(next), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Encerramento por inatividade (computadores compartilhados da recepção).
  useEffect(() => {
    if (!session) return;
    let timer: number | undefined;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void signOut(t("auth.idleSignedOut", { minutes: idleMinutes }));
      }, idleMinutes * 60_000);
    };
    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, idleMinutes, signOut, t]);

  // Usuário desativado: a próxima verificação já não o reconhece e a sessão é encerrada (B02).
  useEffect(() => {
    if (stage !== "ready" || !session) return;
    const check = async () => {
      const { data } = await supabase.rpc("is_active_staff");
      if (data === false) await signOut(t("errors.accountInactive"));
    };
    const id = window.setInterval(() => void check(), 60_000);
    return () => window.clearInterval(id);
  }, [stage, session, signOut, t]);

  const isManagement = isManagementRole(staff?.role);

  const canWriteLodge = useCallback(
    (lodgeId: string) => isManagement || (!!post && (post.function === "float" || post.lodge_id === lodgeId)),
    [isManagement, post],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      stage,
      session,
      staff,
      lodges,
      post,
      isManagement,
      canWriteLodge,
      serverOffsetMs,
      notice,
      refresh: () => load(session),
      refreshPost,
      signOut,
    }),
    [stage, session, staff, lodges, post, isManagement, canWriteLodge, serverOffsetMs, notice, load, refreshPost, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
