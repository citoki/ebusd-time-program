import { html, nothing, type TemplateResult } from "lit";
import { formatTemp, UI } from "../i18n/en.js";
import type { ProgramSpec, Slot } from "../model/types.js";
import { tempBand } from "./colors.js";

export interface SlotListProps {
  name: string;
  spec: ProgramSpec;
  summary: string;
  /** null = still loading. */
  slots: readonly Slot[] | null;
}

export function renderSlotList({ name, spec, summary, slots }: SlotListProps): TemplateResult {
  return html`<div class="section">
    <div class="prog-head">
      <h3 class="prog-name">${name}</h3>
      <span class="prog-summary">${summary}</span>
    </div>
    <div class="slots" role="table" aria-label=${name}>
      <div class="slot-head" role="row">
        <span role="columnheader">${UI.start}</span>
        <span aria-hidden="true"></span>
        <span role="columnheader">${UI.end}</span>
        ${spec.temp ? html`<span class="col-temp" role="columnheader">${UI.temp}</span>` : html`<span></span>`}
      </div>
      ${slots === null
        ? html`<div class="skeleton" role="row">${UI.loading}</div>`
        : slots.length === 0
          ? html`<div class="empty" role="row">${UI.offAllDay}</div>`
          : slots.map((s) => renderRow(s, spec))}
    </div>
    <p class="hint"><span aria-hidden="true">ⓘ</span><span>${UI.hint[spec.id]}</span></p>
  </div>`;
}

function renderRow(slot: Slot, spec: ProgramSpec): TemplateResult {
  const band = tempBand(spec, slot.temp);
  return html`<div class="slot-row" role="row">
    <span role="cell">${slot.start}</span>
    <span class="dash" aria-hidden="true">–</span>
    <span role="cell">${slot.end}</span>
    ${spec.temp && slot.temp !== undefined
      ? html`<span class="col-temp" role="cell">
          <span class="pill"><span class="dot ${band ?? ""}"></span>${formatTemp(slot.temp)} °C</span>
        </span>`
      : nothing}
  </div>`;
}
