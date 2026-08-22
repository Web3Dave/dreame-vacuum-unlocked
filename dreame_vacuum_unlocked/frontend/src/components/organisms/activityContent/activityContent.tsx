"use client";

import { useEffect, useState } from "react";
import Spinner from "../../../components/atoms/spinner/spinner";
import { call } from "../../../lib/api";
import styles from "./activityContent.module.css";

interface RunStep {
  at?: number;
  text?: string;
}

export interface Run {
  id?: number;
  did?: string;
  command?: string;
  ok?: boolean | null;
  running?: boolean;
  at?: number;
  summary?: string;
  detail?: Record<string, unknown>;
  run_uid?: string;
  steps?: RunStep[];
}

export default function ActivityContent() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const rs = await call<{ runs: Run[] }>("api/runs");
      if (!rs.ok || !rs.data) throw new Error(`api/runs -> ${rs.status}`);
      setRuns(rs.data.runs || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const fmt = (unix: number) => {
    const d = new Date(unix * 1000);
    return d.toLocaleString();
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Activity</h1>
        <span className={styles.sub}>{runs.length ? `${runs.length} run(s)` : ""}</span>
      </header>

      {error && <p className={styles.err}>{error}</p>}

      {loading ? (
        <p className={styles.sub}><Spinner /> Loading…</p>
      ) : runs.length ? (
        <div className={styles.list}>
          {runs.map((r) => (
            <div key={r.id} className={styles.run}>
              <div className={styles.runHead}>
                <span className={`${styles.pill} ${r.running ? styles.pillLive : r.ok ? styles.pillOk : styles.pillBad}`}>
                  {r.running ? "running" : r.ok ? "ok" : "failed"}
                </span>
                <span className={styles.cmd}>{r.command}</span>
                <span className={styles.spacer} />
                <span className={styles.time}>{r.at ? fmt(r.at) : ""}</span>
              </div>
              {r.summary && <p className={styles.summary}>{r.summary}</p>}
              {r.steps && r.steps.length ? (
                <ol className={styles.steps}>
                  {r.steps.map((s, i) => (
                    <li key={i} className={styles.stepItem}>
                      <span className={styles.stepTime}>{s.at ? (new Date(s.at * 1000)).toLocaleTimeString() : ""}</span>
                      <span>{s.text}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p><strong>No runs yet.</strong></p>
          <p>Run a task from the Tasks tab to see its activity here.</p>
        </div>
      )}
    </div>
  );
}