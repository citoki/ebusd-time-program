import { html, nothing, type TemplateResult } from "lit";
import { UI } from "../i18n/en.js";
import type { Day } from "../model/types.js";
import type { FailReason, JobItem, JobSnapshot } from "../write-job.js";

export interface BusyPanelProps {
  job: JobSnapshot;
  programName: string;
  verifyTimeoutS: number;
  onCancel: () => void;
  onRetry: () => void;
  onRestore: () => void;
  onClose: () => void;
}

const ICON: Record<JobItem["state"], string> = {
  queued: "·",
  writing: "⟳",
  verifying: "⟳",
  done: "✓",
  failed: "✗",
  skipped: "·",
};

const short = (days: readonly Day[]) => days.map((d) => UI.dayShort[d]).join(" ");

export function reasonText(reason: FailReason | undefined, timeoutS: number): string {
  if (!reason) return "";
  switch (reason.code) {
    case "count":
      return UI.reason.count(reason.actual, reason.expected);
    case "slot":
      return UI.reason.slot(reason.index, reason.actual, reason.expected);
    case "timeout":
      return UI.reason.timeout(timeoutS);
    case "publish":
      return UI.reason.publish(reason.message);
  }
}

/** Progress (PLAN.md §4.5) while a job runs, and its result afterwards. Replaces the ApplyBar. */
export function renderBusyPanel(p: BusyPanelProps): TemplateResult {
  const { job } = p;
  const total = job.items.length;
  const done = job.items.filter((i) => i.state === "done").length;
  const doneDays = job.items.filter((i) => i.state === "done").map((i) => i.day);
  const failed = job.items.find((i) => i.state === "failed");
  const canRestore = job.kind !== "restore" && job.items.some((i) => i.state === "done" || i.state === "failed");

  let head: TemplateResult;
  let actions: TemplateResult;
  switch (job.status) {
    case "running":
      head = html`<p class="busy-title">
        <span class="spinner" aria-hidden="true"></span>
        ${job.kind === "restore" ? UI.restoring(p.programName) : UI.writing(p.programName)}
        <span class="busy-count">${UI.progress(done, total)}</span>
      </p>`;
      actions = html`<span></span>
        <button class="btn" ?disabled=${job.cancelRequested || done + 1 >= total} @click=${p.onCancel}>
          ${job.cancelRequested ? UI.cancelling : UI.cancelAfterDay}
        </button>`;
      break;
    case "done":
      head = html`<p class="busy-title ok">
        ✓ ${job.kind === "restore" ? UI.restored : UI.saved(short(doneDays), doneDays.length)}
      </p>`;
      actions = html`<span></span><button class="btn" @click=${p.onClose}>${UI.close}</button>`;
      break;
    case "failed":
      head = html`<p class="busy-title error">✗ ${UI.failedAt(failed ? UI.dayLong[failed.day] : "")}</p>
        <p class="busy-reason">${reasonText(failed?.reason, p.verifyTimeoutS)}</p>`;
      actions = renderEndActions(p, canRestore, UI.retry);
      break;
    case "cancelled":
      head = html`<p class="busy-title">${UI.cancelled}</p>
        <p class="busy-reason">${UI.cancelledHelp(short(doneDays))}</p>`;
      actions = renderEndActions(p, canRestore, UI.continueWrite);
      break;
  }

  return html`<div class="apply-bar busy-panel ${job.status}">
    <div role="status" aria-live="polite">${head}</div>
    ${job.status === "running"
      ? html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${total} aria-valuenow=${done}>
          <span style="width:${total ? (done / total) * 100 : 0}%"></span>
        </div>`
      : nothing}
    <ul class="job-days">
      ${job.items.map(
        (i) => html`<li class="job-day ${i.state}" title=${reasonText(i.reason, p.verifyTimeoutS) || UI.dayState[i.state]}>
          <span aria-hidden="true">${ICON[i.state]}</span> ${UI.dayShort[i.day]}
          ${i.state === "writing" || i.state === "verifying"
            ? html`<span class="muted">${UI.dayState[i.state]}</span>`
            : html`<span class="sr-only">${UI.dayState[i.state]}</span>`}
        </li>`,
      )}
    </ul>
    <div class="apply-actions">${actions}</div>
  </div>`;
}

function renderEndActions(p: BusyPanelProps, canRestore: boolean, retryLabel: string): TemplateResult {
  const retryable = p.job.items.some((i) => i.state !== "done");
  return html`${canRestore
      ? html`<button class="btn" @click=${p.onRestore}>${UI.restorePrevious}</button>`
      : html`<span></span>`}
    <span class="btn-group">
      <button class="btn" @click=${p.onClose}>${UI.close}</button>
      ${retryable ? html`<button class="btn primary" @click=${p.onRetry}>${retryLabel}</button>` : nothing}
    </span>`;
}
