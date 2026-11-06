import { html, nothing, type TemplateResult } from "lit";
import { formatTemp, issueMessage, UI } from "../i18n/index.js";
import { stepPart, stepTemp, stepTime, timeBounds, type TimeField } from "../model/edit.js";
import { fromMinutes } from "../model/time.js";
import type { ProgramSpec } from "../model/types.js";
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
    ${field === "temp" ? renderTemp(p) : renderTime(p, field)}
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

function renderTemp(p: SheetProps): TemplateResult | typeof nothing {
  const range = p.spec.temp;
  if (!range) return nothing;
  const v = p.sheet.value;
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
