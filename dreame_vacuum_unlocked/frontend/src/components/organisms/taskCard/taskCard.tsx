"use client";

import { useState } from "react";
import Button from "../../../components/atoms/button/button";
import Spinner from "../../../components/atoms/spinner/spinner";
import { routeHref, hashHref } from "../../../lib/api";
import { describeStep, runLabel } from "../../../lib/tasks";
import type { StepTypeSpec, Task } from "../../../lib/types";
import styles from "./taskCard.module.css";

interface TaskCardProps {
  task: Task;
  schema: Record<string, StepTypeSpec>;
  onRun: (slug: string) => Promise<string | null>;
  onDelete: (slug: string) => void;
  onExport: (slug: string) => Promise<string | null>;
  busySlug: string | null;
}

export default function TaskCard({ task, schema, onRun, onDelete, onExport, busySlug }: TaskCardProps) {
  const [exporting, setExporting] = useState(false);
  const run = runLabel(task);
  const activeStep = task.running ? task.progress?.step : undefined;
  const isBusy = busySlug === task.slug;

  return (
    <div className={`${styles.task}${task.running ? ` ${styles.live}` : ""}`}>
      <div className={styles.head}>
        <h2 className={styles.title}>{task.name}</h2>
        <span className={styles.slug}>{task.slug}</span>
        {task.running ? (
          <span className={`${styles.pill} ${styles.runLive}`}>running</span>
        ) : null}
        <span className={styles.spacer} />
        <Button
          variant="primary"
          disabled={run.disabled || isBusy}
          title={run.title}
          onClick={() => void onRun(task.slug)}
        >
          {isBusy ? <Spinner /> : null}
          {run.label}
        </Button>
        <a href={routeHref(`tasks/${task.slug}/edit`)}>
          <Button>Edit</Button>
        </a>
        <Button disabled={isBusy} onClick={() => void onExport(task.slug)}>
          {exporting ? "Exporting…" : "Export"}
        </Button>
        <Button variant="danger" disabled={run.disabled || isBusy} onClick={() => onDelete(task.slug)}>
          Delete
        </Button>
      </div>

      {task.steps?.length ? (
        <ol className={styles.steps}>
          {task.steps.map((s, i) => {
            const at = task.running && activeStep === i + 1;
            return (
              <li key={i} className={at ? styles.at : undefined}>
                {describeStep(s, schema)}
              </li>
            );
          })}
        </ol>
      ) : null}

      {task.running && task.progress?.run_id ? (
        <p className={styles.hint}>
          Run {task.progress.run_id}
          {task.progress.detail ? ` · ${task.progress.detail}` : ""} ·{" "}
          <a
            href={hashHref("activity")}
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = hashHref("activity").split("#")[1] || "";
            }}
          >
            follow in Activity
          </a>
        </p>
      ) : null}
    </div>
  );
}