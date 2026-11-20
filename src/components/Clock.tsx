import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { formatClock } from "@/lib/time";

/** Relógio do topo: dia da semana, data e hora de Dublin com segundos (s.15.2).
 *  Usa a hora do servidor (diferença medida ao entrar), não a do computador (B56). */
export function Clock({ offsetMs = 0 }: { offsetMs?: number }) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));

  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + offsetMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [offsetMs]);

  const c = formatClock(now, locale);
  return (
    <div className="clock" aria-live="off">
      <span className="clock-weekday">{c.weekday}</span>
      <span className="clock-date">{c.date}</span>
      <span className="clock-time">{c.time}</span>
    </div>
  );
}
