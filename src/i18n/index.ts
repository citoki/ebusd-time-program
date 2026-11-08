import type { ResolvedProgram } from "../config.js";
import type { Issue } from "../model/validate.js";
import { da } from "./da.js";
import { de } from "./de.js";
import { el } from "./el.js";
import { en, type Strings } from "./en.js";
import { enGB } from "./en-GB.js";
import { es } from "./es.js";
import { fr } from "./fr.js";
import { setNumberLocale } from "./format.js";
import { hu } from "./hu.js";
import { it } from "./it.js";
import { nl } from "./nl.js";
import { pl } from "./pl.js";
import { ro } from "./ro.js";
import { sv } from "./sv.js";
import { uk } from "./uk.js";

export { formatTemp, shortTemp } from "./format.js";
export type { Strings } from "./en.js";

/** Languages with their HA language codes. */
export const LANGUAGES: Record<string, Strings> = {
  en,
  "en-GB": enGB,
  de,
  fr,
  es,
  it,
  nl,
  pl,
  hu,
  ro,
  uk,
  sv,
  da,
  el,
};

/** Texts of the active language. A live binding: modules always see the current one. */
export let UI: Strings = en;
let active = "en";

/** HA language code (`de`, `en-GB`, `de-CH`, …) -> supported code; unknown -> English. */
export function resolveLanguage(code: string | undefined | null): string {
  if (!code) return "en";
  const exact = Object.keys(LANGUAGES).find((k) => k.toLowerCase() === code.toLowerCase());
  if (exact) return exact;
  const base = code.split(/[-_]/)[0]!.toLowerCase();
  return LANGUAGES[base] ? base : "en";
}

/**
 * Switch the texts. Called by each card before it renders, so two cards with
 * different `language` settings on one page both render correctly.
 */
export function setLanguage(code: string | undefined | null): string {
  const lang = resolveLanguage(code);
  if (lang !== active) {
    active = lang;
    UI = LANGUAGES[lang]!;
    setNumberLocale(lang);
  }
  return lang;
}

export function issueMessage(issue: Issue): string {
  return UI.issues[issue.code](issue.params ?? {});
}

/** Configured name, else the program's name in the active language. */
export function programName(p: ResolvedProgram): string {
  return p.name ?? UI.programNames[p.spec.id];
}

/** Tab label: the configured name, else the short form (Z1, HWC, CC). */
export function programTabLabel(p: ResolvedProgram): string {
  return p.name ?? UI.programShort[p.spec.id];
}
