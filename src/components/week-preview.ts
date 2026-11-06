import { html, type TemplateResult } from "lit";
import { formatTemp, UI } from "../i18n/en.js";
import { MINUTES_PER_DAY, toMinutes } from "../model/time.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "../model/types.js";

export interface WeekPreviewProps {
  spec: ProgramSpec;
  days: Record<Day, Slot[] | null>;
  selected: readonly Day[];
  /** Days shown with the unsaved draft instead of the controller values. */
  pending?: readonly Day[];
  onDay: (day: Day) => void;
}

/** 7 × 24 h bars; clicking a day label selects only that day. */
export function renderWeekPreview({ spec, days, selected, pending = [], onDay }: WeekPreviewProps): TemplateResult {
  return html`<div class="section">
    <p class="label">${UI.preview}</p>
    <div class="week">
      ${DAYS.map((d) => {
        const slots = days[d];
        const isSel = selected.includes(d);
        const isPending = pending.includes(d);
        return html`<button
            class="week-day ${isSel ? "selected" : ""}"
            aria-label=${UI.dayLong[d]}
            @click=${() => onDay(d)}
          >
            <span class="pending-dot" aria-hidden="true">${isPending ? "•" : ""}</span>${UI.dayShort[d]}
          </button>
          <div
            class="track ${isSel ? "selected" : ""} ${isPending ? "pending" : ""} ${slots === null ? "loading" : ""}"
            role="img"
            aria-label="${describe(d, slots, spec)}${isPending ? ` (${UI.unsaved})` : ""}"
          >
            ${(slots ?? []).map((s) => renderSegment(s, spec))}
          </div>`;
      })}
      <div class="axis" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    </div>
  </div>`;
}

function renderSegment(slot: Slot, spec: ProgramSpec): TemplateResult {
  const start = toMinutes(slot.start) ?? 0;
  const end = toMinutes(slot.end) ?? start;
  const left = (start / MINUTES_PER_DAY) * 100;
  // Keep very short slots (CC: 10 min) visible.
  const width = Math.max(((end - start) / MINUTES_PER_DAY) * 100, 0.8);
  const label = `${slot.start}–${slot.end}${slot.temp !== undefined && spec.temp ? ` · ${formatTemp(slot.temp)} °C` : ""}`;
  return html`<span
    class="seg ${spec.temp ? "heat" : ""}"
    style="left:${left}%;width:${width}%"
    title=${label}
  ></span>`;
}

function describe(day: Day, slots: Slot[] | null, spec: ProgramSpec): string {
  if (slots === null) return `${UI.dayLong[day]}: ${UI.loading}`;
  if (slots.length === 0) return `${UI.dayLong[day]}: ${UI.offAllDay}`;
  return `${UI.dayLong[day]}: ${slots
    .map((s) => `${s.start}–${s.end}${s.temp !== undefined && spec.temp ? ` ${formatTemp(s.temp)} °C` : ""}`)
    .join(", ")}`;
}
