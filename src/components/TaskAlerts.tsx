import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { pickTitle } from "@/lib/occurrences";
import { formatCivilDate } from "@/lib/time";
import { Dialog, DialogCancel } from "./Dialog";

type Alert = { kind: string; task_id: string; title: Record<string, string>; operational_day: string; shift: string; staff_id: string | null; overdue: boolean };
const SEEN_KEY = "dslodge.taskAlertsSeen";

/** Ao entrar, o Office vê um pop-up com as tarefas novas ou atrasadas (s.7, B15). Uma vez por sessão. */
export function TaskAlerts() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* sem armazenamento */
    }
    if (seen) return;
    void supabase.rpc("my_task_alerts").then(({ data }) => {
      const list = (data ?? []) as Alert[];
      if (list.length) setAlerts(list);
    });
  }, []);

  if (alerts.length === 0) return null;

  const close = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sem armazenamento */
    }
    setAlerts([]);
  };

  return (
    <Dialog
      title={t("tasks.alertTitle")}
      onClose={close}
      footer={
        <>
          <DialogCancel>{t("tasks.later")}</DialogCancel>
          <button
            className="primary"
            onClick={() => {
              close();
              navigate("/tasks");
            }}
          >
            {t("tasks.seeTasks")}
          </button>
        </>
      }
    >
      <ul className="plain-list">
        {alerts.slice(0, 8).map((a) => (
          <li key={`${a.task_id}-${a.operational_day}-${a.shift}`}>
            <strong>{pickTitle(a.title, locale)}</strong>{" "}
            <span className={a.overdue ? "tag tag-danger" : "tag tag-ok"}>{a.overdue ? t("maintenance.overdue") : t("tasks.alertNew")}</span>
            <br />
            <small className="muted">{formatCivilDate(a.operational_day, locale)} · {a.shift === "day" ? "Day" : "Night"}</small>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
