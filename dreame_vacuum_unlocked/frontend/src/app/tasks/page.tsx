"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../components/atoms/button/button";
import Modal from "../../components/atoms/modal/modal";
import NavBar from "../../components/organisms/navbar/navbar";
import TaskCard from "../../components/organisms/taskCard/taskCard";
import { call, readInlinedData } from "../../lib/api";
import type { TasksPayload } from "../../lib/types";
import styles from "./page.module.css";

export default function TasksPage() {
  const [data, setData] = useState<TasksPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [exportSlug, setExportSlug] = useState<string | null>(null);
  const [exportYaml, setExportYaml] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<() => void>(() => {});

  const applyData = useCallback((payload: TasksPayload) => {
    setData(payload);
    setError(null);
    const active = payload.tasks.some((t) => t.running || t.device_busy);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (active) timerRef.current = setTimeout(loadRef.current, 2000);
  }, []);

  const load = useCallback(async () => {
    try {
      const rs = await call<TasksPayload>("api/tasks");
      if (!rs.ok) throw new Error(`api/tasks -> ${rs.status}`);
      applyData(rs.data);
    } catch (e) {
      setError((e as Error).message || "Could not load tasks");
    }
  }, [applyData]);

  // Keep loadRef pointing at the latest load (breaks the applyData<->load cycle).
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    // Option 1: hydrate from the server-inlined bootstrap when present (no
    // first-load fetch). Still arm polling if a task is running/busy.
    const boot = readInlinedData<TasksPayload>();
    if (boot && boot.tasks) {
      applyData(boot);
    } else {
      load();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [applyData, load]);

  async function runTask(slug: string): Promise<string | null> {
    setBusySlug(slug);
    const rs = await call<{ success?: boolean; error?: string }>(`api/tasks/${encodeURIComponent(slug)}/run`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    // The run may take minutes; re-poll straight away so the button reflects it.
    setTimeout(load, 800);
    if (!rs.ok && rs.data?.error) {
      alert(rs.data.error);
    }
    setBusySlug(null);
    return rs.data?.error ?? null;
  }

  async function deleteTask(slug: string) {
    if (!confirm(`Delete ${slug}?`)) return;
    await call(`api/tasks/${encodeURIComponent(slug)}`, { method: "DELETE" });
    load();
  }

  async function exportTask(slug: string): Promise<string | null> {
    const rs = await call<{ yaml?: string; error?: string }>(`api/tasks/${encodeURIComponent(slug)}/export`);
    const yaml = rs.data?.yaml ?? rs.data?.error ?? "Nothing to export";
    setExportYaml(yaml);
    setExportSlug(slug);
    return yaml;
  }

  return (
    <main>
      <NavBar active="tasks" />

      <header className={styles.header}>
        <h1 className={styles.h1}>Tasks</h1>
        <span className={styles.sub}>{data?.tasks.length ? `${data.tasks.length} task(s)` : ""}</span>
      </header>

      <div className={styles.bar}>
        <Button variant="primary" onClick={() => (window.location.href = "tasks/new")}>
          New task
        </Button>
      </div>

      {error && <p className={styles.err}>{error}</p>}

      {!data ? (
        !error && <p className={styles.sub}>Loading…</p>
      ) : !data.tasks.length ? (
        <div className={styles.empty}>
          <p>
            <strong>No tasks yet</strong>
          </p>
          <p>A task is a sequence of moves — drive somewhere, face a direction, photograph it.</p>
        </div>
      ) : (
        data.tasks.map((t) => (
          <TaskCard
            key={t.slug}
            task={t}
            schema={data.step_types}
            onRun={runTask}
            onDelete={deleteTask}
            onExport={exportTask}
            busySlug={busySlug}
          />
        ))
      )}

      <Modal
        open={!!exportSlug}
        title="Export to Home Assistant"
        onClose={() => setExportSlug(null)}
        footer={
          <>
            <Button onClick={() => setExportSlug(null)}>Close</Button>
            <Button
              variant="primary"
              onClick={() => {
                navigator.clipboard?.writeText(exportYaml);
              }}
            >
              Copy
            </Button>
          </>
        }
      >
        <p className={styles.hint}>
          Paste into <code>scripts.yaml</code>, then reload scripts. This is a copy — once pasted it is yours, and the task
          here will not track your edits.
        </p>
        <pre className={styles.export}>{exportYaml}</pre>
      </Modal>
    </main>
  );
}