import { html, nothing, svg, type TemplateResult } from "lit";
import { formatTemp, issueMessage, UI } from "../i18n/index.js";
import { stepPart, stepTemp, stepTime, timeBounds, type TimeField } from "../model/edit.js";
import { fromMinutes } from "../model/time.js";
import type { ProgramSpec, TempRange } from "../model/types.js";
import type { Issue } from "../model/validate.js";
import { tempBand } from "./colors.js";
import type { SlotField } from "./slot-list.js";

/** Open editor sheet: which value of which slot, and the not-yet-committed value. */
export interface SheetState {
  index: number;
  field: SlotField;
  /** minutes after midnight for start/end, °C for temp */
  value: number;
}

export interface SheetProps {
  sheet: SheetState;
  spec: ProgramSpec;
  /** Issues of the edited slot if the current value were committed. */
  issues: readonly Issue[];
  onChange: (value: number) => void;
  onDone: () => void;
  /** Fired after the dialog closed (Done, Cancel or Escape). */
  onClosed: () => void;
}

/**
 * Bottom sheet (narrow screens) / centred popover (wide) as a native modal
 * <dialog>. The card calls showModal() after it is rendered. Values only reach
 * the draft on Done; Cancel and Escape discard them.
 */
export function renderSheet(p: SheetProps): TemplateResult {
  const close = (e: Event) => (e.currentTarget as HTMLElement).closest("dialog")?.close();
  const done = (e: Event) => {
    p.onDone();
    close(e);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      done(e);
    }
  };
  const { field, index } = p.sheet;
  return html`<dialog class="sheet" aria-labelledby="sheet-title" @close=${p.onClosed} @keydown=${onKey}>
    <h3 class="sheet-title" id="sheet-title">${UI.sheetTitle(field, index + 1)}</h3>
    ${field === "temp" ? (p.spec.temp ? renderTemp(p.spec, p.spec.temp, p.sheet.value, p.onChange) : nothing) : renderTime(p, field)}
    <div class="sheet-issues" aria-live="polite">
      ${p.issues.map((i) => html`<p class="issue ${i.level}">${i.level === "info" ? "ⓘ" : "⚠"} ${issueMessage(i)}</p>`)}
    </div>
    <div class="sheet-actions">
      <button class="btn" @click=${close}>${UI.cancel}</button>
      <button class="btn primary" @click=${done}>✓ ${UI.done}</button>
    </div>
  </dialog>`;
}

function renderTime(p: SheetProps, field: TimeField): TemplateResult {
  const v = p.sheet.value;
  const h = Math.floor(v / 60);
  const m = v % 60;
  const { min, max } = timeBounds(field);
  const part = (which: "hour" | "minute", shown: number) => {
    const name = which === "hour" ? UI.hour : UI.minute;
    const step = (dir: 1 | -1) => p.onChange(stepPart(v, which, dir, field));
    const atMax = stepPart(v, which, 1, field) === v;
    const atMin = stepPart(v, which, -1, field) === v;
    const onKey = (e: KeyboardEvent) => {
      const dir = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      step(dir);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      step(e.deltaY < 0 ? 1 : -1);
    };
    return html`<div class="spin">
      <button class="spin-btn" aria-label=${UI.up(name)} ?disabled=${atMax} @click=${() => step(1)}>▲</button>
      <div
        class="spin-val"
        role="spinbutton"
        tabindex="0"
        aria-label=${name}
        aria-valuenow=${shown}
        aria-valuetext=${fromMinutes(v)}
        @keydown=${onKey}
        @wheel=${onWheel}
      >
        ${String(shown).padStart(2, "0")}
      </div>
      <button class="spin-btn" aria-label=${UI.down(name)} ?disabled=${atMin} @click=${() => step(-1)}>▼</button>
    </div>`;
  };
  return html`<div class="spinners">
      ${part("hour", h)}
      <span class="spin-colon" aria-hidden="true">:</span>
      ${part("minute", m)}
    </div>
    <div class="quick">
      <button class="btn" ?disabled=${v <= min} @click=${() => p.onChange(stepTime(v, -10, field))}>${UI.minus10}</button>
      <button class="btn" ?disabled=${v >= max} @click=${() => p.onChange(stepTime(v, 10, field))}>${UI.plus10}</button>
    </div>`;
}

/** −/+ buttons around the value, a slider and the range ends. */
function renderTemp(spec: ProgramSpec, range: TempRange, v: number, onChange: (value: number) => void): TemplateResult {
  const p = { spec, onChange };
  const onInput = (e: Event) => p.onChange(Number((e.target as HTMLInputElement).value));
  return html`<div class="temp-big">
      <button
        class="round-btn"
        aria-label=${UI.tempDown}
        ?disabled=${v <= range.min}
        @click=${() => p.onChange(stepTemp(v, -1, range))}
      >
        −
      </button>
      <output class="temp-value" aria-live="polite">
        <span class="dot ${tempBand(p.spec, v) ?? ""}"></span>${formatTemp(v)} °C
      </output>
      <button
        class="round-btn"
        aria-label=${UI.tempUp}
        ?disabled=${v >= range.max}
        @click=${() => p.onChange(stepTemp(v, 1, range))}
      >
        +
      </button>
    </div>
    <input
      class="temp-slider"
      type="range"
      min=${range.min}
      max=${range.max}
      step=${range.step}
      .value=${String(v)}
      aria-label=${UI.temp}
      aria-valuetext="${formatTemp(v)} °C"
      @input=${onInput}
    />
    <div class="range-ends" aria-hidden="true"><span>${range.min} °C</span><span>${range.max} °C</span></div>`;
}

/** Info dialog of a program; zones can change their set-back temperature in it. */
export interface InfoSheetProps {
  title: string;
  /** Icon before the title: an MDI name (`mdi:weather-night`), drawn with HA's <ha-icon> when available. */
  icon?: string | undefined;
  text: string;
  /** Set-back temperature control; omitted for programs without one (HWC, CC). */
  setback?: {
    spec: ProgramSpec;
    range: TempRange;
    /** Value in the dialog; null = not known (no control). */
    value: number | null;
    /** false: show the value only, it cannot be written from the card. */
    writable: boolean;
    /** Value differs from the controller's. */
    dirty: boolean;
    saving: boolean;
    error: string | null;
    onChange: (value: number) => void;
    onSave: () => void;
  };
  /** Fired after the dialog closed (Save, Cancel, Close or Escape). */
  onClosed: () => void;
}

/** Same native modal <dialog> as the slot sheet; the card calls showModal(). */
export function renderInfoSheet(p: InfoSheetProps): TemplateResult {
  const close = (e: Event) => (e.currentTarget as HTMLElement).closest("dialog")?.close();
  const sb = p.setback;
  const editable = sb !== undefined && sb.writable && sb.value !== null;
  return html`<dialog class="sheet info-sheet" aria-labelledby="info-title" @close=${p.onClosed}>
    <h3 class="sheet-title" id="info-title">${p.icon ? renderIcon(p.icon) : nothing}${p.title}</h3>
    <p class="info-text">${p.text}</p>
    ${editable
      ? renderTemp(sb.spec, sb.range, sb.value!, sb.onChange)
      : sb && sb.value !== null
        ? html`<div class="temp-big readonly">
            <output class="temp-value"><span class="dot ${tempBand(sb.spec, sb.value) ?? ""}"></span>${formatTemp(sb.value)} °C</output>
          </div>`
        : nothing}
    ${sb && !sb.writable ? html`<p class="hint">${UI.setbackReadOnly}</p>` : nothing}
    ${sb
      ? html`<div class="sheet-issues" aria-live="polite">
          ${sb.error ? html`<p class="issue error">⚠ ${sb.error}</p>` : nothing}
        </div>`
      : nothing}
    <div class="sheet-actions">
      ${editable
        ? html`<button class="btn" @click=${close}>${UI.cancel}</button>
            <button class="btn primary" ?disabled=${!sb.dirty || sb.saving} @click=${sb.onSave}>✓ ${UI.save}</button>`
        : html`<button class="btn primary" @click=${close}>${UI.close}</button>`}
    </div>
  </dialog>`;
}

/** mdi:weather-night, built in so the default icon also shows without HA's icon set. */
const MDI_WEATHER_NIGHT = svg`<path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z" />`;
export const SETBACK_ICON = "mdi:weather-night";

function renderIcon(name: string): TemplateResult {
  if (name !== SETBACK_ICON && customElements.get("ha-icon")) {
    return html`<ha-icon class="title-icon" .icon=${name} aria-hidden="true"></ha-icon>`;
  }
  return html`<svg class="title-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">${MDI_WEATHER_NIGHT}</svg>`;
}
