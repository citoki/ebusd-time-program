import { html, nothing, svg, type TemplateResult } from "lit";
import { formatTemp, issueMessage, UI } from "../i18n/index.js";
import { MAX_SLOTS } from "../model/programs.js";
import type { ProgramSpec, Slot } from "../model/types.js";
import type { Issue } from "../model/validate.js";
import { tempBand } from "./colors.js";

export type SlotField = "start" | "end" | "temp";

export interface SlotListProps {
  name: string;
  spec: ProgramSpec;
  summary: string;
  /** null = still loading. */
  slots: readonly Slot[] | null;
  /** Shown instead of "Loading…" when the values cannot arrive (ebusd offline). */
  unavailable?: string | undefined;
  /** validateDay() result for `slots` (indexes refer to `slots`). */
  issues: readonly Issue[];
  /** Per row: differs from what the controller has for the source day. */
  changed: readonly boolean[];
  /** null = adding is possible, otherwise the reason why not. */
  addBlocked: string | null;
  onEdit: (index: number, field: SlotField) => void;
  onDelete: (index: number) => void;
  /** Merge slot `index` with the next one (gap filled; differing temperatures are chosen by the user). */
  onMerge: (index: number) => void;
  onAdd: () => void;
  /** Tooltip of the info button: what happens outside the slots. */
  info: string;
  /** Opens the info dialog (zones: with the set-back temperature). */
  onInfo: () => void;
  /**
   * Programs with one temperature for all slots (HWC): shown once above the slots
   * instead of per row. `value` null = not known yet.
   */
  sharedTemp?: { value: number | null; onEdit: () => void } | undefined;
}

const ICON_DELETE = svg`<path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />`;
const ICON_ADD = svg`<path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" />`;
const ICON_INFO = svg`<path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />`;
// mdi:call-merge
const ICON_MERGE = svg`<path d="M17,20.41L18.41,19L15,15.59L13.59,17M7.5,8H11V13.59L5.59,19L7,20.41L13,14.41V8H16.5L12,3.5" />`;
const icon = (path: ReturnType<typeof svg>) =>
  html`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">${path}</svg>`;

export function renderSlotList(p: SlotListProps): TemplateResult {
  const { name, spec, summary, slots, issues } = p;
  const dayIssues = issues.filter((i) => i.slot === undefined);
  const rowTemps = spec.temp !== null && !p.sharedTemp;
  return html`<div class="section">
    <div class="prog-head">
      <h3 class="prog-name">${name}</h3>
      <span class="prog-summary">${summary}</span>
    </div>
    ${p.sharedTemp ? renderSharedTemp(spec, p.sharedTemp) : nothing}
    <div class="slots">
      <div class="slot-head" aria-hidden="true">
        <span>${UI.start}</span>
        <span></span>
        <span>${UI.end}</span>
        <span class="col-temp">${rowTemps ? UI.temp : ""}</span>
        <span></span>
      </div>
      ${slots === null
        ? p.unavailable
          ? html`<div class="skeleton unavailable" role="alert">
              <p class="error">${UI.status.offline}</p>
              <p class="hint">${p.unavailable}</p>
            </div>`
          : html`<div class="skeleton">${UI.loading}</div>`
        : html`<div role="list" aria-label=${name}>
            ${slots.length === 0
              ? html`<div class="empty" role="listitem">${UI.offAllDay}</div>`
              : slots.map((s, i) => renderRow(p, s, i, rowTemps))}
          </div>`}
      ${dayIssues.map((i) => html`<p class="issue ${i.level}">${issueMessage(i)}</p>`)}
    </div>
    ${slots === null ? nothing : renderAdd(p, slots.length)}
  </div>`;
}

/** The one temperature of all slots and days, with its own editor (saved right away, not with Apply). */
function renderSharedTemp(spec: ProgramSpec, shared: NonNullable<SlotListProps["sharedTemp"]>): TemplateResult {
  const text = shared.value === null ? UI.tempUnknown : `${formatTemp(shared.value)} °C`;
  return html`<div class="shared-temp">
    <div class="shared-temp-text">
      <span class="shared-temp-label">${UI.sharedTempTitle}</span>
      <span class="shared-temp-note">${UI.sharedTempNote}</span>
    </div>
    <button
      class="field pill"
      aria-haspopup="dialog"
      aria-label="${UI.sharedTempTitle}: ${text}"
      @click=${shared.onEdit}
    >
      <span class="dot ${tempBand(spec, shared.value ?? undefined) ?? ""}"></span>${text}
    </button>
  </div>`;
}

function renderRow(p: SlotListProps, slot: Slot, i: number, rowTemps: boolean): TemplateResult {
  const { spec } = p;
  const rowIssues = p.issues.filter((x) => x.slot === i);
  const bad = new Set(rowIssues.filter((x) => x.level === "error").map((x) => x.field));
  const invalid = rowIssues.some((x) => x.level === "error");
  const n = i + 1;
  const tempText = slot.temp === undefined ? UI.tempUnknown : `${formatTemp(slot.temp)} °C`;
  const label = `${UI.slotN(n)}: ${slot.start}–${slot.end}${rowTemps ? `, ${tempText}` : ""}`;
  const issueId = `slot-issues-${i}`;
  const describedBy = rowIssues.length ? issueId : nothing;

  const field = (f: SlotField, content: unknown, cls = "") =>
    html`<button
      class="field ${cls} ${bad.has(f) ? "bad" : ""}"
      aria-label="${UI.editField(f, n)}: ${f === "temp" ? tempText : slot[f]}"
      aria-invalid=${bad.has(f) ? "true" : "false"}
      aria-describedby=${describedBy}
      @click=${() => p.onEdit(i, f)}
    >
      ${content}
    </button>`;

  return html`<div
    class="slot-row ${invalid ? "invalid" : ""} ${p.changed[i] ? "changed" : ""}"
    role="listitem"
    aria-label=${label}
  >
    ${field("start", slot.start, "time")}
    <span class="dash" aria-hidden="true">–</span>
    ${field("end", slot.end, "time")}
    <span class="col-temp">
      ${rowTemps
        ? field(
            "temp",
            html`<span class="dot ${tempBand(spec, slot.temp) ?? ""}"></span>${tempText}`,
            "pill",
          )
        : nothing}
    </span>
    <button class="icon-btn" aria-label=${UI.deleteSlot(n)} title=${UI.deleteSlot(n)} @click=${() => p.onDelete(i)}>
      ${icon(ICON_DELETE)}
    </button>
    ${i > 0 ? renderMerge(p, i) : nothing}
    ${rowIssues.length
      ? html`<div class="row-issues" id=${issueId}>
          ${rowIssues.map((x) => html`<p class="issue ${x.level}">${x.level === "info" ? "ⓘ" : "⚠"} ${issueMessage(x)}</p>`)}
        </div>`
      : nothing}
  </div>`;
}

/**
 * Merge button on the line above row `i` (merges slot i-1 with slot i). Shown
 * on hover over either row (desktop), always on touch screens and always when
 * the two slots touch with the same temperature ("mergeable" hint).
 */
function renderMerge(p: SlotListProps, i: number): TemplateResult {
  const touching = p.issues.some((x) => x.code === "mergeable" && x.slot === i && x.params?.["a"] === i);
  const label = UI.mergeSlots(i, i + 1);
  return html`<button
    class="merge-btn ${touching ? "touching" : ""}"
    aria-label=${label}
    title=${label}
    @click=${() => p.onMerge(i - 1)}
  >
    ${icon(ICON_MERGE)}
  </button>`;
}

function renderAdd(p: SlotListProps, count: number): TemplateResult {
  const left = MAX_SLOTS - count;
  return html`<div class="add-row">
    <button class="add" ?disabled=${p.addBlocked !== null} @click=${p.onAdd}>${icon(ICON_ADD)} ${UI.addSlot}</button>
    <span class="add-note">${p.addBlocked ?? UI.slotsLeft(left)}</span>
    <button
      class="icon-btn info-btn"
      aria-label=${UI.info}
      aria-haspopup="dialog"
      title=${p.info}
      @click=${p.onInfo}
    >
      ${icon(ICON_INFO)}
    </button>
  </div>`;
}
