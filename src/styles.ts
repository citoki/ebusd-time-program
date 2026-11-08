import { css, unsafeCSS } from "lit";

/** Two-column layout: days + preview left, slots + apply right. `b` selects the body. */
const wideLayout = (b: string) =>
  unsafeCSS(`
    ${b} {
      grid-template-columns: minmax(300px, 1fr) 1.2fr;
      grid-template-rows: auto 1fr auto;
      grid-template-areas: "days slots" "preview slots" "preview apply";
      align-items: start;
    }
    ${b} .area-slots,
    ${b} .area-apply {
      border-left: 1px solid var(--etp-divider);
      align-self: stretch;
    }
    ${b} .area-slots {
      border-top: none;
    }
    ${b} .area-preview {
      grid-row: 2 / span 2;
    }
  `);

export const cardStyles = css`
  /* theme: brand (default) - the card's own dark look, independent of the HA theme */
  :host {
    --etp-accent: #3fa38f;
    --etp-on-accent: #fff;
    --etp-heat: #c8512a;
    --etp-heat-text: #e6e6e6;
    --etp-surface: #1c1c1e;
    --etp-surface-2: #2a2a2d;
    --etp-text: #f2f2f2;
    --etp-muted: #9a9a9e;
    --etp-divider: rgba(255, 255, 255, 0.12);
    --etp-temp-cold: #4f8bd6;
    --etp-temp-mid: #e0a030;
    --etp-temp-warm: #c8512a;
    --etp-ok: #43a047;
    --etp-busy: #e0a030;
    --etp-warn: #e8711c;
    --etp-error: #db4437;
    display: block;
  }
  /* theme: default - follow the HA theme: primary colour as accent, accent colour for heating times */
  :host([data-theme="default"]) {
    --etp-accent: var(--primary-color, #03a9f4);
    --etp-on-accent: var(--text-primary-color, #fff);
    --etp-heat: var(--accent-color, #ff9800);
    /* HA's text colour for content on the accent colour. HA only sets it when the
       user picks an accent colour (white or #212121 by contrast); for the default
       orange accent HA's own rule gives #212121, so that is the fallback. */
    --etp-heat-text: var(--text-accent-color, #212121);
    --etp-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --etp-surface-2: var(--secondary-background-color, #e5e5e5);
    --etp-text: var(--primary-text-color, #212121);
    --etp-muted: var(--secondary-text-color, #727272);
    --etp-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    --etp-ok: var(--success-color, #43a047);
    --etp-busy: var(--warning-color, #ffa600);
    --etp-warn: var(--warning-color, #ffa600);
    --etp-error: var(--error-color, #db4437);
  }

  ha-card {
    display: block;
    container-type: inline-size;
    background: var(--etp-surface);
    color: var(--etp-text);
    border-radius: var(--ha-card-border-radius, 16px);
    overflow: hidden;
    font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, system-ui, sans-serif));
  }

  .picker-preview img {
    display: block;
    width: 100%;
    height: auto;
  }

  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  button:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--etp-accent);
    outline-offset: 2px;
  }

  /* ---------- header ---------- */
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 16px 4px;
  }
  .title {
    flex: 1;
    font-size: 1.25rem;
    font-weight: 500;
    margin: 0;
  }
  .status {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--etp-muted);
    flex: none;
  }
  .status.ok {
    background: var(--etp-ok);
  }
  /* entities not found: orange; ebusd offline: red; loading: grey, pulsing */
  .status.missing {
    background: var(--etp-warn);
  }
  .status.offline {
    background: var(--etp-error);
  }
  .status.busy {
    background: var(--etp-busy);
  }
  @media (prefers-reduced-motion: no-preference) {
    .status.busy,
    .status.loading {
      animation: etp-pulse 1.2s ease-in-out infinite;
    }
    .spinner {
      animation: etp-spin 0.9s linear infinite;
    }
  }
  @keyframes etp-pulse {
    50% {
      opacity: 0.35;
      transform: scale(1.3);
    }
  }
  @keyframes etp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ---------- tabs ---------- */
  .tabs {
    display: flex;
    gap: 4px;
    padding: 0 12px;
    border-bottom: 1px solid var(--etp-divider);
    overflow-x: auto;
  }
  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 12px 14px 10px;
    min-height: 44px;
    color: var(--etp-muted);
    font-weight: 500;
    letter-spacing: 0.04em;
  }
  .tab[aria-selected="true"] {
    color: var(--etp-text);
    border-bottom-color: var(--etp-accent);
  }
  .tab:disabled {
    cursor: not-allowed;
  }
  .tab:disabled:not([aria-selected="true"]) {
    opacity: 0.45;
  }
  .tab.unavailable {
    opacity: 0.45;
  }
  .tab-dirty {
    color: var(--etp-accent);
  }

  /* ---------- layout ---------- */
  /* layout narrow: days, slots, preview, apply stacked;
     layout wide: two columns; layout auto: wide from 720px card width */
  .body {
    display: grid;
    grid-template-areas: "days" "slots" "preview" "apply";
  }
  .area-days {
    grid-area: days;
  }
  .area-slots {
    grid-area: slots;
    border-top: 1px solid var(--etp-divider);
  }
  .area-preview {
    grid-area: preview;
    border-top: 1px solid var(--etp-divider);
  }
  .area-apply {
    grid-area: apply;
    border-top: 1px solid var(--etp-divider);
  }
  @container (min-width: 720px) {
    ${wideLayout(".body.layout-auto")}
  }
  ${wideLayout(".body.layout-wide")}
  .section {
    padding: 12px 16px;
  }
  /* locked while writing; the areas are also inert */
  .body.busy .area-days,
  .body.busy .area-slots,
  .body.busy .area-preview {
    opacity: 0.45;
    pointer-events: none;
    user-select: none;
  }
  .section + .section {
    border-top: 1px solid var(--etp-divider);
  }
  .label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--etp-muted);
    margin: 0 0 10px;
  }

  /* ---------- day chips ---------- */
  .chips {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .chip {
    aspect-ratio: 1;
    max-width: 52px;
    min-width: 36px;
    width: 100%;
    justify-self: center;
    border-radius: 999px;
    border: 1px solid transparent;
    background: var(--etp-surface-2);
    color: var(--etp-muted);
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0;
  }
  .chip[aria-checked="true"] {
    background: var(--etp-accent);
    color: var(--etp-on-accent);
  }
  /* label left, quick-select presets right; wraps below the label on very narrow cards */
  .days-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 4px;
    margin-bottom: 10px;
  }
  .days-head .label {
    margin: 0;
  }
  .presets {
    display: flex;
    gap: 2px;
  }
  .preset {
    border: none;
    background: none;
    border-radius: 999px;
    padding: 4px 10px;
    min-height: 32px;
    font-size: 0.85rem;
    color: var(--etp-muted);
  }
  .preset:hover {
    color: var(--etp-text);
  }
  .preset[aria-pressed="true"] {
    background: color-mix(in srgb, var(--etp-accent) 18%, transparent);
    color: var(--etp-accent);
    font-weight: 500;
  }

  /* ---------- banner ---------- */
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 12px 16px 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--etp-surface-2);
    font-size: 0.9rem;
  }
  .banner select {
    background: var(--etp-surface);
    color: var(--etp-text);
    border: 1px solid var(--etp-divider);
    border-radius: 8px;
    padding: 4px 8px;
    font: inherit;
  }
  .banner.info {
    color: var(--etp-muted);
  }

  /* ---------- slot table ---------- */
  .prog-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .prog-name {
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--etp-muted);
    margin: 0;
  }
  .prog-summary {
    font-size: 0.85rem;
    color: var(--etp-muted);
  }
  .slots {
    margin-top: 8px;
  }
  .slot-row,
  .slot-head {
    display: grid;
    grid-template-columns: 4.6rem 1.2rem 4.6rem 1fr 44px;
    align-items: center;
    gap: 4px;
    padding-left: 8px;
  }
  .slot-head {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--etp-muted);
    padding: 8px 0;
    border-bottom: 1px solid var(--etp-divider);
  }
  .slot-head .col-temp,
  .slot-row .col-temp {
    justify-self: end;
  }
  .slot-row {
    min-height: 56px;
    border-bottom: 1px solid var(--etp-divider);
    font-variant-numeric: tabular-nums;
  }
  .slot-row.changed {
    box-shadow: inset 3px 0 0 var(--etp-accent);
  }
  .slot-row.invalid {
    box-shadow: inset 3px 0 0 var(--etp-error);
  }
  .row-issues {
    grid-column: 1 / -1;
    padding-bottom: 6px;
  }
  .field {
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 6px 4px;
    min-height: 44px;
    text-align: left;
    font-variant-numeric: tabular-nums;
  }
  .field.time {
    font-size: 1.25rem;
  }
  .field:hover {
    background: var(--etp-surface-2);
  }
  .field.bad {
    color: var(--etp-error);
    border-color: var(--etp-error);
  }
  button.pill {
    border: 1px solid transparent;
    min-height: 40px;
  }
  button.pill:hover {
    border-color: var(--etp-divider);
  }
  button.pill.bad {
    border-color: var(--etp-error);
  }
  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--etp-muted);
  }
  .icon-btn:hover {
    color: var(--etp-error);
    background: var(--etp-surface-2);
  }
  /* info button sits at the far right of the add row, in the delete column */
  .info-btn {
    margin-left: auto;
  }
  .info-btn:hover {
    color: var(--etp-accent);
  }
  .info-text {
    margin: 0 0 12px;
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .temp-big.readonly {
    justify-content: center;
  }
  .issue {
    margin: 2px 0 4px;
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .issue.error {
    color: var(--etp-error);
  }
  .issue.warning {
    color: var(--etp-busy);
  }
  .issue.info {
    color: var(--etp-muted);
  }
  .add-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin-top: 12px;
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 6px 16px 6px 12px;
    border: 1px dashed var(--etp-divider);
    border-radius: 999px;
    background: none;
    color: var(--etp-accent);
    font-weight: 500;
  }
  .add:hover:not(:disabled) {
    border-color: var(--etp-accent);
  }
  .add:disabled,
  .btn:disabled {
    color: var(--etp-muted);
    opacity: 0.55;
    cursor: not-allowed;
  }
  .add-note,
  .muted {
    color: var(--etp-muted);
  }
  .add-note,
  .small {
    font-size: 0.85rem;
  }

  /* ---------- buttons ---------- */
  .btn {
    min-height: 40px;
    padding: 6px 18px;
    border: 1px solid var(--etp-divider);
    border-radius: 999px;
    background: var(--etp-surface-2);
    font-weight: 500;
  }
  .btn.small {
    min-height: 32px;
    padding: 4px 12px;
    font-size: 0.85rem;
  }
  .btn.primary {
    background: var(--etp-accent);
    border-color: var(--etp-accent);
    color: var(--etp-on-accent);
  }
  .btn.primary:disabled {
    background: var(--etp-surface-2);
    border-color: var(--etp-divider);
  }

  /* ---------- apply bar ---------- */
  .apply-bar {
    padding: 12px 16px 14px;
  }
  .apply-summary {
    margin: 0 0 4px;
    font-size: 0.9rem;
  }
  .apply-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* ---------- busy panel ---------- */
  .busy-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-weight: 500;
  }
  .busy-title.ok {
    color: var(--etp-ok);
  }
  .busy-title.error {
    color: var(--etp-error);
  }
  .busy-count {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--etp-muted);
  }
  .busy-reason {
    margin: 4px 0 0;
    font-size: 0.9rem;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--etp-busy);
    border-right-color: transparent;
    flex: none;
  }
  .progress {
    height: 6px;
    margin: 10px 0 4px;
    border-radius: 3px;
    background: var(--etp-surface-2);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--etp-busy);
    transition: width 200ms;
  }
  .job-days {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.9rem;
  }
  .job-day {
    color: var(--etp-muted);
  }
  .job-day.writing,
  .job-day.verifying {
    color: var(--etp-busy);
  }
  .job-day.done {
    color: var(--etp-ok);
  }
  .job-day.failed {
    color: var(--etp-error);
    font-weight: 500;
  }
  .btn-group {
    display: flex;
    gap: 8px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ---------- sheets (native modal dialog) ---------- */
  dialog.sheet {
    border: none;
    border-radius: 16px;
    padding: 16px 20px 20px;
    width: min(360px, calc(100vw - 32px));
    box-sizing: border-box;
    background: var(--etp-surface);
    color: var(--etp-text);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  }
  dialog.sheet::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }
  @media (max-width: 600px) {
    dialog.sheet {
      margin: auto 0 0;
      width: 100%;
      max-width: 100%;
      border-radius: 16px 16px 0 0;
    }
  }
  .sheet-title {
    margin: 0 0 12px;
    font-size: 1rem;
    font-weight: 500;
  }
  .info-sheet .sheet-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title-icon {
    flex: none;
    color: var(--etp-accent);
    --mdc-icon-size: 20px;
  }
  .spinners {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }
  .spin {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* room for the focus rings of the arrows and the value */
    gap: 6px;
  }
  .spin-btn {
    width: 56px;
    height: 32px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--etp-muted);
  }
  .spin-btn:hover:not(:disabled) {
    background: var(--etp-surface-2);
    color: var(--etp-text);
  }
  .spin-btn:focus-visible {
    outline-offset: 0;
  }
  .spin-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .spin-val,
  .spin-colon {
    font-size: 2.5rem;
    font-variant-numeric: tabular-nums;
  }
  .spin-val {
    min-width: 2.2em;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--etp-surface-2);
    text-align: center;
    cursor: ns-resize;
  }
  .spin-val:focus-visible,
  .temp-slider:focus-visible {
    outline: 2px solid var(--etp-accent);
    outline-offset: 2px;
  }
  .quick {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin: 14px 0 4px;
  }
  .temp-big {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin: 4px 0 12px;
  }
  .round-btn {
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 50%;
    background: var(--etp-surface-2);
    font-size: 1.5rem;
  }
  .round-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .temp-value {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 5.5em;
    justify-content: center;
    font-size: 2.2rem;
    font-variant-numeric: tabular-nums;
  }
  .temp-slider {
    width: 100%;
    accent-color: var(--etp-accent);
  }
  .range-ends {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--etp-muted);
  }
  .sheet-issues {
    min-height: 1.4em;
    margin-top: 8px;
  }
  .sheet-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
  .dash {
    text-align: center;
    color: var(--etp-muted);
  }
  .pill {
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--etp-surface-2);
    font-size: 1.05rem;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--etp-muted);
  }
  .dot.cold {
    background: var(--etp-temp-cold);
  }
  .dot.mid {
    background: var(--etp-temp-mid);
  }
  .dot.warm {
    background: var(--etp-temp-warm);
  }
  .empty,
  .skeleton {
    padding: 18px 0;
    color: var(--etp-muted);
    border-bottom: 1px solid var(--etp-divider);
  }
  .hint {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    font-size: 0.85rem;
    color: var(--etp-muted);
  }
  .error {
    color: var(--etp-error);
  }
  .warn {
    color: var(--etp-warn);
  }
  .skeleton.unavailable p {
    margin: 0 0 4px;
  }
  .mono {
    margin: 8px 0;
    padding-left: 18px;
    font-size: 0.8rem;
    color: var(--etp-text);
  }
  .mono code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 400;
    word-break: break-all;
  }

  /* ---------- week preview ---------- */
  .week {
    display: grid;
    /* day column only as wide as dot + longest day name */
    grid-template-columns: max-content 1fr;
    row-gap: 6px;
    column-gap: 8px;
    align-items: center;
  }
  .week-day {
    background: none;
    border: none;
    padding: 2px 0;
    text-align: left;
    font-size: 0.85rem;
    color: var(--etp-muted);
  }
  /* fixed-width slot left of the day name, so all names stay aligned */
  .pending-dot {
    display: inline-block;
    width: 0.8em;
    color: var(--etp-accent);
  }
  .week-day.selected {
    color: var(--etp-accent);
    font-weight: 600;
  }
  .track {
    position: relative;
    height: 14px;
    border-radius: 4px;
    background: var(--etp-surface-2);
    overflow: hidden;
  }
  .track.selected {
    box-shadow: inset 0 0 0 1px var(--etp-accent);
  }
  .track.pending {
    outline: 1px dashed var(--etp-accent);
    outline-offset: 2px;
  }
  .track.loading {
    background: repeating-linear-gradient(
      45deg,
      var(--etp-surface-2) 0 6px,
      transparent 6px 12px
    );
  }
  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--etp-accent);
  }
  /* Z1/HWC: heating times */
  .seg.heat {
    background: var(--etp-heat);
  }
  /* temperature written inside long segments (preview mode) */
  .week.labelled .track {
    height: 18px;
  }
  .seg {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    white-space: nowrap;
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1;
    color: var(--etp-heat-text);
  }
  /* current time on today's row */
  .now {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 2px;
    margin-left: -1px;
    background: var(--etp-text);
    box-shadow: 0 0 0 1px var(--etp-surface);
    pointer-events: none;
  }
  .week-day.today {
    color: var(--etp-text);
    font-weight: 600;
  }
  .week-day.today.selected {
    color: var(--etp-accent);
  }
  /* preview mode: a click or hover on a row writes its slots out */
  .preview-mode .track {
    cursor: pointer;
  }
  .detail {
    margin: 10px 0 0;
    font-size: 0.85rem;
    color: var(--etp-text);
    min-height: 1.3em;
  }
  .detail.error {
    color: var(--etp-error);
  }
  .detail-day {
    display: inline-block;
    min-width: 2em;
    color: var(--etp-accent);
    font-weight: 600;
  }
  .axis {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--etp-muted);
  }

  @media (prefers-reduced-motion: no-preference) {
    .chip,
    .tab,
    .preset {
      transition: background-color 120ms, color 120ms, border-color 120ms;
    }
  }
`;
