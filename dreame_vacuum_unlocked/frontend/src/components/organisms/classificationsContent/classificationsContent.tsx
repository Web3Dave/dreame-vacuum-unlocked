"use client";

import { useEffect, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Modal from "../../../components/atoms/modal/modal";
import Select from "../../../components/atoms/select/select";
import Spinner from "../../../components/atoms/spinner/spinner";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call, readInlinedData } from "../../../lib/api";
import type { Classifier, Tag } from "../../../lib/types";
import styles from "./classificationsContent.module.css";

export default function ClassificationsContent() {
  const [classifiers, setClassifiers] = useState<Classifier[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  // create
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  // configure
  const [configuring, setConfiguring] = useState<Classifier | null>(null);
  const [cfgType, setCfgType] = useState<string>("");
  const [cfgClasses, setCfgClasses] = useState("");
  const [cfgThreshold, setCfgThreshold] = useState(0.8);
  // link
  const [linking, setLinking] = useState<Classifier | null>(null);
  const [linkTagId, setLinkTagId] = useState("");
  // train
  const [training, setTraining] = useState<string | null>(null);

  const load = async () => {
    try {
      const rs = await call<{ classifications: Classifier[]; tags: Tag[] }>("api/classifications");
      if (!rs.ok || !rs.data) throw new Error(`api/classifications -> ${rs.status}`);
      setClassifiers(rs.data.classifications || []);
      setTags(rs.data.tags || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load classifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const boot = readInlinedData<{ classifications: Classifier[]; tags: Tag[] }>();
    if (boot && boot.classifications) { setClassifiers(boot.classifications); setTags(boot.tags || []); setLoading(false); }
    else load();
  }, []);

  async function createClassification() {
    setCreateErr(null);
    const rs = await call<{ classification?: Classifier; error?: string }>("api/classifications", {
      method: "POST", body: JSON.stringify({ name: newName }),
    });
    if (!rs.ok || !rs.data?.classification) { setCreateErr(rs.data?.error || "Could not create"); return; }
    setShowCreate(false); setNewName(""); load();
  }

  async function configure(c: Classifier) {
    const rs = await call<{ ok?: boolean; error?: string }>(`api/classifications/${encodeURIComponent(c.id)}/configure`, {
      method: "POST",
      body: JSON.stringify({
        classification_type: cfgType,
        classes: cfgClasses.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean),
        threshold: cfgThreshold,
      }),
    });
    if (!rs.ok && rs.data?.error) { setError(rs.data.error); return; }
    setConfiguring(null); load();
  }

  async function linkTagTo(c: Classifier) {
    if (!linkTagId) return;
    const rs = await call(`api/classifications/${encodeURIComponent(c.id)}/tags/${encodeURIComponent(linkTagId)}`, {
      method: "POST", body: JSON.stringify({}),
    });
    setLinking(null); setLinkTagId(""); load();
  }

  async function unlink(c: Classifier, tagId: string) {
    await call(`api/classifications/${encodeURIComponent(c.id)}/tags/${encodeURIComponent(tagId)}`, { method: "DELETE" });
    load();
  }

  async function train(c: Classifier) {
    setTraining(c.id);
    const rs = await call<{ success?: boolean; message?: string }>(`api/classifications/${encodeURIComponent(c.id)}/train`, { method: "POST" });
    setStatus(rs.data?.message || (rs.data?.success ? "Training started" : "Could not start training"));
    setTraining(null);
    if (rs.data?.success) setTimeout(load, 1500);
  }

  async function del(c: Classifier) {
    if (!confirm(`Delete classification "${c.name}"?`)) return;
    await call(`api/classifications/${encodeURIComponent(c.id)}`, { method: "DELETE" });
    load();
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Classifications</h1>
        <span className={styles.sub}>{classifiers.length ? `${classifiers.length} classification(s)` : ""}</span>
      </header>

      <div className={styles.bar}>
        <Button variant="primary" onClick={() => setShowCreate(true)}>New classification</Button>
      </div>

      {error && <p className={styles.err}>{error}</p>}
      {status && <StatusMessage tone="info">{status}</StatusMessage>}

      {loading ? (
        <p className={styles.sub}><Spinner /> Loading…</p>
      ) : classifiers.length ? (
        <div className={styles.grid}>
          {classifiers.map((c) => (
            <div key={c.id} className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{c.name}</h2>
                <span className={`${c.can_train ? styles.pill : styles.pillWarn}`}>
                  {c.can_train ? (c.enabled ? "enabled" : "disabled") : "needs setup"}
                </span>
                <span className={styles.spacer} />
                <Button variant="ghost" onClick={() => { setConfiguring(c); setCfgType(c.classification_type || ""); setCfgClasses((c.classes || []).join("\n")); setCfgThreshold(c.threshold ?? 0.8); }}>Configure</Button>
                {c.can_train && <Button disabled={training === c.id} onClick={() => void train(c)}>{training === c.id ? <Spinner /> : "Train"}</Button>}
                <Button variant="danger" onClick={() => void del(c)}>Delete</Button>
              </div>

              {c.classes && c.classes.length ? (
                <div className={styles.chips}>
                  {c.classes.map((cl) => <span key={cl} className={styles.chip}>{cl}</span>)}
                </div>
              ) : null}

              <div className={styles.links}>
                <span className={styles.linksLabel}>Tags:</span>
                {(c.tags || []).map((link) => {
                  const t = tags.find((x) => x.id === link.tag_id);
                  return (
                    <span key={link.tag_id} className={styles.linkChip}>
                      {t?.name || link.tag_id}
                      <button type="button" className={styles.unlink} onClick={() => void unlink(c, link.tag_id)} title="Unlink">&times;</button>
                    </span>
                  );
                })}
                {/* the "+" button: link a tag to this classifier */}
                <span className={styles.linkAdd}>
                  <Button variant="ghost" onClick={() => { setLinking(c); setLinkTagId(""); }} title="Link a tag">+</Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p><strong>No classifications yet.</strong></p>
          <p>Create one to start tagging snapshots with a trained model.</p>
        </div>
      )}

      {/* create */}
      <Modal open={showCreate} title="New classification" onClose={() => setShowCreate(false)}
        footer={<><Button onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" onClick={() => void createClassification()}>Create</Button></>}>
        <label className={styles.field}><span>Name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. dog_pee" /></label>
        {createErr && <p className={styles.err}>{createErr}</p>}
      </Modal>

      {/* configure */}
      <Modal open={!!configuring} title="Configure" onClose={() => setConfiguring(null)}
        footer={<><Button onClick={() => setConfiguring(null)}>Cancel</Button>{configuring && <Button variant="primary" onClick={() => void configure(configuring)}>Save</Button>}</>}>
        <label className={styles.field}><span>Type</span>
          <input value={cfgType} onChange={(e) => setCfgType(e.target.value)} placeholder="e.g. binary" /></label>
        <label className={styles.field}><span>Classes (one per line)</span>
          <textarea value={cfgClasses} onChange={(e) => setCfgClasses(e.target.value)} rows={3} /></label>
        <label className={styles.field}><span>Threshold ({cfgThreshold})</span>
          <input type="number" step="0.05" min="0" max="1" value={cfgThreshold} onChange={(e) => setCfgThreshold(parseFloat(e.target.value))} /></label>
      </Modal>

      {/* link tag */}
      <Modal open={!!linking} title={`Link a tag to ${linking?.name || ""}`} onClose={() => setLinking(null)}
        footer={<><Button onClick={() => setLinking(null)}>Cancel</Button>{linking && <Button variant="primary" onClick={() => void linkTagTo(linking)}>Link</Button>}</>}>
        <label className={styles.field}><span>Tag</span>
          <Select value={linkTagId} onChange={setLinkTagId}
            options={tags.length ? tags.map((t) => ({ value: t.id, label: t.name }))
              : [{ value: "", label: "No tags yet — create one on the Tags tab" }]} /></label>
      </Modal>
    </div>
  );
}