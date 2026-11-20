import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatDateTime, formatTime } from "@/lib/time";
import { staffName, type DutyFunction } from "@/lib/types";
import { useOnDuty } from "@/lib/useOnDuty";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";

type Occupied = { occupant_name: string; since: string };

/** Assumir Posto (s.4): função do turno + Lodge; quem assume um posto ocupado encerra o anterior. */
export function TakePost() {
  const { t, locale } = useI18n();
  const { staff, lodges, post, refreshPost } = useAuth();
  const navigate = useNavigate();
  const { posts } = useOnDuty();
  const canOffice = staff?.role === "porter";
  const canFloat = staff?.role === "porter" || staff?.role === "manager";
  const [fn, setFn] = useState<DutyFunction>(canOffice ? "office" : "float");
  const [lodgeId, setLodgeId] = useState<string>(
    post?.lodge_id ?? staff?.home_lodge_id ?? lodges[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [occupied, setOccupied] = useState<Occupied | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  async function take(confirmTakeover: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("assume_post", {
      p_function: fn,
      p_lodge: fn === "office" ? lodgeId : null,
      p_confirm_takeover: confirmTakeover,
    });
    setBusy(false);
    if (rpcError) return setError(t(errorKey(rpcError)));
    const result = data as { status: string } & Partial<Occupied>;
    if (result.status === "occupied") {
      setOccupied({ occupant_name: result.occupant_name ?? "", since: result.since ?? "" });
      return;
    }
    setOccupied(null);
    await refreshPost();
    navigate("/");
  }

  async function endPost() {
    const { error: rpcError } = await supabase.rpc("end_my_post");
    setConfirmEnd(false);
    if (rpcError) return setError(t(errorKey(rpcError)));
    await refreshPost();
  }

  const occupantOf = (f: DutyFunction, lodge: string | null) =>
    posts.find((p) => p.function === f && (f === "float" || p.lodge_id === lodge));

  if (!canOffice && !canFloat) {
    return (
      <section className="page narrow">
        <h1>{t("post.title")}</h1>
        <button className="primary" onClick={() => navigate("/")}>{t("post.skip")}</button>
      </section>
    );
  }

  return (
    <section className="page narrow">
      <h1>{t("post.title")}</h1>
      <p>{t("post.intro")}</p>

      <fieldset className="choice-group">
        <legend>{t("post.function")}</legend>
        {canOffice && (
          <label className={fn === "office" ? "choice selected" : "choice"}>
            <input type="radio" name="fn" checked={fn === "office"} onChange={() => setFn("office")} />
            {t("post.office")}
          </label>
        )}
        <label className={fn === "float" ? "choice selected" : "choice"}>
          <input type="radio" name="fn" checked={fn === "float"} onChange={() => setFn("float")} />
          {t("post.float")}
          {occupantOf("float", null) && (
            <small> · {staffName(occupantOf("float", null)?.staff)} {t("today.since", { time: formatTime(occupantOf("float", null)!.started_at, locale) })}</small>
          )}
        </label>
      </fieldset>

      {fn === "office" ? (
        <fieldset className="choice-group">
          <legend>{t("post.lodge")}</legend>
          {lodges.map((l) => {
            const occ = occupantOf("office", l.id);
            return (
              <label key={l.id} className={lodgeId === l.id ? "choice selected" : "choice"}>
                <input type="radio" name="lodge" checked={lodgeId === l.id} onChange={() => setLodgeId(l.id)} />
                {l.name}
                {occ && <small> · {staffName(occ.staff)} {t("today.since", { time: formatTime(occ.started_at, locale) })}</small>}
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="hint">{t("post.floatCoversBoth")}</p>
      )}

      <Notice kind="error">{error}</Notice>

      <div className="button-row">
        <button className="primary" disabled={busy || (fn === "office" && !lodgeId)} onClick={() => void take(false)}>
          {busy ? t("post.taking") : t("post.take")}
        </button>
        {post && (
          <button className="danger-outline" onClick={() => setConfirmEnd(true)}>
            {t("post.endPost")}
          </button>
        )}
        <button className="link-button" onClick={() => navigate("/")}>
          {post ? t("app.back") : t("post.skip")}
        </button>
      </div>

      {occupied && (
        <Dialog
          title={t("post.occupiedTitle")}
          onClose={() => setOccupied(null)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              <button className="primary" disabled={busy} onClick={() => void take(true)}>
                {t("post.confirmTakeover")}
              </button>
            </>
          }
        >
          <p>{t("post.occupiedBody", { name: occupied.occupant_name, time: formatDateTime(occupied.since, locale) })}</p>
        </Dialog>
      )}

      {confirmEnd && (
        <Dialog
          title={t("post.endPost")}
          onClose={() => setConfirmEnd(false)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              <button className="danger" onClick={() => void endPost()}>
                {t("app.confirm")}
              </button>
            </>
          }
        >
          <p>{t("post.endPostConfirm")}</p>
        </Dialog>
      )}
    </section>
  );
}
