import { html, nothing, type TemplateResult } from "lit";
import { formatTemp, shortTemp, UI } from "../i18n/index.js";
import { MINUTES_PER_DAY, toMinutes } from "../model/time.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "../model/types.js";

/** Slots of at least this length get their temperature written inside the bar. */
const LABEL_MIN_MINUTES = 90;

export interface WeekPreviewProps {
  spec: ProgramSpec;
  days: Record<Day, Slot[] | null>;
  /** Rows to draw, in this order; default the whole week. */
  rows?: readonly Day[];
  /** Days drawn with the accent outline (edit: the selection, preview: the detail day). */
  selected: readonly Day[];
  /** Days shown with the unsaved draft instead of the controller values. */
  pending?: readonly Day[];
  /** Controller values: on pending days drawn faded below the draft, and draft slots that differ are tinted. */
  saved?: Record<Day, Slot[] | null>;
  onDay: (day: Day) => void;
  /** Heading above the chart; default "Current schedule". */
  heading?: string | TemplateResult;
  /** Write the temperature inside long enough segments. */
  labels?: boolean;
  /** Current time: a marker on that day's row. */
  now?: { day: Day; minutes: number } | null;
  /** Detail line: also write the temperatures (off when the heading shows the shared one). */
  detailTemps?: boolean;
  /** Read-only mode: the slots of this day are written out below the chart. */
  detail?: Day | null;
  /** Write the detail line (default true); the bars keep their hover tooltips without it. */
  showDetail?: boolean;
  /** Hover / focus on a day (null when leaving the chart). */
  onHover?: (day: Day | null) => void;
  /** Rows react to click / hover (default true); false: a plain chart, the bars keep their tooltips. */
  interactive?: boolean;
  /** Shown instead of the detail line, e.g. when ebusd is offline. */
  alert?: string | TemplateResult | undefined;
}

/** 7 × 24 h bars; clicking a day label selects only that day. */
export function renderWeekPreview(p: WeekPreviewProps): TemplateResult {
  const { spec, days, selected, pending = [], onDay } = p;
  const interactive = p.interactive !== false;
  const hover = interactive ? p.onHover : undefined;
  return html`<div class="section">
    <p class="label">${p.heading ?? UI.schedule}</p>
    <div class="week ${p.labels ? "labelled" : ""} ${interactive ? "" : "static"}" @mouseleave=${hover ? () => hover(null) : nothing}>
      ${(p.rows ?? DAYS).map((d) => {
        const slots = days[d];
        const isSel = selected.includes(d);
        const isPending = pending.includes(d);
        const isToday = p.now?.day === d;
        const label = html`<span class="pending-dot" aria-hidden="true">${isPending ? "•" : ""}</span>${UI.dayShort[d]}`;
        return html`${interactive
            ? html`<button
                class="week-day ${isSel ? "selected" : ""} ${isToday ? "today" : ""}"
                aria-label=${UI.dayLong[d]}
                aria-pressed=${p.detail !== undefined ? String(isSel) : nothing}
                @click=${() => onDay(d)}
                @mouseenter=${hover ? () => hover(d) : nothing}
                @focus=${hover ? () => hover(d) : nothing}
              >
                ${label}
              </button>`
            : html`<span class="week-day ${isToday ? "today" : ""}">${label}</span>`}
          <div
            class="track ${isSel ? "selected" : ""} ${isPending ? "pending" : ""} ${slots === null ? "loading" : ""}"
            role="img"
            aria-label="${describe(d, slots, spec)}${isPending ? ` (${UI.unsaved})` : ""}"
            @click=${interactive && p.detail !== undefined ? () => onDay(d) : nothing}
            @mouseenter=${hover ? () => hover(d) : nothing}
          >
            ${isPending ? (p.saved?.[d] ?? []).map((s) => renderSegment(s, spec, false, "saved")) : nothing}
            ${(slots ?? []).map((s) =>
              renderSegment(
                s,
                spec,
                p.labels ?? false,
                isPending && p.saved?.[d] && !p.saved[d]!.some((b) => sameSlot(s, b)) ? "changed" : "",
              ),
            )}
            ${isToday ? html`<span class="now" style="left:${(p.now!.minutes / MINUTES_PER_DAY) * 100}%" title=${UI.now}></span>` : nothing}
          </div>`;
      })}
      <div class="axis" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    </div>
    ${p.alert
      ? html`<p class="detail error" role="alert">${p.alert}</p>`
      : p.detail && p.showDetail !== false
        ? html`<p class="detail" aria-live="polite">
            <span class="detail-day">${UI.dayShort[p.detail]}</span>
            ${detailText(days[p.detail], spec, p.detailTemps ?? true)}
          </p>`
        : nothing}
  </div>`;
}

const sameSlot = (a: Slot, b: Slot) => a.start === b.start && a.end === b.end && a.temp === b.temp;

/** `kind`: "saved" = controller value under a draft (faded), "changed" = draft slot not saved yet. */
function renderSegment(slot: Slot, spec: ProgramSpec, labels: boolean, kind: "" | "saved" | "changed" = ""): TemplateResult {
  const start = toMinutes(slot.start) ?? 0;
  const end = toMinutes(slot.end) ?? start;
  const left = (start / MINUTES_PER_DAY) * 100;
  // Keep very short slots (CC: 10 min) visible.
  const width = Math.max(((end - start) / MINUTES_PER_DAY) * 100, 0.8);
  const label = `${slot.start}–${slot.end}${slot.temp !== undefined && spec.temp ? ` · ${formatTemp(slot.temp)} °C` : ""}`;
  const text = labels && spec.temp && slot.temp !== undefined && end - start >= LABEL_MIN_MINUTES ? shortTemp(slot.temp) : "";
  return html`<span class="seg ${spec.temp ? "heat" : ""} ${kind}" style="left:${left}%;width:${width}%" title=${label}
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

/** The one temperature all known slots of `rows` share, or null (none, or several). */
export function uniformTemp(days: Record<Day, Slot[] | null>, spec: ProgramSpec, rows: readonly Day[] = DAYS): number | null {
  if (!spec.temp) return null;
  const temps = new Set<number>();
  for (const d of rows) for (const s of days[d] ?? []) if (s.temp !== undefined) temps.add(s.temp);
  return temps.size === 1 ? [...temps][0]! : null;
}
