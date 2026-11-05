import { html, nothing, type TemplateResult } from "lit";
import { issueMessage, UI } from "../i18n/en.js";
import type { Day } from "../model/types.js";
import type { Issue } from "../model/validate.js";
import type { SlotDelta, WritePlan } from "../model/week.js";

export interface ApplyBarProps {
  plan: WritePlan;
  /** Errors that block Apply (slot errors and the day selection). */
  errors: readonly Issue[];
  /** slotDeltas(): only days whose slot count changes. */
  deltas: readonly SlotDelta[];
  dirty: boolean;
  /** Error that is not a validation issue, e.g. no service access. */
  notice?: string | null;
  onDiscard: () => void;
  onApply: () => void;
}

const short = (days: readonly Day[]) => days.map((d) => UI.dayShort[d]).join(" ");

/** `1 slot added`, or `Tu: 1 slot added · We: 1 slot removed` when the days differ. */
function deltaText(deltas: readonly SlotDelta[], plan: WritePlan): string {
  return deltas
    .map(({ delta, days }) => {
      const text = delta > 0 ? UI.slotsAdded(delta) : UI.slotsRemoved(-delta);
      return days.length === plan.write.length ? text : `${short(days)}: ${text}`;
    })
    .join(" · ");
}

export function renderApplyBar({ plan, errors, deltas, dirty, notice, onDiscard, onApply }: ApplyBarProps): TemplateResult {
  const n = plan.write.length;
  const blocked = errors.length > 0 || n === 0;
  const selectionError = errors.find((e) => e.slot === undefined);
  const slotErrors = errors.filter((e) => e.slot !== undefined).length;
  return html`<div class="apply-bar" role="region" aria-label=${UI.change}>
    ${n > 0
      ? html`<p class="apply-summary">
          <span class="muted">${UI.change}</span> ${short(plan.write)} (${UI.dayCount(n)})${deltas.length
            ? ` · ${deltaText(deltas, plan)}`
            : nothing}
          ${plan.unchanged.length ? html`<span class="muted">· ${UI.unchangedDays(short(plan.unchanged))}</span>` : nothing}
        </p>`
      : nothing}
    ${selectionError ? html`<p class="issue error">${issueMessage(selectionError)}</p>` : nothing}
    ${slotErrors ? html`<p class="issue error">${UI.errors(slotErrors)}</p>` : nothing}
    ${notice ? html`<p class="issue error" role="alert">${notice}</p>` : nothing}
    <div class="apply-actions">
      ${dirty ? html`<button class="btn" @click=${onDiscard}>${UI.discard}</button>` : html`<span></span>`}
      <button class="btn primary" ?disabled=${blocked} @click=${onApply}>✓ ${UI.applyTo(n)}</button>
    </div>
  </div>`;
}
