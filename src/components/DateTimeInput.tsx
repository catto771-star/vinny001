import { fromDublinInputValue, toDublinInputValue } from "@/lib/time";

/** Campo de data e hora sempre no horário de Dublin. */
export function DateTimeInput({ value, onChange, required, id }: { value: Date | null; onChange: (d: Date | null) => void; required?: boolean; id?: string }) {
  return (
    <input
      id={id}
      type="datetime-local"
      required={required}
      value={value ? toDublinInputValue(value) : ""}
      onChange={(e) => onChange(fromDublinInputValue(e.target.value))}
    />
  );
}
