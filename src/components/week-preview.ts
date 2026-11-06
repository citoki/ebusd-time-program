import { html, nothing, type TemplateResult } from "lit";
import { formatTemp, shortTemp, UI } from "../i18n/index.js";
import { MINUTES_PER_DAY, toMinutes } from "../model/time.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "../model/types.js";

/** Slots of at least this length get their temperature written inside the bar. */
const LABEL_MIN_MINUTES = 90;

export interface WeekPreviewProps {
  spec: ProgramSpec;
  days: Record<Day, Slot[] | null>;
  /** Days drawn with the accent outline (edit: the selection, preview: the detail day). */
  selected: readonly Day[];
  /** Days shown with the unsaved draft instead of the controller values. */
  pending?: readonly Day[];
  onDay: (day: Day) => void;
  /** Heading above the chart; default "Preview". */
  heading?: string | TemplateResult;
  /** Write the temperature inside long enough segments. */
  labels?: boolean;
  /** Current time: a marker on that day's row. */
  now?: { day: Day; minutes: number } | null;
  /** Detail line: also write the temperatures (off when the heading shows the shared one). */
  detailTemps?: boolean;
  /** Read-only mode: the slots of this day are written out below the chart. */
  detail?: Day | null;
  /** Hover / focus on a day (null when leaving the chart). */
  onHover?: (day: Day | null) => void;
  /** Shown instead of the detail line, e.g. when ebusd is offline. */
  alert?: string | TemplateResult | undefined;
}

/** 7 × 24 h bars; clicking a day label selects only that day. */
export function renderWeekPreview(p: WeekPreviewProps): TemplateResult {
  const { spec, days, selected, pending = [], onDay } = p;
  const hover = p.onHover;
  return html`<div class="section">
    <p class="label">${p.heading ?? UI.preview}</p>
    <div class="week ${p.labels ? "labelled" : ""}" @mouseleave=${hover ? () => hover(null) : nothing}>
      ${DAYS.map((d) => {
        const slots = days[d];
        const isSel = selected.includes(d);
        const isPending = pending.includes(d);
        const isToday = p.now?.day === d;
        return html`<button
            class="week-day ${isSel ? "selected" : ""} ${isToday ? "today" : ""}"
            aria-label=${UI.dayLong[d]}
            aria-pressed=${p.detail !== undefined ? String(isSel) : nothing}
            @click=${() => onDay(d)}
            @mouseenter=${hover ? () => hover(d) : nothing}
            @focus=${hover ? () => hover(d) : nothing}
          >
            <span class="pending-dot" aria-hidden="true">${isPending ? "•" : ""}</span>${UI.dayShort[d]}
          </button>
          <div
            class="track ${isSel ? "selected" : ""} ${isPending ? "pending" : ""} ${slots === null ? "loading" : ""}"
            role="img"
            aria-label="${describe(d, slots, spec)}${isPending ? ` (${UI.unsaved})` : ""}"
            @click=${p.detail !== undefined ? () => onDay(d) : nothing}
            @mouseenter=${hover ? () => hover(d) : nothing}
          >
            ${(slots ?? []).map((s) => renderSegment(s, spec, p.labels ?? false))}
            ${isToday ? html`<span class="now" style="left:${(p.now!.minutes / MINUTES_PER_DAY) * 100}%" title=${UI.now}></span>` : nothing}
          </div>`;
      })}
      <div class="axis" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    </div>
    ${p.alert
      ? html`<p class="detail error" role="alert">${p.alert}</p>`
      : p.detail
        ? html`<p class="detail" aria-live="polite">
            <span class="detail-day">${UI.dayShort[p.detail]}</span>
            ${detailText(days[p.detail], spec, p.detailTemps ?? true)}
          </p>`
        : nothing}
  </div>`;
}

function renderSegment(slot: Slot, spec: ProgramSpec, labels: boolean): TemplateResult {
  const start = toMinutes(slot.start) ?? 0;
  const end = toMinutes(slot.end) ?? start;
  const left = (start / MINUTES_PER_DAY) * 100;
  // Keep very short slots (CC: 10 min) visible.
  const width = Math.max(((end - start) / MINUTES_PER_DAY) * 100, 0.8);
  const label = `${slot.start}–${slot.end}${slot.temp !== undefined && spec.temp ? ` · ${formatTemp(slot.temp)} °C` : ""}`;
  const text = labels && spec.temp && slot.temp !== undefined && end - start >= LABEL_MIN_MINUTES ? shortTemp(slot.temp) : "";
  return html`<span class="seg ${spec.temp ? "heat" : ""}" style="left:${left}%;width:${width}%" title=${label}
    >${text}</span
  >`;
}

/** The detail line: `06:00–08:00 21.0 °C · 16:00–22:00 21.0 °C`. */
function detailText(slots: Slot[] | null, spec: ProgramSpec, withTemp: boolean): string {
  if (slots === null) return UI.loading;
  if (slots.length === 0) return UI.offAllDay;
  return slots
    .map((s) => `${s.start}–${s.end}${withTemp && spec.temp && s.temp !== undefined ? ` ${formatTemp(s.temp)} °C` : ""}`)
    .join(" · ");
}

function describe(day: Day, slots: Slot[] | null, spec: ProgramSpec): string {
  if (slots === null) return `${UI.dayLong[day]}: ${UI.loading}`;
  if (slots.length === 0) return `${UI.dayLong[day]}: ${UI.offAllDay}`;
  return `${UI.dayLong[day]}: ${slots
    .map((s) => `${s.start}–${s.end}${s.temp !== undefined && spec.temp ? ` ${formatTemp(s.temp)} °C` : ""}`)
    .join(", ")}`;
}

/** The one temperature all known slots share, or null (none, or several). */
export function uniformTemp(days: Record<Day, Slot[] | null>, spec: ProgramSpec): number | null {
  if (!spec.temp) return null;
  const temps = new Set<number>();
  for (const d of DAYS) for (const s of days[d] ?? []) if (s.temp !== undefined) temps.add(s.temp);
  return temps.size === 1 ? [...temps][0]! : null;
}
