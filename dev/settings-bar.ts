import type { CardConfig } from "../src/config.js";
import { LANGUAGES } from "../src/i18n/index.js";

/** Dev page only: switch language, card theme and the faked HA theme without editing the URL. */

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  "en-GB": "English (UK)",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  hu: "Magyar",
  ro: "Română",
  uk: "Українська",
  sv: "Svenska",
  da: "Dansk",
  el: "Ελληνικά",
};

/** A light HA theme with its own primary/accent colours, to see what `theme: default` takes over. */
const HA_LIGHT: Record<string, string> = {
  "--primary-color": "#03a9f4",
  "--accent-color": "#ff9800",
  "--card-background-color": "#ffffff",
  "--secondary-background-color": "#eef0f2",
  "--primary-text-color": "#212121",
  "--secondary-text-color": "#727272",
  "--divider-color": "rgba(0, 0, 0, 0.12)",
};

export function applyHaTheme(mode: string | null): void {
  const root = document.documentElement.style;
  const light = mode === "light";
  for (const [k, v] of Object.entries(HA_LIGHT)) {
    if (light) root.setProperty(k, v);
    else root.removeProperty(k); // back to the dark variables of index.html
  }
  document.body.style.background = light ? "#fafafa" : "";
  document.body.classList.toggle("ha-light", light);
}

interface Choice {
  label: string;
  param: string;
  options: [value: string, text: string][];
  /** Value when the URL parameter is absent. */
  fallback: string;
  apply: (value: string) => void;
}

export function mountSettingsBar(config: CardConfig, reconfigure: () => void): void {
  const choices: Choice[] = [
    {
      label: "Language",
      param: "lang",
      fallback: "",
      options: [["", "HA language (en)"], ...Object.keys(LANGUAGES).map((k): [string, string] => [k, `${LANGUAGE_NAMES[k] ?? k} (${k})`])],
      apply: (v) => {
        if (v) config.language = v;
        else delete config.language;
        reconfigure();
      },
    },
    {
      label: "Card theme",
      param: "theme",
      fallback: "brand",
      options: [
        ["brand", "brand"],
        ["default", "default (HA theme)"],
      ],
      apply: (v) => {
        config.theme = v as NonNullable<CardConfig["theme"]>;
        reconfigure();
      },
    },
    {
      label: "HA theme",
      param: "ha",
      fallback: "dark",
      options: [
        ["dark", "dark"],
        ["light", "light (blue / orange)"],
      ],
      apply: (v) => applyHaTheme(v),
    },
  ];

  const bar = document.createElement("div");
  bar.className = "scenarios settings";
  const params = new URLSearchParams(location.search);
  for (const c of choices) {
    const label = document.createElement("label");
    label.textContent = `${c.label}: `;
    const select = document.createElement("select");
    for (const [value, text] of c.options) select.add(new Option(text, value));
    select.value = params.get(c.param) ?? c.fallback;
    select.addEventListener("change", () => {
      c.apply(select.value);
      const url = new URL(location.href);
      if (select.value === c.fallback) url.searchParams.delete(c.param);
      else url.searchParams.set(c.param, select.value);
      history.replaceState(null, "", url);
    });
    label.append(select);
    bar.append(label);
  }
  document.body.prepend(bar);
}
