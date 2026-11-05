import { html, LitElement, nothing, type TemplateResult } from "lit";
import { programFingerprint, readProgram, type ProgramRead } from "./adapters/mqtt.js";
import { renderDayPicker, selectionLabel } from "./components/day-picker.js";
import { renderTabs } from "./components/program-tabs.js";
import { renderSlotList } from "./components/slot-list.js";
import { renderWeekPreview } from "./components/week-preview.js";
import { resolveConfig, type CardConfig, type DefaultDays, type ResolvedConfig } from "./config.js";
import type { Hass } from "./hass.js";
import { UI } from "./i18n/en.js";
import { DAYS, type Day, type Week } from "./model/types.js";
import { draftForSelection, orderDays, PRESETS, toggleDay, type Preset } from "./model/week.js";
import { cardStyles } from "./styles.js";

export const CARD_TAG = "ebusd-time-program-card";
export const CARD_VERSION = "0.1.0";

export class EbusdTimeProgramCard extends LitElement {
  static override styles = cardStyles;

  static override properties = {
    _active: { state: true },
    _selected: { state: true },
    _source: { state: true },
    _reads: { state: true },
  };

  declare _active: number;
  declare _selected: Day[];
  declare _source: Day | undefined;
  declare _reads: ProgramRead[];

  private _cfg: ResolvedConfig | undefined;
  private _hass: Hass | undefined;
  private _fingerprint = "";

  constructor() {
    super();
    this._active = 0;
    this._selected = [];
    this._source = undefined;
    this._reads = [];
  }

  // ---------- Lovelace API ----------

  setConfig(config: CardConfig): void {
    this._cfg = resolveConfig(config); // throws -> HA shows an error card
    this._active = 0;
    this._selected = initialDays(this._cfg.defaultDays);
    this._source = undefined;
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
    const fp = cfg.programs.map((p) => programFingerprint(hass, cfg, p.spec)).join("#");
    if (fp === this._fingerprint) return;
    this._fingerprint = fp;
    this._reads = cfg.programs.map((p) => readProgram(hass, cfg, p.spec));
  }

  // ---------- interaction ----------

  private _setSelection(days: Day[]): void {
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

  // ---------- render ----------

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
      )}
      ${read?.status === "missing" ? this._renderMissing(read) : this._renderBody(cfg, read)}
      <div class="footnote">${UI.readOnly}</div>
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

  private _renderBody(cfg: ResolvedConfig, read: ProgramRead | undefined): TemplateResult {
    const program = cfg.programs[this._active]!;
    const spec = program.spec;
    const days = read?.days ?? (Object.fromEntries(DAYS.map((d) => [d, null])) as ProgramRead["days"]);
    const week = Object.fromEntries(DAYS.map((d) => [d, days[d] ?? []])) as Week;
    const selected = this._selected;
    const loading = selected.some((d) => days[d] === null);
    const draft = draftForSelection(week, selected, spec, this._source);

    return html`<div class="body">
      <div class="area-days">
        ${renderDayPicker({ selected, onToggle: this._onToggle, onPreset: this._onPreset })}
      </div>
      <div class="area-slots">
        ${selected.length > 1 && !loading ? this._renderBanner(draft.identical, draft.source) : nothing}
        ${selected.length === 0
          ? html`<div class="section"><p class="empty">${UI.noDaySelected}</p></div>`
          : renderSlotList({
              name: program.name,
              spec,
              summary: `${selectionLabel(selected)} · ${UI.slot(draft.slots.length)}`,
              slots: loading ? null : draft.slots,
            })}
      </div>
      ${cfg.showPreview
        ? html`<div class="area-preview">
            ${renderWeekPreview({ spec, days, selected, onDay: this._onPreviewDay })}
          </div>`
        : nothing}
    </div>`;
  }

  private _renderBanner(identical: boolean, source: Day | null): TemplateResult {
    if (identical) {
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
            (d) => html`<option value=${d} ?selected=${d === source}>${UI.dayLong[d]}</option>`,
          )}
        </select>
      </label>
    </div>`;
  }
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
