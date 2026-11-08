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

/** Slot value editor. Values only reach the draft on Done; Cancel and Escape discard them. */
export function renderSheet(p: SheetProps): TemplateResult {
  const done = (e: Event) => {
    p.onDone();
    closeDialog(e);
  };
  const { field, index } = p.sheet;
  return renderFrame({
    title: html`${renderIcon(SLOT_ICON)}${UI.sheetTitle(field, index + 1)}`,
    body: field === "temp" ? (p.spec.temp ? renderTemp(p.spec, p.spec.temp, p.sheet.value, p.onChange) : nothing) : renderTime(p, field),
    issues: p.issues.map((i) => issueLine(i.level, issueMessage(i))),
    actions: html`<button class="btn" @click=${closeDialog}>${UI.cancel}</button>
      <button class="btn primary" @click=${done}>✓ ${UI.done}</button>`,
    onClosed: p.onClosed,
    onKey: (e) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        done(e);
      }
    },
  });
}

// ---------- shared dialog frame ----------

/** Close the <dialog> around the clicked element; the card resets its state on the `close` event. */
const closeDialog = (e: Event) => (e.currentTarget as HTMLElement).closest("dialog")?.close();

const issueLine = (level: string, text: string) =>
  html`<p class="issue ${level}">${level === "info" ? "ⓘ" : "⚠"} ${text}</p>`;

interface FrameProps {
  cls?: string;
  title: string | TemplateResult;
  body: unknown;
  /** Lines below the body; undefined = no issue area at all. */
  issues?: unknown;
  actions: TemplateResult;
  onClosed: () => void;
  onKey?: (e: KeyboardEvent) => void;
}

/**
 * Bottom sheet (narrow screens) / centred popover (wide) as a native modal
 * <dialog>; the card opens it with showModal() after rendering. Only one is open
 * at a time, so the title id can be shared.
 */
function renderFrame(f: FrameProps): TemplateResult {
  return html`<dialog class="sheet ${f.cls ?? ""}" aria-labelledby="sheet-title" @close=${f.onClosed} @keydown=${f.onKey ?? nothing}>
    <h3 class="sheet-title" id="sheet-title">${f.title}</h3>
    ${f.body}
    ${f.issues === undefined ? nothing : html`<div class="sheet-issues" aria-live="polite">${f.issues}</div>`}
    <div class="sheet-actions">${f.actions}</div>
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

/** Info dialog of a program (same frame as the slot sheet). */
export function renderInfoSheet(p: InfoSheetProps): TemplateResult {
  const sb = p.setback;
  const editable = sb !== undefined && sb.writable && sb.value !== null;
  return renderFrame({
    cls: "info-sheet",
    title: html`${p.icon ? renderIcon(p.icon) : nothing}${p.title}`,
    body: html`<p class="info-text">${p.text}</p>
      ${editable
        ? renderTemp(sb.spec, sb.range, sb.value!, sb.onChange)
        : sb && sb.value !== null
          ? html`<div class="temp-big readonly">
              <output class="temp-value"><span class="dot ${tempBand(sb.spec, sb.value) ?? ""}"></span>${formatTemp(sb.value)} °C</output>
            </div>`
          : nothing}
      ${sb && !sb.writable ? html`<p class="hint">${UI.setbackReadOnly}</p>` : nothing}`,
    issues: sb ? (sb.error ? issueLine("error", sb.error) : nothing) : undefined,
    actions: editable
      ? html`<button class="btn" @click=${closeDialog}>${UI.cancel}</button>
          <button class="btn primary" ?disabled=${!sb.dirty || sb.saving} @click=${sb.onSave}>✓ ${UI.save}</button>`
      : html`<button class="btn primary" @click=${closeDialog}>${UI.close}</button>`,
    onClosed: p.onClosed,
  });
}

/** Built-in MDI paths, so the default icons also show without HA's icon set (e.g. on the dev page). */
const MDI_WEATHER_NIGHT = svg`<path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z" />`;
const MDI_WEATHER_PARTLY_CLOUDY = svg`<path d="M12.74,5.47C15.1,6.5 16.35,9.03 15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27C5,12.45 4.6,10.24 5.5,8.26C6.72,5.5 9.97,4.24 12.74,5.47M11.93,7.3C10.16,6.5 8.09,7.31 7.31,9.07C6.85,10.09 6.93,11.22 7.41,12.13C8.5,10.83 10.16,10 12,10C12.7,10 13.38,10.12 14,10.34C13.9,9.06 13.08,7.86 11.93,7.3M13.55,3.64C13,3.4 12.45,3.23 11.88,3.12L14.37,1.82L15.27,4.71C14.76,4.29 14.19,3.93 13.55,3.64M6.09,4.44C5.6,4.79 5.17,5.19 4.8,5.63L4.91,2.82L7.87,3.5C7.25,3.71 6.65,4.03 6.09,4.44M18,9.71C17.91,9.12 17.78,8.55 17.59,8L19.97,9.5L17.92,11.73C18.03,11.08 18.05,10.4 18,9.71M3.04,11.3C3.11,11.9 3.24,12.47 3.43,13L1.06,11.5L3.1,9.28C3,9.93 2.97,10.61 3.04,11.3M19,18H16V16A4,4 0 0,0 12,12A4,4 0 0,0 8,16H6A2,2 0 0,0 4,18A2,2 0 0,0 6,20H19A1,1 0 0,0 20,19A1,1 0 0,0 19,18Z" />`;
/** Set-back dialog (outside the slots). */
export const SETBACK_ICON = "mdi:weather-night";
/** Slot dialog (the heating / comfort periods). */
const SLOT_ICON = "mdi:weather-partly-cloudy";
const BUILT_IN: Record<string, ReturnType<typeof svg>> = {
  [SETBACK_ICON]: MDI_WEATHER_NIGHT,
  [SLOT_ICON]: MDI_WEATHER_PARTLY_CLOUDY,
};

/** Built-in icons are drawn inline; any other MDI name (an entity's own icon) needs HA's <ha-icon>. */
function renderIcon(name: string): TemplateResult | typeof nothing {
  const path = BUILT_IN[name];
  if (path) {
    return html`<svg class="title-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">${path}</svg>`;
  }
  return customElements.get("ha-icon") ? html`<ha-icon class="title-icon" .icon=${name} aria-hidden="true"></ha-icon>` : nothing;
}
