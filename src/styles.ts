import { css } from "lit";

export const cardStyles = css`
  :host {
    --etp-accent: var(--primary-color, #3fa38f);
    --etp-surface: var(--ha-card-background, var(--card-background-color, #1c1c1e));
    --etp-surface-2: var(--secondary-background-color, #2a2a2d);
    --etp-text: var(--primary-text-color, #f2f2f2);
    --etp-muted: var(--secondary-text-color, #9a9a9e);
    --etp-divider: var(--divider-color, rgba(255, 255, 255, 0.12));
    --etp-temp-cold: #4f8bd6;
    --etp-temp-mid: #e0a030;
    --etp-temp-warm: #c8512a;
    --etp-ok: var(--success-color, #43a047);
    --etp-busy: #e0a030;
    --etp-error: var(--error-color, #db4437);
    --etp-on-accent: var(--text-primary-color, #fff);
    display: block;
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
  .status.missing {
    background: var(--etp-error);
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
  .tab.unavailable {
    opacity: 0.45;
  }

  /* ---------- layout ---------- */
  /* narrow: days, slots, preview stacked (PLAN.md §4.1);
     wide: days + preview left, slots right (§4.6) */
  .body {
    display: grid;
    grid-template-areas: "days" "slots" "preview";
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
  @container (min-width: 720px) {
    .body {
      grid-template-columns: minmax(300px, 1fr) 1.2fr;
      grid-template-areas: "days slots" "preview slots";
      align-items: start;
    }
    .area-slots {
      border-top: none;
      border-left: 1px solid var(--etp-divider);
      align-self: stretch;
    }
  }
  .section {
    padding: 12px 16px;
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
    grid-template-columns: 4.5em 1.5em 4.5em 1fr;
    align-items: center;
    gap: 4px;
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
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .dash {
    text-align: center;
    color: var(--etp-muted);
  }
  .pill {
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
  .dot.cold,
  .seg.cold {
    background: var(--etp-temp-cold);
  }
  .dot.mid,
  .seg.mid {
    background: var(--etp-temp-mid);
  }
  .dot.warm,
  .seg.warm {
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
    grid-template-columns: 2.2em 1fr;
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
  .axis {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--etp-muted);
  }
  .footnote {
    padding: 10px 16px 14px;
    font-size: 0.8rem;
    color: var(--etp-muted);
    border-top: 1px solid var(--etp-divider);
  }

  @media (prefers-reduced-motion: no-preference) {
    .chip,
    .tab,
    .preset {
      transition: background-color 120ms, color 120ms, border-color 120ms;
    }
  }
`;
