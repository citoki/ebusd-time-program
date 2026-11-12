import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { programFingerprint, readProgram, type ProgramRead, type ReadStatus } from "./adapters/mqtt.js";
import { serviceStore, writeDayService } from "./adapters/vaillant-ebus.js";
import { renderApplyBar } from "./components/apply-bar.js";
import { renderBusyPanel } from "./components/busy-panel.js";
import { renderDayPicker, selectionLabel } from "./components/day-picker.js";
import { renderTabs } from "./components/program-tabs.js";
import { renderInfoSheet, renderSheet, SETBACK_ICON, type SheetState } from "./components/sheets.js";
import { renderSlotList, type SlotField } from "./components/slot-list.js";
import { renderWeekPreview, uniformTemp } from "./components/week-preview.js";
import { accentStyle, COUNT_MESSAGE_CANDIDATES, DEFAULTS, resolveConfig, setbackEntityId, setbackWrite, type CardConfig, type SetbackWrite, type DefaultDays, type ResolvedConfig, type ResolvedProgram } from "./config.js";
import type { Hass } from "./hass.js";
import { formatTemp, programName, setLanguage, UI } from "./i18n/index.js";
import { clampTemp, clampTime, defaultTemp, removeSlot, sortSlots, suggestSlot, updateSlot } from "./model/edit.js";
import { MAX_SLOTS } from "./model/programs.js";
import { fromMinutes, toMinutes } from "./model/time.js";
import { DAYS, type Day, type ProgramSpec, type Slot, type Week } from "./model/types.js";
import { validateDay, validateSelection, type Issue } from "./model/validate.js";
import {
  draftForSelection,
  orderDays,
  planWrite,
  previewRows,
  slotDeltas,
  PRESETS,
  toggleDay,
  type Preset,
  type SelectionDraft,
  type WritePlan,
} from "./model/week.js";
import { version } from "../package.json";
import previewImage from "../assets/card-preview.webp?inline";
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
/** From package.json; the release workflow checks that it matches the tag. */
export const CARD_VERSION: string = version;

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
    _infoDialog: { state: true },
    _setbackDraft: { state: true },
    _setbackSaving: { state: true },
    _setbackError: { state: true },
    _setback: { state: true },
    _now: { state: true },
    _detail: { state: true },
    _hover: { state: true },
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
  declare _infoDialog: boolean;
  /** Set-back value in the info dialog (null: not known). */
  declare _setbackDraft: number | null;
  declare _setbackSaving: boolean;
  declare _setbackError: string | null;
  /** Set-back temperature per configured program (zones only). */
  declare _setback: (number | null)[];
  /** Current time for the "now" marker, refreshed every minute. */
  declare _now: Date;
  /** Preview mode: the day written out below the chart (clicked, default today) … */
  declare _detail: Day;
  /** … or the day under the pointer. */
  declare _hover: Day | null;

  private _cfg: ResolvedConfig | undefined;
  private _hass: Hass | undefined;
  private _fingerprint = "";
  /** Per program: the set-back entity and how to write it (refreshed with `_setback`). */
  private _setbackTargets: { entity: string | null; write: SetbackWrite | null }[] = [];
  private _runner: WriteJob | null = null;
  /** Resolvers of the running job waiting for the next hass update. */
  private _waiters: (() => void)[] = [];
  private _successTimer: ReturnType<typeof setTimeout> | undefined;
  private _clock: ReturnType<typeof setInterval> | undefined;
  /** Source `vaillant_ebus`: unsubscribe from the shared program reads. */
  private _unsubscribe: (() => void) | undefined;
  /** Rendered as a thumbnail in HA's "Add card" dialog: show a picture instead of live data. */
  private _inPicker = false;

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
    this._infoDialog = false;
    this._setbackDraft = null;
    this._setbackSaving = false;
    this._setbackError = null;
    this._setback = [];
    this._now = new Date();
    this._detail = dayOf(this._now);
    this._hover = null;
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
    this._loadService();
    this._refresh();
    this.dataset.theme = this._cfg.theme;
    this.requestUpdate(); // _cfg is not reactive; HA calls setConfig again on YAML edits
  }

  set hass(hass: Hass) {
    this._hass = hass;
    this._loadService();
    this._refresh();
    const waiters = this._waiters;
    this._waiters = [];
    waiters.forEach((w) => w());
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._inPicker = insideCardPicker(this);
    window.addEventListener("beforeunload", this._onBeforeUnload);
    this._now = new Date();
    this._clock = setInterval(() => {
      this._now = new Date();
      this._loadService();
    }, 60_000);
    this._unsubscribe = serviceStore.subscribe(() => this._refresh());
    this._loadService();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("beforeunload", this._onBeforeUnload);
    clearTimeout(this._successTimer);
    clearInterval(this._clock);
    this._unsubscribe?.();
    this._unsubscribe = undefined;
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
    if (this._cfg?.mode !== "preview") return 10;
    const perProgram = this._cfg.previewDays === "week" ? 4 : 2;
    return 1 + perProgram * (this._cfg.stacked ? this._cfg.programs.length : 1);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  /** Config of a newly added card: spells out the main options with their defaults. */
  static getStubConfig(): Partial<CardConfig> {
    return {
      mqtt_prefix: DEFAULTS.prefix,
      circuit: DEFAULTS.circuit,
      programs: [...DEFAULTS.programs],
      default_days: "weekdays",
      mode: "edit",
      theme: "brand",
      layout: "auto",
    };
  }

  // ---------- data ----------

  /**
   * Source `vaillant_ebus`: read the programs through the integration's action when
   * the last read is older than the refresh interval (shared by all cards on the page).
   */
  private _loadService(): void {
    const cfg = this._cfg;
    const hass = this._hass;
    if (!cfg || !hass || cfg.source !== "vaillant_ebus" || !this.isConnected || this._inPicker) return;
    const maxAge = cfg.refreshInterval > 0 ? cfg.refreshInterval * 1000 : Infinity;
    for (const p of cfg.programs) void serviceStore.load(hass, cfg, p.spec, maxAge);
  }

  /** Re-read only when one of the program sensors (or the shared service reads) changed. */
  private _refresh(): void {
    const cfg = this._cfg;
    const hass = this._hass;
    if (!cfg || !hass) return;
    const service = cfg.source === "vaillant_ebus";
    const entities = cfg.programs.map((p) => setbackEntityId(cfg, p, hass.states));
    const setback = entities.map((id) => (id ? hass.states[id]?.state : undefined));
    const programs = service
      ? `service:${serviceStore.version}`
      : cfg.programs.map((p) => programFingerprint(hass, cfg, p.spec)).join("#");
    const fp = programs + `#${entities.join("|")}#${setback.join("|")}`;
    if (fp === this._fingerprint) return;
    this._fingerprint = fp;
    this._reads = cfg.programs.map((p) => (service ? serviceStore.get(cfg, p.spec) : readProgram(hass, cfg, p.spec)));
    this._setbackTargets = cfg.programs.map((p, i) => {
      const write = setbackWrite(cfg, p, entities[i]!);
      // without MQTT, only a number entity (e.g. the integration's own) can be written
      return { entity: entities[i]!, write: service && write?.kind === "mqtt" ? null : write };
    });
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
    const countMessage = this._reads[program]?.countMessage ?? cfg.countMessage ?? COUNT_MESSAGE_CANDIDATES[0];
    const service = cfg.source === "vaillant_ebus";
    this._sheet = null;
    this._notice = null;
    const runner = new WriteJob(
      { kind, program, items, previous },
      { cfg, spec, countMessage, verifyTimeoutMs: cfg.verifyTimeout * 1000 },
      {
        publish: async (topic, payload) => {
          await this._hass!.callService!("mqtt", "publish", { topic, payload });
        },
        writeDay: service
          ? async (day, slots) => {
              const stored = await writeDayService(this._hass!, cfg, spec, day, slots);
              serviceStore.setDay(cfg, spec, day, stored);
              return stored;
            }
          : undefined,
        readDay: (day) =>
          service ? serviceStore.get(cfg, spec).days[day] : this._hass ? readProgram(this._hass, cfg, spec).days[day] : null,
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
    // dialogs are rendered closed; open whichever just appeared
    this.renderRoot.querySelectorAll<HTMLDialogElement>("dialog.sheet:not([open])").forEach((d) => d.showModal());
  }

  protected override render(): TemplateResult | typeof nothing {
    const cfg = this._cfg;
    if (this._inPicker) {
      return html`<ha-card class="picker-preview"><img src=${previewImage} alt="eBUSd Time Program" /></ha-card>`;
    }
    if (!cfg) return nothing;
    const lang = setLanguage(cfg.language ?? this._hass?.locale?.language ?? this._hass?.language);
    // correct hyphenation, screen-reader voice and upper-casing (Greek drops accents)
    if (this.lang !== lang) this.lang = lang;
    if (cfg.mode === "preview") return this._renderPreviewMode(cfg);
    const read = this._reads[this._active];
    const status = this._busy ? "busy" : (read?.status ?? "loading");

    return html`<ha-card style=${accentStyle(cfg)}>
      ${this._renderHeader(cfg, status)}
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

  private _renderHeader(cfg: ResolvedConfig, status: ReadStatus | "busy"): TemplateResult {
    const label = status === "busy" ? UI.busyStatus : UI.status[status];
    return html`<div class="header">
      <h2 class="title">${cfg.title ?? UI.defaultTitle}</h2>
      <span class="status ${status}" role="img" aria-label=${label} title=${label}></span>
    </div>`;
  }

  private _nowMarker(): { day: Day; minutes: number } {
    return { day: dayOf(this._now), minutes: this._now.getHours() * 60 + this._now.getMinutes() };
  }

  // ---------- preview mode (read-only) ----------

  private _renderPreviewMode(cfg: ResolvedConfig): TemplateResult {
    const statuses = cfg.programs.map((_, i) => this._reads[i]?.status ?? "loading");
    const shown = cfg.stacked ? cfg.programs.map((_, i) => i) : [this._active];
    // the dot shows the worst state of what is on screen
    const status = (["offline", "missing", "loading"] as const).find((s) => shown.some((i) => statuses[i] === s)) ?? "ok";
    return html`<ha-card class="preview-mode" style=${accentStyle(cfg)}>
      ${this._renderHeader(cfg, status)}
      ${cfg.stacked ? nothing : renderTabs(cfg.programs, statuses, this._active, this._onTab)}
      ${shown.map((i) => this._renderPreviewOf(cfg, i))}
    </ha-card>`;
  }

  private _renderPreviewOf(cfg: ResolvedConfig, index: number): TemplateResult {
    const program = cfg.programs[index]!;
    const { spec } = program;
    const name = programName(program);
    const read = this._reads[index];
    if (read?.status === "missing") {
      if (!cfg.stacked) return this._renderMissing(read, program);
      return html`<div class="section">
        <p class="label">${name}</p>
        <p class="warn">${UI.status.missing}</p>
        <p class="hint">${read.missing[0]}</p>
      </div>`;
    }
    const days = read?.days ?? (Object.fromEntries(DAYS.map((d) => [d, null])) as ProgramRead["days"]);
    const rows = previewRows(cfg.previewDays, dayOf(this._now));
    const uniform = uniformTemp(days, spec, rows);
    // today when the clicked day is not on screen (e.g. after midnight in `today` mode)
    const day = [this._hover, this._detail].find((d): d is Day => d !== null && rows.includes(d)) ?? rows[0]!;
    return renderWeekPreview({
      spec,
      days,
      rows,
      // without the detail line there is nothing to pick: no highlight, no click / hover
      selected: cfg.previewLabel ? [day] : [],
      interactive: cfg.previewLabel,
      onDay: (d) => (this._detail = d),
      onHover: (d) => (this._hover = d),
      heading: uniform === null ? name : `${name} · ${formatTemp(uniform)} °C`,
      labels: spec.temp !== null && (cfg.tempLabels === "always" || (cfg.tempLabels === "auto" && uniform === null)),
      detailTemps: uniform === null,
      now: this._nowMarker(),
      detail: day,
      showDetail: cfg.previewLabel,
      alert: read?.status === "offline" ? UI.status.offline : undefined,
    });
  }

  private _renderMissing(read: ProgramRead, program: ResolvedProgram): TemplateResult {
    const extraZone = program.spec.id === "z2" || program.spec.id === "z3";
    return html`<div class="section" role="alert">
      <p class="warn">${UI.status.missing}</p>
      <p class="hint">${UI.missingLookedFor}</p>
      <ul class="mono">
        ${read.missing.map((id) => html`<li><code>${id}</code></li>`)}
      </ul>
      <p class="hint">${this._cfg?.source === "vaillant_ebus" ? UI.missingHelpService : UI.missingHelp}</p>
      ${extraZone ? html`<p class="hint">${UI.missingZone(programName(program), program.spec.id)}</p>` : nothing}
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
                name: programName(program),
                spec,
                // no slot count while it is not known
                summary: `${selected.length ? selectionLabel(selected) : "–"}${loading ? "" : ` · ${UI.slot(slots.length)}`}`,
                slots: loading ? null : slots,
                unavailable:
                  this._reads[this._active]?.status === "offline"
                    ? cfg.source === "vaillant_ebus"
                      ? UI.offlineHelpService
                      : UI.offlineHelp
                    : undefined,
                issues: ctx.issues,
                changed: slots.map((s) => !ctx.base.slots.some((b) => sameSlot(s, b))),
                addBlocked: addBlocked(slots, spec),
                onEdit: this._onEdit,
                onDelete: this._onDelete,
                onAdd: this._onAdd,
                info: infoText(spec, this._setback[this._active] ?? null),
                onInfo: this._onInfo,
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
                now: this._nowMarker(),
              })}
            </div>`
          : nothing}
        ${showBar
          ? html`<div class="area-apply">
              ${this._job
                ? renderBusyPanel({
                    job: this._job,
                    programName: programName(program),
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
      ${this._sheet ? this._renderSheet(ctx, this._sheet) : nothing}
      ${this._infoDialog ? this._renderInfo(cfg) : nothing}`;
  }

  // ---------- info dialog (set-back temperature) ----------

  private _onInfo = () => {
    this._dismissSuccess();
    this._setbackDraft = this._setback[this._active] ?? null;
    this._setbackError = null;
    this._infoDialog = true;
  };

  private _onInfoClosed = () => {
    this._infoDialog = false;
  };

  private _onSetbackSave = async () => {
    const cfg = this._cfg;
    const hass = this._hass;
    const value = this._setbackDraft;
    const target = this._setbackTargets[this._active]?.write;
    if (!cfg || !hass?.callService || value === null || !target) return;
    this._setbackSaving = true;
    this._setbackError = null;
    try {
      if (target.kind === "service") await hass.callService(target.domain, "set_value", { entity_id: target.entity, value });
      else await hass.callService("mqtt", "publish", { topic: target.topic, payload: String(value) });
      // the entity follows once ebusd has written and read back the value
      this.renderRoot.querySelector<HTMLDialogElement>("dialog.info-sheet")?.close();
    } catch (e) {
      this._setbackError = UI.saveFailed(e instanceof Error ? e.message : String(e));
    } finally {
      this._setbackSaving = false;
    }
  };

  private _renderInfo(cfg: ResolvedConfig): TemplateResult {
    const program = cfg.programs[this._active]!;
    const { spec } = program;
    const onClosed = this._onInfoClosed;
    if (!spec.setbackMessages || !spec.temp) return renderInfoSheet({ title: UI.info, text: infoText(spec, null), onClosed });
    const current = this._setback[this._active] ?? null;
    const target = this._setbackTargets[this._active];
    const writable = !!this._hass?.callService && !!target?.write;
    const ownIcon = target?.entity ? this._hass?.states[target.entity]?.attributes.icon : undefined;
    return renderInfoSheet({
      title: `${UI.setbackTitle} · ${programName(program)}`,
      // the entity's own icon if it has one, else the night icon
      icon: typeof ownIcon === "string" && ownIcon ? ownIcon : SETBACK_ICON,
      text: infoText(spec, null),
      setback: {
        spec,
        range: spec.temp,
        value: this._setbackDraft,
        writable,
        dirty: this._setbackDraft !== current,
        saving: this._setbackSaving,
        error: this._setbackError,
        onChange: (v) => (this._setbackDraft = v),
        onSave: this._onSetbackSave,
      },
      onClosed,
    });
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
  if (spec.setbackMessages) return UI.hint.zone(setback);
  if (spec.id === "hwc") return UI.hint.hwc();
  return UI.hint.cc();
}

function sheetPatch(sheet: SheetState): Partial<Slot> {
  return sheet.field === "temp" ? { temp: sheet.value } : { [sheet.field]: fromMinutes(sheet.value) };
}

function addBlocked(slots: readonly Slot[], spec: ProgramSpec): string | null {
  if (slots.length >= MAX_SLOTS) return UI.issues.too_many_slots({ max: MAX_SLOTS });
  return suggestSlot(slots, spec) ? null : UI.noGap;
}

/** Day of a date (JS: Sunday = 0). */
const dayOf = (d: Date): Day => DAYS[(d.getDay() + 6) % 7]!;

function initialDays(mode: DefaultDays): Day[] {
  if (mode === "today") return [dayOf(new Date())];
  return [...PRESETS[mode]];
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, EbusdTimeProgramCard);
}

/** True when the card sits (across shadow roots) inside HA's card picker. */
function insideCardPicker(el: Element): boolean {
  for (let node: Node | null = el; node; ) {
    if (node instanceof Element && node.localName === "hui-card-picker") return true;
    node = node instanceof ShadowRoot ? node.host : (node.parentNode ?? null);
  }
  return false;
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
    name: "eBUSd Time Program",
    description: "Weekly time programs of a Vaillant controller via ebusd – edit several days at once.",
    preview: true,
  });
}

console.info(`%c ebusd-time-program-card %c ${CARD_VERSION} `, "background:#3fa38f;color:#fff", "");
