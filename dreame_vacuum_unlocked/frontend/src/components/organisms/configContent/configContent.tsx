"use client";

import { useEffect, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Spinner from "../../../components/atoms/spinner/spinner";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call } from "../../../lib/api";
import styles from "./configContent.module.css";

export default function ConfigContent() {
  const [config, setConfig] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err" | "info">("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rs = await call<{ yaml?: string; error?: string }>("api/config/raw");
      if (!rs.ok || rs.data?.yaml === undefined) { setStatus(rs.data?.error || "Could not load config"); setTone("err"); return; }
      setConfig(rs.data.yaml);
      setStatus(null);
    } catch (e) {
      setStatus((e as Error).message || "Could not load config"); setTone("err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  async function save() {
    setSaving(true); setStatus("");
    const rs = await call<{ ok?: boolean; error?: string }>("api/config/raw", {
      method: "PUT",
      body: JSON.stringify({ yaml: config }),
    });
    setSaving(false);
    if (!rs.ok && rs.data?.error) { setStatus(rs.data.error); setTone("err"); return; }
    setStatus("Saved"); setTone("ok");
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Config</h1>
      </header>

      {status && <StatusMessage tone={tone}>{status}</StatusMessage>}

      {loading ? (
        <p className={styles.sub}><Spinner /> Loading…</p>
      ) : (
        <>
          <textarea
            className={styles.editor}
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            rows={30}
            spellCheck={false}
          />
          <div className={styles.bar}>
            <Button onClick={() => void load()}>Reload</Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? <Spinner /> : "Save"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}