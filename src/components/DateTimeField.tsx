import { useI18n, type MessageKey } from "@/i18n";
import { fromDublinInputValue, toDublinInputValue } from "@/lib/time";

/** Data e hora sempre digitadas e mostradas no horário de Dublin. Vazio = agora (hora do servidor). */
export function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: MessageKey;
  value: Date | null;
  onChange: (value: Date | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="field">
      <span>{t(label)}</span>
      <div className="inline">
        <label className="inline-check">
          <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : new Date())} />
          {t("residents.admittedNow")}
        </label>
        {value !== null && (
          <input
            type="datetime-local"
            value={toDublinInputValue(value)}
            onChange={(e) => onChange(fromDublinInputValue(e.target.value))}
            required
          />
        )}
      </div>
    </div>
  );
}
