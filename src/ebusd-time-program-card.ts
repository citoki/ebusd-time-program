import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { programFingerprint, readProgram, type ProgramRead } from "./adapters/mqtt.js";
import { renderApplyBar } from "./components/apply-bar.js";
import { renderBusyPanel } from "./components/busy-panel.js";
import { renderDayPicker, selectionLabel } from "./components/day-picker.js";
import { renderTabs } from "./components/program-tabs.js";
import { renderSheet, type SheetState } from "./components/sheets.js";
import { renderSlotList, type SlotField } from "./components/slot-list.js";
import { renderWeekPreview } from "./components/week-preview.js";
import { accentStyle, DEFAULTS, resolveConfig, setbackEntityId, type CardConfig, type DefaultDays, type ResolvedConfig, type ResolvedProgram } from "./config.js";
import type { Hass } from "./hass.js";
import { ISSUE_MESSAGES, UI } from "./i18n/en.js";
import { clampTemp, clampTime, defaultTemp, removeSlot, sortSlots, suggestSlot, updateSlot } from "./model/edit.js";
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
import { restoreItems, retryItems, WriteJob, type JobKind, type JobSnapshot } from "./write-job.js";

export const CARD_TAG = "ebusd-time-program-card";

/**
 * Cards on the same page share the bus: only one write job at a time across
 * all instances (two cards could otherwise interleave slot writes).
 */
let pageJobOwner: object | null = null;

/** How long the "Saved to …" confirmation stays before it closes itself. */
const SUCCESS_VISIBLE_MS = 10_000;
export const CARD_VERSION = "0.3.1";

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
    _job: { state: true },
    _notice: { state: true },
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
  /** Current or last write job (null = none / closed). */
  declare _job: JobSnapshot | null;
  /** One-off error shown in the apply bar (e.g. no service access). */
  declare _notice: string | null;
  declare _infoOpen: boolean;
  /** Z1 set-back temperature from HA, for the info text (null = unknown). */
  /** Set-back temperature per configured program (zones only). */
  declare _setback: (number | null)[];

  private _cfg: ResolvedConfig | undefined;
  private _hass: Hass | undefined;
  private _fingerprint = "";
  private _runner: WriteJob | null = null;
  /** Resolvers of the running job waiting for the next hass update. */
  private _waiters: (() => void)[] = [];
  private _successTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._active = 0;
    this._selected = [];
    this._source = undefined;
    this._reads = [];
    this._drafts = [];
    this._sheet = null;
    this._job = null;
    this._notice = null;
    this._infoOpen = false;
    this._setback = [];
  }

  // ---------- Lovelace API ----------

  setConfig(config: CardConfig): void {
    this._cfg = resolveConfig(config); // throws -> HA shows an error card
    this._active = 0;
    this._selected = initialDays(this._cfg.defaultDays);
    this._source = undefined;
    this._drafts = [];
    this._sheet = null;
    this._job = null;
    this._fingerprint = "";
    this._refresh();
    this.dataset.theme = this._cfg.theme;
    this.requestUpdate(); // _cfg is not reactive; HA calls setConfig again on YAML edits
  }

  set hass(hass: Hass) {
    this._hass = hass;
    this._refresh();
    const waiters = this._waiters;
    this._waiters = [];
    waiters.forEach((w) => w());
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("beforeunload", this._onBeforeUnload);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("beforeunload", this._onBeforeUnload);
    clearTimeout(this._successTimer);
  }

  private get _busy(): boolean {
    return this._job?.status === "running";
  }

  private _onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!this._busy) return;
    e.preventDefault();
    e.returnValue = UI.leaveWarning; // legacy browsers show/require it
  };

  getCardSize(): number {
    return 10;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  /** Config of a newly added card: spells out the main options with their defaults. */
  static getStubConfig(): Partial<CardConfig> {
    return {
      title: DEFAULTS.title,
      mqtt_prefix: DEFAULTS.prefix,
      circuit: DEFAULTS.circuit,
      programs: [...DEFAULTS.programs],
      default_days: "weekdays",
      theme: "brand",
      layout: "auto",
    };
  }

  // ---------- data ----------

  /** Re-read only when one of the program sensors changed. */
  private _refresh(): void {
    const cfg = this._cfg;
    const hass = this._hass;
    if (!cfg || !hass) return;
    const setback = cfg.programs.map((p) => {
      const id = setbackEntityId(cfg, p);
      return id ? hass.states[id]?.state : undefined;
    });
    const fp = cfg.programs.map((p) => programFingerprint(hass, cfg, p.spec)).join("#") + `#${setback.join("|")}`;
    if (fp === this._fingerprint) return;
    this._fingerprint = fp;
    this._reads = cfg.programs.map((p) => readProgram(hass, cfg, p.spec));
    this._setback = setback.map((s) => {
      const value = s === undefined ? NaN : Number.parseFloat(s);
      return Number.isFinite(value) ? value : null;
    });
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

  /**
   * A success message is only a confirmation: any further interaction
   * dismisses it. Failed/cancelled results stay until Close, because they
   * offer Restore previous / Retry.
   */
  private _dismissSuccess(): void {
    if (this._job?.status === "done") this._job = null;
  }

  private _setDraft(slots: Slot[] | undefined): void {
    this._dismissSuccess();
    const drafts = [...this._drafts];
    // editing back to exactly the controller values is not a draft any more
    if (slots !== undefined && this._cfg) {
      const { base } = this._context(this._cfg);
      if (sameExact(slots, base.slots)) slots = undefined;
    }
    drafts[this._active] = slots;
    this._drafts = drafts;
    this._notice = null;
  }

  private _setSelection(days: Day[]): void {
    this._dismissSuccess();
    this._selected = orderDays(days);
    this._source = undefined;
  }

  private _onToggle = (day: Day) => this._setSelection(toggleDay(this._selected, day));
  private _onPreset = (preset: Preset) => this._setSelection([...PRESETS[preset]]);
  private _onPreviewDay = (day: Day) => this._setSelection([day]);
  private _onTab = (index: number) => {
    this._active = index;
    this._source = undefined;
  };

  private _onEdit = (index: number, field: SlotField) => {
    this._dismissSuccess();
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

  // ---------- writing: one job at a time, card locked while it runs ----------

  private _onApply = () => {
    const cfg = this._cfg;
    if (!cfg || this._busy) return;
    const { plan, errors, week } = this._context(cfg);
    if (errors.length || plan.write.length === 0) return;
    const previous = Object.fromEntries(plan.write.map((d) => [d, week[d]]));
    void this._startJob("apply", plan.write.map((day) => ({ day, slots: plan.slots })), previous);
  };

  private _onRetry = () => {
    const job = this._job;
    if (job) void this._startJob(job.kind === "restore" ? "restore" : "retry", retryItems(job), job.previous);
  };

  private _onRestore = () => {
    const job = this._job;
    if (job) void this._startJob("restore", restoreItems(job), job.previous);
  };

  private _onCancelJob = () => this._runner?.cancel();
  private _onCloseJob = () => {
    this._job = null;
  };

  private async _startJob(kind: JobKind, items: { day: Day; slots: Slot[] }[], previous: JobSnapshot["previous"]) {
    const cfg = this._cfg;
    const hass = this._hass;
    if (!cfg || !hass || items.length === 0) return;
    if (!hass.callService) {
      this._notice = UI.noMqtt;
      return;
    }
    if (pageJobOwner && pageJobOwner !== this) {
      this._notice = UI.otherCardBusy;
      return;
    }
    pageJobOwner = this;
    const program = this._active;
    const spec = cfg.programs[program]!.spec;
    const countMessage = this._reads[program]?.countMessage ?? cfg.countMessage ?? "Timeframes";
    this._sheet = null;
    this._notice = null;
    const runner = new WriteJob(
      { kind, program, items, previous },
      { cfg, spec, countMessage, verifyTimeoutMs: cfg.verifyTimeout * 1000 },
      {
        publish: async (topic, payload) => {
          await this._hass!.callService!("mqtt", "publish", { topic, payload });
        },
        readDay: (day) => (this._hass ? readProgram(this._hass, cfg, spec).days[day] : null),
        waitForUpdate: (ms) =>
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ms);
            this._waiters.push(() => {
              clearTimeout(timer);
              resolve();
            });
          }),
        now: () => Date.now(),
      },
      (snapshot) => (this._job = snapshot),
    );
    this._runner = runner;
    this._job = runner.snapshot;
    const result = await runner.run().finally(() => {
      if (pageJobOwner === this) pageJobOwner = null;
    });
    this._runner = null;
    if (result.status === "done") {
      // close only this result, not a newer job or panel the user opened meanwhile
      clearTimeout(this._successTimer);
      this._successTimer = setTimeout(() => {
        if (this._job === result) this._job = null;
      }, SUCCESS_VISIBLE_MS);
    }
    // success: the controller now has the draft, so it is not unsaved any more
    if (result.status === "done" && kind !== "restore") {
      const drafts = [...this._drafts];
      drafts[program] = undefined;
      this._drafts = drafts;
      this._source = undefined;
    }
  }

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
    const status = this._busy ? "busy" : (read?.status ?? "loading");
    const style = accentStyle(cfg);

    return html`<ha-card style=${style}>
      <div class="header">
        <h2 class="title">${cfg.title}</h2>
        <span
          class="status ${status}"
          role="img"
          aria-label=${status === "busy" ? UI.busyStatus : UI.status[status]}
          title=${status === "busy" ? UI.busyStatus : UI.status[status]}
        ></span>
      </div>
      ${renderTabs(
        cfg.programs,
        cfg.programs.map((_, i) => this._reads[i]?.status ?? "loading"),
        this._active,
        this._onTab,
        cfg.programs.map((_, i) => this._drafts[i] !== undefined),
        this._busy,
      )}
      ${read?.status === "missing" ? this._renderMissing(read, cfg.programs[this._active]!) : this._renderBody(cfg)}
    </ha-card>`;
  }

  private _renderMissing(read: ProgramRead, program: ResolvedProgram): TemplateResult {
    const extraZone = program.spec.id === "z2" || program.spec.id === "z3";
    return html`<div class="section" role="alert">
      <p class="error">${UI.status.missing}</p>
      <p class="hint">${UI.missingLookedFor}</p>
      <ul class="mono">
        ${read.missing.map((id) => html`<li><code>${id}</code></li>`)}
      </ul>
      <p class="hint">${UI.missingHelp}</p>
      ${extraZone ? html`<p class="hint">${UI.missingZone(program.name, program.spec.id)}</p>` : nothing}
    </div>`;
  }

  private _renderBody(cfg: ResolvedConfig): TemplateResult {
    const ctx = this._context(cfg);
    const { program, spec, slots, loading, dirty, plan } = ctx;
    const selected = this._selected;
    const showEditor = selected.length > 0 || dirty;
    const busy = this._busy;
    const showBar = this._job !== null || (!loading && (dirty || plan.write.length > 0));
    // the preview shows the draft on the days it would be written to
    const previewDays: ProgramRead["days"] = { ...ctx.days };
    if (dirty) for (const d of plan.write) previewDays[d] = plan.slots;

    return html`<div class="body layout-${cfg.layout} ${busy ? "busy" : ""}">
        <div class="area-days" ?inert=${busy}>
          ${renderDayPicker({ selected, onToggle: this._onToggle, onPreset: this._onPreset })}
        </div>
        <div class="area-slots" ?inert=${busy}>
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
                info: infoText(spec, this._setback[this._active] ?? null),
                infoOpen: this._infoOpen,
                onInfo: () => {
                  this._dismissSuccess();
                  this._infoOpen = !this._infoOpen;
                },
              })
            : html`<div class="section"><p class="empty">${UI.noDaySelected}</p></div>`}
        </div>
        ${cfg.showPreview
          ? html`<div class="area-preview" ?inert=${busy}>
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
              ${this._job
                ? renderBusyPanel({
                    job: this._job,
                    programName: program.name,
                    verifyTimeoutS: cfg.verifyTimeout,
                    onCancel: this._onCancelJob,
                    onRetry: this._onRetry,
                    onRestore: this._onRestore,
                    onClose: this._onCloseJob,
                  })
                : renderApplyBar({
                    plan,
                    errors: ctx.errors,
                    deltas: slotDeltas(ctx.week, plan),
                    dirty,
                    notice: this._notice,
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
      this._dismissSuccess();
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
  if (spec.setbackMessage) return UI.hint.zone(setback);
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
