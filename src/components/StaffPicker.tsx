import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { filterResidents } from "./ResidentPicker";

export type Person = { id: string; name: string; hint?: string };
const MAX_COLLEAGUES = 3;

/** Colega novo: sem repetição, sem o autor e no máximo 3. */
export function addColleague(list: string[], id: string, authorId: string): string[] {
  if (id === authorId || list.includes(id) || list.length >= MAX_COLLEAGUES) return list;
  return [...list, id];
}
export const removeColleague = (list: string[], id: string) => list.filter((x) => x !== id);
export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/**
 * Autor e colegas da anotação (revisão 8): um chip com o Author, chips removíveis para até 3 colegas e um
 * botão "+ Add colleague" que abre uma busca. Nada de quatro campos soltos.
 */
export function StaffPicker({ people, author, rosteredId, coAuthors, onAuthor, onCoAuthors, required }: {
  people: Person[];
  author: string | null;
  rosteredId: string;
  coAuthors: string[];
  onAuthor: (id: string | null) => void;
  onCoAuthors: (ids: string[]) => void;
  required?: boolean;
}) {
  const { t } = useI18n();
  const listId = useId();
  const [mode, setMode] = useState<"author" | "colleague" | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const authorId = author ?? rosteredId;
  const byId = (id: string) => people.find((p) => p.id === id);
  const authorName = authorId ? byId(authorId)?.name : undefined;
  const total = 1 + coAuthors.length;

  const options = useMemo(() => {
    const taken = new Set(mode === "colleague" ? [authorId, ...coAuthors] : []);
    const pool = people.filter((p) => !taken.has(p.id));
    // Quem está no Roster vem primeiro.
    const sorted = [...pool].sort((a, b) => Number(b.id === rosteredId) - Number(a.id === rosteredId));
    return filterResidents(query, sorted.map((p) => ({ id: p.id, label: p.name }))).map((o) => byId(o.id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, query, mode, authorId, coAuthors, rosteredId]);

  function open(next: "author" | "colleague") {
    setMode(next);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function choose(p: Person) {
    if (mode === "author") {
      onAuthor(p.id);
      onCoAuthors(removeColleague(coAuthors, p.id));
    } else if (mode === "colleague") {
      onCoAuthors(addColleague(coAuthors, p.id, authorId));
    }
    setMode(null);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setMode(null); }
    else if (e.key === "Backspace" && query === "" && mode === "colleague" && coAuthors.length > 0) onCoAuthors(coAuthors.slice(0, -1));
  }

  return (
    <div className="staff-picker" role="group" aria-labelledby={`${listId}-lbl`}>
      <span className="staff-picker-label" id={`${listId}-lbl`}>{t("handover.filledBy")}</span>
      <div className="staff-chips">
        <button type="button" className={`person-chip is-author${authorName ? "" : " is-empty"}`} aria-label={`${t("handover.changeAuthor")}: ${authorName ?? t(required ? "handover.filledByChoose" : "handover.filledByMe")}`}
          aria-haspopup="listbox" aria-expanded={mode === "author"} onClick={() => open("author")}>
          {authorName ? (
            <>
              <span className="avatar" aria-hidden="true">{initials(authorName)}</span>
              <span className="person-name">{authorName}</span>
              {authorId === rosteredId && <span className="person-hint">{t("handover.onRoster")}</span>}
            </>
          ) : (
            <span className="person-name">{t(required ? "handover.filledByChoose" : "handover.filledByMe")}</span>
          )}
        </button>
        {coAuthors.map((id) => {
          const p = byId(id);
          if (!p) return null;
          return (
            <span className="person-chip" key={id}>
              <span className="avatar" aria-hidden="true">{initials(p.name)}</span>
              <span className="person-name">{p.name}</span>
              <button type="button" className="chip-x" aria-label={t("handover.removeAuthor", { name: p.name })} onClick={() => onCoAuthors(removeColleague(coAuthors, id))}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          );
        })}
        {coAuthors.length < MAX_COLLEAGUES ? (
          <button type="button" className="person-chip is-add" aria-haspopup="listbox" aria-expanded={mode === "colleague"} onClick={() => open("colleague")}>
            <Plus size={14} aria-hidden="true" />
            <span>{t("handover.addColleague")}</span>
            <span className="person-hint">{t("handover.authorsCount", { n: total })}</span>
          </button>
        ) : (
          <span className="person-hint" role="status">{t("handover.authorsMax")}</span>
        )}
      </div>
      {mode && (
        <div className="staff-pop">
          <input ref={inputRef} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
            placeholder={t("handover.searchColleague")} aria-label={t("handover.searchColleague")} value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
          <ul id={listId} role="listbox" className="staff-options">
            {options.length === 0 && <li className="staff-none" role="presentation">{t("handover.noColleague")}</li>}
            {options.map((p, i) => (
              <li key={p.id} id={`${listId}-${p.id}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)} onMouseEnter={() => setActive(i)}>
                <span className="avatar" aria-hidden="true">{initials(p.name)}</span>
                <span className="person-name">{p.name}</span>
                {p.id === rosteredId && <span className="person-hint">{t("handover.onRoster")}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
