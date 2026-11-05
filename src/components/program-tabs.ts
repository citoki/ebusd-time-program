import { html, type TemplateResult } from "lit";
import type { ReadStatus } from "../adapters/mqtt.js";
import { PROGRAM_SHORT, type ResolvedProgram } from "../config.js";
import { UI } from "../i18n/en.js";

export function renderTabs(
  programs: readonly ResolvedProgram[],
  statuses: readonly ReadStatus[],
  active: number,
  onSelect: (index: number) => void,
  dirty: readonly boolean[] = [],
  disabled = false,
): TemplateResult {
  const onKey = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta || disabled) return;
    e.preventDefault();
    const next = (active + delta + programs.length) % programs.length;
    onSelect(next);
    const tabs = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(".tab");
    tabs[next]?.focus();
  };
  return html`<div class="tabs" role="tablist" @keydown=${onKey}>
    ${programs.map(
      (p, i) =>
        html`<button
          class="tab ${statuses[i] === "missing" ? "unavailable" : ""}"
          role="tab"
          aria-selected=${i === active ? "true" : "false"}
          tabindex=${i === active ? 0 : -1}
          ?disabled=${disabled}
          title=${statuses[i] === "missing"
            ? `${p.name}: ${UI.status.missing}`
            : dirty[i]
              ? `${p.name} (${UI.unsaved})`
              : p.name}
          @click=${() => onSelect(i)}
        >
          ${PROGRAM_SHORT[p.spec.id]}${dirty[i]
            ? html`<span class="tab-dirty" aria-label=${UI.unsaved}> •</span>`
            : ""}
        </button>`,
    )}
  </div>`;
}
