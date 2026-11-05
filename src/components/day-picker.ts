import { html, type TemplateResult } from "lit";
import { UI } from "../i18n/en.js";
import { DAYS, type Day } from "../model/types.js";
import { PRESETS, presetOf, type Preset } from "../model/week.js";

export interface DayPickerProps {
  selected: readonly Day[];
  onToggle: (day: Day) => void;
  onPreset: (preset: Preset) => void;
}

export function renderDayPicker({ selected, onToggle, onPreset }: DayPickerProps): TemplateResult {
  const current = presetOf(selected);
  return html`<div class="section">
    <div class="days-head">
      <p class="label" id="days-label">${UI.days}</p>
      <div class="presets" role="group" aria-label=${UI.quickSelect}>
        ${(Object.keys(PRESETS) as Preset[]).map(
          (p) =>
            html`<button class="preset" aria-pressed=${current === p ? "true" : "false"} @click=${() => onPreset(p)}>
              ${UI.presets[p]}
            </button>`,
        )}
      </div>
    </div>
    <div class="chips" role="group" aria-labelledby="days-label">
      ${DAYS.map(
        (d) =>
          html`<button
            class="chip"
            role="checkbox"
            aria-checked=${selected.includes(d) ? "true" : "false"}
            aria-label=${UI.dayLong[d]}
            @click=${() => onToggle(d)}
          >
            ${UI.dayShort[d].toUpperCase()}
          </button>`,
      )}
    </div>
  </div>`;
}

/** Short human label for a selection: preset name, or `Mo, We, Su`. */
export function selectionLabel(days: readonly Day[]): string {
  const preset = presetOf(days);
  if (preset) return UI.presets[preset];
  return days.map((d) => UI.dayShort[d]).join(", ");
}
