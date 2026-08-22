import type { StepTypeSpec, Task, TaskStep } from "./types";

/** Render a step as a human-readable line, mirroring tasks.html's describe(). */
export function describeStep(step: TaskStep, schema: Record<string, StepTypeSpec>): string {
  const spec = schema[step.type] || {};
  if (step.type === "if_classification") {
    const n = Object.keys((step.cases as Record<string, unknown>) || {}).length;
    return `If classification (${n} case${n === 1 ? "" : "s"})`;
  }
  const detail = (spec.fields || [])
    .filter((f) => step[f.name] !== undefined)
    .map((f) => `${f.name} ${step[f.name]}`)
    .join(", ");
  return (spec.label || step.type) + (detail ? ` (${detail})` : "");
}

/** Human-readable run-button label for a task card. */
export function runLabel(task: Task): { label: string; disabled: boolean; title?: string } {
  if (task.running) {
    const p = task.progress || {};
    const label =
      p.step && p.steps ? `Running ${p.step}/${p.steps}` : "Running";
    return { label, disabled: true };
  }
  if (task.device_busy) {
    return { label: "Vacuum busy", disabled: true, title: `Busy with ${task.busy_with || "another errand"}` };
  }
  return { label: "Run", disabled: false };
}