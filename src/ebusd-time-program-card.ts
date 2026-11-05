import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { programFingerprint, readProgram, type ProgramRead } from "./adapters/mqtt.js";
import { renderApplyBar, renderDryRun, type DryRunEntry } from "./components/apply-bar.js";
import { renderDayPicker, selectionLabel } from "./components/day-picker.js";
import { renderTabs } from "./components/program-tabs.js";
import { renderSheet, type SheetState } from "./components/sheets.js";
import { renderSlotList, type SlotField } from "./components/slot-list.js";
import { renderWeekPreview } from "./components/week-preview.js";
import { resolveConfig, setbackEntityId, topic, type CardConfig, type DefaultDays, type ResolvedConfig, type ResolvedProgram } from "./config.js";
import type { Hass } from "./hass.js";
import { ISSUE_MESSAGES, UI } from "./i18n/en.js";
import { clampTemp, clampTime, defaultTemp, removeSlot, sortSlots, suggestSlot, updateSlot } from "./model/edit.js";
import { buildDayPayloads, writeMessage } from "./model/payload.js";
import { MAX_SLOTS } from "./model/programs.js";
import { fromMinutes, toMinutes } from "./model/time.js";
import { DAYS, type Day, type ProgramSpec, type Slot, type Week } from "./model/types.js";
import { validateDay, validateSelection, type Issue } from "./model/validate.js";
import {

  draftForSelection,
  orderDays,
  planWrite,
  slotDeltas,
  PRESETS,

  toggleDay,
  type Preset,
  type SelectionDraft,
  type WritePlan,
} from "./model/week.js";
import { cardStyles } from "./styles.js";

export const CARD_TAG = "ebusd-time-program-card";
export const CARD_VERSION = "0.2.0";

/** Everything the editor needs for the active program, derived from state. */
interface EditorContext {
  program: ResolvedProgram;
  spec: ProgramSpec;
  days: ProgramRead["days"];
  week: Week;
  loading: boolean;
  /** What the controller has for the selection (source day). */
  base: SelectionDraft;
  /** Slots shown in the editor: the unsaved draft, or `base.slots`. */
  slots: Slot[];
  dirty: boolean;
  issues: Issue[];
  plan: WritePlan;
  /** Errors that block Apply. */
  errors: Issue[];
}

export class EbusdTimeProgramCard extends LitElement {
  static override styles = cardStyles;

  static override properties = {
    _active: { state: true },
    _selected: { state: true },
    _source: { state: true },
    _reads: { state: true },
    _drafts: { state: true },
    _sheet: { state: true },
    _dryRun: { state: true },
    _infoOpen: { state: true },
    _setback: { state: true },
  };

  declare _active: number;
  declare _selected: Day[];
  declare _source: Day | undefined;
  declare _reads: ProgramRead[];
  /** Unsaved draft per program (tab); undefined = follow the controller values. */
  declare _drafts: (Slot[] | undefined)[];
  declare _sheet: SheetState | null;
  declare _dryRun: DryRunEntry[] | null;
  declare _infoOpen: boolean;
  /** Z1 set-back temperature from HA, for the info text (null = unknown). */
  declare _setback: number | null;

  private _cfg: ResolvedConfig | undefined;
  private _hass: Hass | undefined;
  private _fingerprint = "";

  constructor() {
    super();
    this._active = 0;
    this._selected = [];
    this._source = undefined;
    this._reads = [];
    this._drafts = [];
    this._sheet = null;
    this._dryRun = null;
    this._infoOpen = false;
    this._setback = null;
  }

  // ---------- Lovelace API ----------

  setConfig(config: CardConfig): void {
    this._cfg = resolveConfig(config); // throws -> HA shows an error card
    this._active = 0;
    this._selected = initialDays(this._cfg.defaultDays);
    this._source = undefined;
    this._drafts = [];
    this._sheet = null;
    this._dryRun = null;
    this._fingerprint = "";
    this._refresh();
  }

  set hass(hass: Hass) {
    this._hass = hass;
    this._refresh();
  }

  getCardSize(): number {
    return 10;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  static getStubConfig(): Partial<CardConfig> {
    return { programs: ["z1", "hwc", "cc"] };
  }

  // ---------- data ----------

  /** Re-read only when one of the program sensors changed. */
  private _refresh(): void {
    const cfg = this._cfg;
    const hass = this._hass;
    if (!cfg || !hass) return;
    const setback = hass.states[setbackEntityId(cfg)]?.state;
    const fp = cfg.programs.map((p) => programFingerprint(hass, cfg, p.spec)).join("#") + `#${setback}`;
    if (fp === this._fingerprint) return;
    this._fingerprint = fp;
    this._reads = cfg.programs.map((p) => readProgram(hass, cfg, p.spec));
    const value = setback === undefined ? NaN : Number.parseFloat(setback);
    this._setback = Number.isFinite(value) ? value : null;
  }

  private _context(cfg: ResolvedConfig): EditorContext {
    const program = cfg.programs[this._active]!;
    const spec = program.spec;
    const read = this._reads[this._active];
    const days = read?.days ?? (Object.fromEntries(DAYS.map((d) => [d, null])) as ProgramRead["days"]);
    const week = Object.fromEntries(DAYS.map((d) => [d, days[d] ?? []])) as Week;
    const selected = this._selected;
    const loading = selected.some((d) => days[d] === null);
    const base = draftForSelection(week, selected, spec, this._source);
    const own = this._drafts[this._active];
    const slots = own ?? base.slots;
    const issues = validateDay(slots, spec);
    const plan = planWrite(week, selected, slots, spec);
    const errors = [...issues, ...validateSelection(selected)].filter((i) => i.level === "error");
    return { program, spec, days, week, loading, base, slots, dirty: own !== undefined, issues, plan, errors };
  }

  // ---------- interaction ----------

  private _setDraft(slots: Slot[] | undefined): void {
    const drafts = [...this._drafts];
    // editing back to exactly the controller values is not a draft any more
    if (slots !== undefined && this._cfg) {
      const { base } = this._context(this._cfg);
      if (sameExact(slots, base.slots)) slots = undefined;
    }
    drafts[this._active] = slots;
    this._drafts = drafts;
    this._dryRun = null;
  }

  private _setSelection(days: Day[]): void {
    this._selected = orderDays(days);
    this._source = undefined;
    this._dryRun = null;
  }

  private _onToggle = (day: Day) => this._setSelection(toggleDay(this._selected, day));
  private _onPreset = (preset: Preset) => this._setSelection([...PRESETS[preset]]);
  private _onPreviewDay = (day: Day) => this._setSelection([day]);
  private _onTab = (index: number) => {
    this._active = index;
    this._source = undefined;
    this._dryRun = null;
  };

  private _onEdit = (index: number, field: SlotField) => {
    const cfg = this._cfg;
    if (!cfg) return;
    const { slots, spec } = this._context(cfg);
    const slot = slots[index];
    if (!slot) return;
    let value: number;
    if (field === "temp") {
      if (!spec.temp) return;
      value = clampTemp(slot.temp ?? defaultTemp(spec)!, spec.temp);
    } else {
      value = clampTime(toMinutes(slot[field]) ?? (field === "start" ? 6 * 60 : 7 * 60), field);
    }
    this._sheet = { index, field, value };
  };

  private _onSheetChange = (value: number) => {
    if (this._sheet) this._sheet = { ...this._sheet, value };
  };

  private _onSheetDone = () => {
    const cfg = this._cfg;
    const sheet = this._sheet;
    if (!cfg || !sheet) return;
    const { slots } = this._context(cfg);
    this._setDraft(updateSlot(slots, sheet.index, sheetPatch(sheet)));
  };

  private _onSheetClosed = () => {
    this._sheet = null;
  };

  private _onDelete = (index: number) => {
    if (!this._cfg) return;
    this._setDraft(removeSlot(this._context(this._cfg).slots, index));
  };

  private _onAdd = () => {
    if (!this._cfg) return;
    const { slots, spec } = this._context(this._cfg);
    const slot = suggestSlot(slots, spec);
    if (slot) this._setDraft(sortSlots([...slots, slot]));
  };

  private _onDiscard = () => {
    this._source = undefined;
    this._setDraft(undefined);
  };

  /** Phase 3: show what would be published instead of writing (writing is Phase 4). */
  private _onApply = () => {
    const cfg = this._cfg;
    if (!cfg) return;
    const { plan, errors, spec } = this._context(cfg);
    if (errors.length || plan.write.length === 0) return;
    const payloads = buildDayPayloads(spec, plan.slots);
    this._dryRun = plan.write.map((day) => ({
      day,
      topic: topic(cfg, writeMessage(spec, day), "set"),
      payloads,
    }));
  };

  // ---------- render ----------

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has("_sheet") && this._sheet) {
      const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog.sheet");
      if (dialog && !dialog.open) dialog.showModal();
    }
  }

  protected override render(): TemplateResult | typeof nothing {
    const cfg = this._cfg;
    if (!cfg) return nothing;
    const read = this._reads[this._active];
    const status = read?.status ?? "loading";
    const style = cfg.accent ? `--etp-accent:${cfg.accent}` : "";

    return html`<ha-card style=${style}>
      <div class="header">
        <h2 class="title">${cfg.title}</h2>
        <span class="status ${status}" role="img" aria-label=${UI.status[status]} title=${UI.status[status]}></span>
      </div>
      ${renderTabs(
        cfg.programs,
        cfg.programs.map((_, i) => this._reads[i]?.status ?? "loading"),
        this._active,
        this._onTab,
        cfg.programs.map((_, i) => this._drafts[i] !== undefined),
      )}
      ${read?.status === "missing" ? this._renderMissing(read) : this._renderBody(cfg)}
      <div class="footnote">${UI.footnote}</div>
    </ha-card>`;
  }

  private _renderMissing(read: ProgramRead): TemplateResult {
    return html`<div class="section" role="alert">
      <p class="error">${UI.status.missing}</p>
      <p class="hint">${UI.missingLookedFor}</p>
      <ul class="mono">
        ${read.missing.map((id) => html`<li><code>${id}</code></li>`)}
      </ul>
      <p class="hint">${UI.missingHelp}</p>
    </div>`;
  }

  private _renderBody(cfg: ResolvedConfig): TemplateResult {
    const ctx = this._context(cfg);
    const { program, spec, slots, loading, dirty, plan } = ctx;
    const selected = this._selected;
    const showEditor = selected.length > 0 || dirty;
    const showBar = !loading && (dirty || plan.write.length > 0);
    // the preview shows the draft on the days it would be written to
    const previewDays: ProgramRead["days"] = { ...ctx.days };
    if (dirty) for (const d of plan.write) previewDays[d] = plan.slots;

    return html`<div class="body">
        <div class="area-days">
          ${renderDayPicker({ selected, onToggle: this._onToggle, onPreset: this._onPreset })}
        </div>
        <div class="area-slots">
          ${selected.length > 1 && !loading && !dirty ? this._renderBanner(ctx.base) : nothing}
          ${showEditor
            ? renderSlotList({
                name: program.name,
                spec,
                summary: `${selected.length ? selectionLabel(selected) : "–"} · ${UI.slot(slots.length)}`,
                slots: loading ? null : slots,
                issues: ctx.issues,
                changed: slots.map((s) => !ctx.base.slots.some((b) => sameSlot(s, b))),
                addBlocked: addBlocked(slots, spec),
                onEdit: this._onEdit,
                onDelete: this._onDelete,
                onAdd: this._onAdd,
                info: infoText(spec, this._setback),
                infoOpen: this._infoOpen,
                onInfo: () => (this._infoOpen = !this._infoOpen),
              })
            : html`<div class="section"><p class="empty">${UI.noDaySelected}</p></div>`}
        </div>
        ${cfg.showPreview
          ? html`<div class="area-preview">
              ${renderWeekPreview({
                spec,
                days: previewDays,
                selected,
                pending: dirty ? plan.write : [],
                onDay: this._onPreviewDay,
              })}
            </div>`
          : nothing}
        ${showBar
          ? html`<div class="area-apply">
              ${this._dryRun
                ? renderDryRun(this._dryRun, () => (this._dryRun = null))
                : renderApplyBar({
                    plan,
                    errors: ctx.errors,
                    deltas: slotDeltas(ctx.week, plan),
                    dirty,
                    onDiscard: this._onDiscard,
                    onApply: this._onApply,
                  })}
            </div>`
          : nothing}
      </div>
      ${this._sheet ? this._renderSheet(ctx, this._sheet) : nothing}`;
  }

  private _renderSheet(ctx: EditorContext, sheet: SheetState): TemplateResult {
    // issues of the edited slot as if the sheet value were committed (unsorted, so indexes stay)
    const patch = sheetPatch(sheet);
    const candidate = ctx.slots.map((s, i) => (i === sheet.index ? { ...s, ...patch } : s));
    const issues: Issue[] = [];
    for (const x of validateDay(candidate, ctx.spec)) {
      if (x.level === "info" || (sheet.field === "temp") !== (x.field === "temp")) continue;
      if (x.slot === sheet.index) issues.push(x);
      else if (x.code === "overlap" && x.params?.other === sheet.index + 1 && x.slot !== undefined) {
        // overlap is reported on the later slot; seen from the edited slot, name the other one
        const other = candidate[x.slot]!;
        issues.push({ ...x, slot: sheet.index, params: { other: x.slot + 1, range: `${other.start}–${other.end}` } });
      }
    }
    return renderSheet({
      sheet,
      spec: ctx.spec,
      issues,
      onChange: this._onSheetChange,
      onDone: this._onSheetDone,
      onClosed: this._onSheetClosed,
    });
  }

  private _renderBanner(base: SelectionDraft): TemplateResult {
    if (base.identical) {
      return html`<div class="banner info">✓ ${UI.sameProgram(selectionLabel(this._selected))}</div>`;
    }
    const onChange = (e: Event) => {
      this._source = (e.target as HTMLSelectElement).value as Day;
    };
    return html`<div class="banner" role="status">
      <span>ⓘ ${UI.differentPrograms}</span>
      <label>
        ${UI.showingFrom}
        <select @change=${onChange} aria-label=${UI.showingFrom}>
          ${this._selected.map(
            (d) => html`<option value=${d} ?selected=${d === base.source}>${UI.dayLong[d]}</option>`,
          )}
        </select>
      </label>
      <button class="btn small" @click=${() => this._setDraft([])}>${UI.startEmpty}</button>
    </div>`;
  }
}

const sameSlot = (a: Slot, b: Slot) => a.start === b.start && a.end === b.end && a.temp === b.temp;
const sameExact = (a: readonly Slot[], b: readonly Slot[]) =>
  a.length === b.length && a.every((s, i) => sameSlot(s, b[i]!));

function infoText(spec: ProgramSpec, setback: number | null): string {
  if (spec.id === "z1") return UI.hint.z1(setback);
  if (spec.id === "hwc") return UI.hint.hwc();
  return UI.hint.cc();
}

function sheetPatch(sheet: SheetState): Partial<Slot> {
  return sheet.field === "temp" ? { temp: sheet.value } : { [sheet.field]: fromMinutes(sheet.value) };
}

function addBlocked(slots: readonly Slot[], spec: ProgramSpec): string | null {
  if (slots.length >= MAX_SLOTS) return ISSUE_MESSAGES.too_many_slots({ max: MAX_SLOTS });
  return suggestSlot(slots, spec) ? null : UI.noGap;
}

function initialDays(mode: DefaultDays): Day[] {
  if (mode === "today") return [DAYS[(new Date().getDay() + 6) % 7]!];
  return [...PRESETS[mode]];
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, EbusdTimeProgramCard);
}

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean }[];
  }
  interface HTMLElementTagNameMap {
    [CARD_TAG]: EbusdTimeProgramCard;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "ebusd Time Program",
    description: "Weekly time programs of a Vaillant controller via ebusd – edit several days at once.",
    preview: false,
  });
}

console.info(`%c ebusd-time-program-card %c ${CARD_VERSION} `, "background:#3fa38f;color:#fff", "");
