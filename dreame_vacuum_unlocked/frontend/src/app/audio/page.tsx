"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../components/atoms/button/button";
import Select from "../../components/atoms/select/select";
import Spinner from "../../components/atoms/spinner/spinner";
import NavBar from "../../components/organisms/navbar/navbar";
import StatusMessage from "../../components/molecules/statusMessage/statusMessage";
import { apiUrl, call, callFormData } from "../../lib/api";
import styles from "./page.module.css";

export default function AudioPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [devices, setDevices] = useState<{ did: string; name: string }[]>([]);
  const [did, setDid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "err" | "info" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // audio file name being sent/deleted
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [audioRs, devRs] = await Promise.all([
        call<{ files: string[] }>("api/audio"),
        call<{ devices: { did: string; name?: string }[] }>("api/devices"),
      ]);
      setFiles(audioRs.data?.files ?? []);
      const devs = (devRs.data?.devices || []).map((d) => ({ did: d.did, name: d.name || d.did }));
      setDevices(devs);
      if (!did && devs.length) setDid(devs[0].did);
    } catch (e) {
      setError((e as Error).message || "Could not load audio");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send(name: string) {
    if (!did) {
      setStatus({ text: "Pick a device first", tone: "err" });
      return;
    }
    setBusy(name);
    setStatus(null);
    const rs = await call<{ ok?: boolean; detail?: string; error?: string }>(`api/audio/${encodeURIComponent(name)}/send`, {
      method: "POST",
      body: JSON.stringify({ did }),
    });
    setBusy(null);
    if (rs.ok && rs.data?.ok) setStatus({ text: `Sent ${name} to the vacuum`, tone: "ok" });
    else setStatus({ text: `Send failed: ${rs.data?.detail || rs.data?.error || rs.status}`, tone: "err" });
  }

  async function del(name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    setBusy(name);
    const rs = await call<{ ok?: boolean; error?: string }>(`api/audio/${encodeURIComponent(name)}`, { method: "DELETE" });
    setBusy(null);
    if (rs.ok || rs.data?.ok) {
      setStatus({ text: `Deleted ${name}`, tone: "ok" });
      setFiles((prev) => prev.filter((f) => f !== name));
    } else {
      setStatus({ text: `Delete failed: ${rs.data?.error || rs.status}`, tone: "err" });
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ text: `Uploading ${file.name}\u2026`, tone: "info" });
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const rs = await callFormData<{ ok?: boolean; error?: string }>("api/audio/upload", fd);
    if (rs.ok && rs.data?.ok) {
      setStatus({ text: `Uploaded ${file.name}`, tone: "ok" });
      load();
    } else {
      setStatus({ text: `Upload failed: ${rs.data?.error || rs.status}`, tone: "err" });
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <main>
      <NavBar active="audio" />

      <header className={styles.header}>
        <h1 className={styles.h1}>Audio</h1>
        <span className={styles.hint}>Upload mp3 clips; they become options in Custom voice, and can be sent to the vacuum.</span>
      </header>

      {error && <p className={styles.err}>{error}</p>}

      <div className={styles.bar}>
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          Upload mp3
        </Button>
        <input ref={fileRef} type="file" accept=".mp3,audio/mpeg" hidden onChange={onUpload} />
      </div>

      <div className={styles.bar}>
        <Select
          value={did}
          onChange={setDid}
          options={devices.map((d) => ({ value: d.did, label: d.name }))}
          placeholder={devices.length ? undefined : "No devices registered yet"}
        />
        <span className={styles.hint}>Device to target with &quot;Send to vacuum&quot; below.</span>
      </div>

      <div className={styles.cardList}>
        {!files.length && !error ? (
          <span className={styles.hint}>No audio uploaded yet.</span>
        ) : (
          files.map((f) => (
            <div className={styles.row} key={f}>
              <span className={styles.name}>{f}</span>
              <audio controls preload="none" src={apiUrl(`api/audio/${encodeURIComponent(f)}`)} />
              <Button variant="primary" className={styles.mini} disabled={busy === f} onClick={() => send(f)}>
                {busy === f ? <Spinner /> : null}Send to vacuum
              </Button>
              <Button variant="danger" className={styles.mini} disabled={busy === f} onClick={() => del(f)}>
                Delete
              </Button>
            </div>
          ))
        )}
      </div>

      <StatusMessage tone={status?.tone || "info"}>{status?.text}</StatusMessage>
    </main>
  );
}