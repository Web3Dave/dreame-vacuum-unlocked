"use client";

import { useEffect, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Spinner from "../../../components/atoms/spinner/spinner";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call } from "../../../lib/api";
import styles from "./voiceContent.module.css";

interface VoiceSlot {
  id: string;
  name?: string;
  en?: string;
}

export default function VoiceContent() {
  const [mappings, setMappings] = useState<VoiceSlot[]>([]);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err" | "info">("info");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mapsRs, audRs] = await Promise.all([
          call<{ mappings: VoiceSlot[] }>("api/voice/mappings"),
          call<{ files: string[] }>("api/audio"),
        ]);
        if (!alive) return;
        setMappings(mapsRs.data?.mappings || []);
        setAudioFiles(audRs.data?.files || []);
      } catch (e) {
        if (alive) setError((e as Error).message || "Could not load voice data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function apply() {
    // pick only non-empty selections
    const sel: Record<string, string> = {};
    for (const [id, val] of Object.entries(selections)) if (val) sel[id] = val;
    if (!Object.keys(sel).length) { setTone("err"); setStatus("Pick at least one sound first"); return; }
    setApplying(true); setStatus(null);
    const packUrl = `${location.origin}/local/dreame_vacuum_unlocked/audio/upload.tar.gz`;
    const rs = await call<{ ok?: boolean; error?: string }>("api/voice/apply", {
      method: "POST",
      body: JSON.stringify({ url: packUrl, selections: sel }),
    });
    setApplying(false);
    if (!rs.ok || !rs.data?.ok) { setTone("err"); setStatus(rs.data?.error || "Could not apply the voice pack"); return; }
    setTone("ok"); setStatus("Voice pack applied.");
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Custom voice</h1>
        <span className={styles.sub}>Map uploaded mp3 clips to the vacuum&apos;s sound slots.</span>
      </header>

      {error && <StatusMessage tone="err">{error}</StatusMessage>}
      {status && <StatusMessage tone={tone}>{status}</StatusMessage>}

      {loading ? (
        <p className={styles.sub}><Spinner /> Loading…</p>
      ) : (
        <>
          <div className={styles.rows}>
            {mappings.map((m) => {
              const sub = m.en ? `tts id: ${m.id} · ${m.en}` : `tts id: ${m.id}`;
              return (
                <div key={m.id} className={styles.row}>
                  <div className={styles.nameBlock}>
                    <b>{m.name || m.id}</b>
                    <span className={styles.id}>{sub}</span>
                  </div>
                  <select
                    className={styles.audio}
                    value={selections[m.id] || ""}
                    onChange={(e) => setSelections((p) => ({ ...p, [m.id]: e.target.value }))}
                  >
                    <option value="">No audio</option>
                    {audioFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              );
            })}
            {!mappings.length && <p className={styles.hint}>No sound slots available.</p>}
          </div>
          <div className={styles.bar}>
            <Button variant="primary" disabled={applying} onClick={() => void apply()}>
              {applying ? <Spinner /> : "Apply voice pack"}
            </Button>
          </div>
          <p className={styles.hint}>Upload mp3 clips on the Audio tab first; then pick them here.</p>
        </>
      )}
    </div>
  );
}