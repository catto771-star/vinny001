import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate } from "@/lib/time";
import { residentName } from "@/lib/types";
import { groupByRoom, useOccupancy } from "@/lib/useOccupancy";

/** Número da folha impressa: "AM-20261120". */
export function printSheetNumber(lodgeCode: string, day: string): string {
  return `${lodgeCode.slice(0, 2)}-${day.replace(/-/g, "")}`;
}

/**
 * Impressão da Folha do dia (s.5, B20, B24): mesmo layout do papel, quarto em destaque,
 * camas atuais, ausência marcada, número da folha e linhas em branco para admissões.
 * Imprimir é opcional e não confirma nada.
 */
export function PrintSheet() {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const [params] = useSearchParams();
  const lodgeId = params.get("lodge") ?? lodges[0]?.id ?? "";
  const day = params.get("day") ?? "";
  const lodge = lodges.find((l) => l.id === lodgeId);
  const { beds, loading } = useOccupancy(lodgeId);
  const [slots, setSlots] = useState<string[]>([]);
  const [absent, setAbsent] = useState<Set<string>>(new Set());

  useEffect(() => {
    void supabase.rpc("check_slots", { p_lodge: lodgeId, p_day: day }).then(({ data }) => setSlots((data ?? []) as string[]));
    const now = new Date().toISOString();
    void supabase
      .from("absences")
      .select("stay_id")
      .is("ended_at", null)
      .lte("starts_at", now)
      .gt("expected_return_at", now)
      .then(({ data }) => setAbsent(new Set(((data ?? []) as { stay_id: string }[]).map((a) => a.stay_id))));
  }, [lodgeId, day]);

  useEffect(() => {
    if (!loading && beds.length > 0) {
      const id = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(id);
    }
  }, [loading, beds.length]);

  if (!lodge) return null;
  const hasDinner = lodge.has_dinner;
  const columns = slots.length + 2 + (hasDinner ? 1 : 0);

  return (
    <div className="print-sheet">
      <header className="print-header">
        <div>
          <h1>{t("sheet.printTitle", { lodge: lodge.name })}</h1>
          <div>{formatCivilDate(day, locale)} · {t("sheet.printShift")}</div>
        </div>
        <div className="print-number">{t("sheet.sheetNumber", { n: printSheetNumber(lodge.code, day) })}</div>
      </header>
      <p className="print-note">{t("sheet.printNote")}</p>

      <table className="print-table">
        <thead>
          <tr>
            <th>{t("sheet.room")}</th>
            <th>{t("sheet.bed")}</th>
            <th>{t("sheet.resident")}</th>
            <th>{t("sheet.dob")}</th>
            {slots.map((s) => <th key={s}>{s}</th>)}
            <th>Seen Day</th>
            <th>Seen Night</th>
            {hasDinner && <th>{t("sheet.dinner")}</th>}
          </tr>
        </thead>
        <tbody>
          {groupByRoom(beds).map((room) =>
            room.beds.map((b, i) => (
              <tr key={b.bed_id} className={i === 0 ? "room-start" : ""}>
                {i === 0 && (
                  <td rowSpan={room.beds.length} className="print-room">
                    {roomLabel(t, room.room_kind, room.room_code)}
                  </td>
                )}
                <td>{b.bed_number}</td>
                <td>
                  {b.resident_id ? (
                    <>
                      <strong>{residentName(b)}</strong>
                      {b.final_warning && <span className="print-tag"> FW !</span>}
                      {b.stay_id && absent.has(b.stay_id) && <span className="print-tag"> [{t("sheet.absenceTag")}]</span>}
                    </>
                  ) : (
                    <em>{t("sheet.freeBed")}</em>
                  )}
                </td>
                <td>{formatCivilDate(b.date_of_birth, locale)}</td>
                {Array.from({ length: columns }).map((_, k) => <td key={k} className="print-box" />)}
              </tr>
            )),
          )}
        </tbody>
      </table>

      <h2 className="print-subtitle">{t("sheet.printNewAdmissions")}</h2>
      <table className="print-table">
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="print-blank" />
              <td className="print-blank" />
              <td className="print-blank wide" />
              <td className="print-blank" />
              {Array.from({ length: columns }).map((_, k) => <td key={k} className="print-box" />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
