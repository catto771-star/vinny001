import type { MessageKey } from "@/i18n";

const RULES: Array<[RegExp, MessageKey]> = [
  [/stale_version/, "errors.staleVersion"],
  [/not_author/, "errors.notAuthor"],
  [/correction_window_closed/, "errors.correctionWindowClosed"],
  [/unmarked_residents/, "sheet.markAll"],
  [/checks_pending/, "noShows.incomplete"],
  [/day_not_finished/, "noShows.notFinished"],
  [/check_in_future/, "sheet.notYet"],
  [/no_active_absence/, "errors.noActiveAbsence"],
  [/absence_overlaps/, "absences.overlaps"],
  [/invalid_absence_period|invalid_period/, "errors.invalidPeriod"],
  [/staff_overlap/, "errors.staffOverlap"],
  [/float_overlap/, "errors.floatOverlap"],
  [/role_not_allowed/, "errors.roleNotAllowed"],
  [/exceeds_purchased_quantity/, "errors.exceedsPurchased"],
  [/same_lodge/, "errors.sameLodge"],
  [/not_authorised|row-level security|permission denied|42501/, "errors.notAuthorised"],
  [/stays_one_open_per_bed/, "errors.bedTaken"],
  [/stays_one_open_per_resident/, "errors.residentHasStay"],
  [/bed_out_of_service/, "errors.bedOutOfService"],
  [/reason_required/, "errors.reasonRequired"],
  [/invalid_.*time|admitted_in_future/, "errors.invalidTime"],
  [/lodge_required/, "errors.lodgeRequired"],
  [/role_cannot_take_office/, "errors.roleCannotTakeOffice"],
  [/role_cannot_take_float/, "errors.roleCannotTakeFloat"],
  [/JWT expired|refresh_token/i, "errors.sessionEnded"],
  [/Failed to fetch|NetworkError|network/i, "errors.network"],
];

/** Converte um erro do Supabase/Postgres numa mensagem traduzível. */
export function errorKey(error: unknown): MessageKey {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  for (const [pattern, key] of RULES) if (pattern.test(message)) return key;
  return "errors.generic";
}
