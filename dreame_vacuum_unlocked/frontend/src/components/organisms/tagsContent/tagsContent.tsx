"use client";

import { useEffect, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Spinner from "../../../components/atoms/spinner/spinner";
import Modal from "../../../components/atoms/modal/modal";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call, readInlinedData, apiUrl } from "../../../lib/api";
import type { SnapshotSummary, Tag, TagsOverviewPayload } from "../../../lib/types";
import SnapshotCard from "./snapshotCard/snapshotCard";
import styles from "./tagsContent.module.css";

export default function TagsContent() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  // rename
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [renameName, setRenameName] = useState("");
  // results dialog
  const [resultsFor, setResultsFor] = useState<{ tag: string; filename: string } | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    try {
      const rs = await call<TagsOverviewPayload>("api/tags/overview");
      if (!rs.ok || !rs.data) throw new Error(`api/tags/overview -> ${rs.status}`);
      setTags(rs.data.tags || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load tags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const boot = readInlinedData<TagsOverviewPayload>();
    if (boot && boot.tags) { setTags(boot.tags); setLoading(false); }
    else load();
  }, []);

  async function createTag() {
    setCreateErr(null);
    const rs = await call<{ tag?: Tag; error?: string }>("api/tags", {
      method: "POST",
      body: JSON.stringify({ name: newName, id: newId || undefined }),
    });
    if (!rs.ok || !rs.data?.tag) { setCreateErr(rs.data?.error || "Could not create tag"); return; }
    setShowCreate(false); setNewName(""); setNewId(""); load();
  }

  async function renameTag() {
    if (!renaming) return;
    const rs = await call(`api/tags/${encodeURIComponent(renaming.id)}`, {
      method: "PUT",
      body: JSON.stringify({ name: renameName }),
    });
    if (!rs.ok) { setError("Could not rename; check the name"); return; }
    setRenaming(null); load();
  }

  async function deleteTag(id: string, count: number) {
    if (!confirm(`Delete tag and its ${count} snapshot(s)?`)) return;
    await call(`api/tags/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  // classify (assign a classification + label to a snapshot)
  const [classifyTarget, setClassifyTarget] = useState<{ tag: string; filename: string } | null>(null);
  const [classifiers, setClassifiers] = useState<{ id: string; name: string; classes: string[] }[]>([]);
  const [classifyCid, setClassifyCid] = useState("");
  const [classifyLabel, setClassifyLabel] = useState("");
  const [classifyErr, setClassifyErr] = useState<string | null>(null);

  async function classifySnapshot(tag: string, filename: string) {
    // Load the classifier list so the assign modal can offer classifier + label.
    const rs = await call<{ classifications: { id: string; name: string; classes: string[] }[] }>("api/classifications");
    const list = rs.data?.classifications || [];
    setClassifiers(list);
    setClassifyCid(list[0]?.id || "");
    setClassifyLabel(list[0]?.classes?.[0] || "");
    setClassifyErr(null);
    setClassifyTarget({ tag, filename });
  }

  async function submitClassify() {
    if (!classifyTarget || !classifyCid || !classifyLabel) return;
    const rs = await call<{ ok?: boolean; error?: string }>(
      `api/tags/${encodeURIComponent(classifyTarget.tag)}/snapshots/${encodeURIComponent(classifyTarget.filename)}/classify`,
      { method: "POST", body: JSON.stringify({ classification_id: classifyCid, label: classifyLabel }) }
    );
    if (!rs.ok && rs.data?.error) { setClassifyErr(rs.data.error); return; }
    setClassifyTarget(null);
  }

  async function rerun(tag: string, filename: string) {
    const rs = await call<{ ok?: boolean; error?: string }>(
      `api/tags/${encodeURIComponent(tag)}/snapshots/${encodeURIComponent(filename)}/rerun`,
      { method: "POST" }
    );
    if (!rs.ok && rs.data?.error) setError(rs.data.error);
  }

  async function viewResults(tag: string, filename: string) {
    const rs = await call<{ results?: { classifier?: string; label?: string; confidence?: number }[] }>(
      `api/tags/${encodeURIComponent(tag)}/snapshots/${encodeURIComponent(filename)}/results`
    );
    setResults(rs.data?.results || []);
    setResultsFor({ tag, filename });
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Tags</h1>
        <span className={styles.sub}>{tags.length ? `${tags.length} tag(s)` : ""}</span>
      </header>

      <div className={styles.bar}>
        <Button variant="primary" onClick={() => setShowCreate(true)}>New tag</Button>
      </div>

      {error && <p className={styles.err}>{error}</p>}
      {status && <p className={styles.status}>{status}</p>}

      {loading ? (
        <p className={styles.sub}><Spinner /> Loading…</p>
      ) : tags.length ? (
        <div className={styles.grid}>
          {tags.map((t) => (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{t.name}</h2>
                <span className={styles.cardSub}>{t.count ?? 0} snapshot{(t.count ?? 0) === 1 ? "" : "s"}</span>
                <span className={styles.spacer} />
                <Button variant="ghost" onClick={() => { setRenaming(t); setRenameName(t.name); }}>Rename</Button>
                <Button variant="danger" onClick={() => void deleteTag(t.id, t.count ?? 0)}>Delete</Button>
              </div>
              {t.classifications && t.classifications.length ? (
                <div className={styles.chips}>
                  {t.classifications.map((c) => <span key={c.id} className={styles.chip}>{c.name}</span>)}
                </div>
              ) : null}
              {t.snapshots && t.snapshots.length ? (
                <div className={styles.shots}>
                  {t.snapshots.map((s) => (
                    <SnapshotCard
                      key={s.filename}
                      tag={t.id}
                      snap={s}
                      onClassify={async () => { await classifySnapshot(t.id, s.filename); }}
                      onRerun={() => void rerun(t.id, s.filename)}
                      onViewResults={() => void viewResults(t.id, s.filename)}
                    />
                  ))}
                </div>
              ) : (
                <p className={styles.hint}>No snapshots yet for this tag.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p><strong>No tags yet.</strong></p>
          <p>A tag groups the photos a task takes.</p>
        </div>
      )}

      {/* create */}
      <Modal open={showCreate} title="New tag" onClose={() => setShowCreate(false)}
        footer={<>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void createTag()}>Create</Button>
        </>}>
        <label className={styles.field}>
          <span>Name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. poop_check" />
        </label>
        <label className={styles.field}>
          <span>ID (optional)</span>
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="letters/numbers" />
        </label>
        {createErr && <p className={styles.errModal}>{createErr}</p>}
      </Modal>

      {/* rename */}
      <Modal open={!!renaming} title="Rename tag" onClose={() => setRenaming(null)}
        footer={<>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => void renameTag()}>Save</Button>
        </>}>
        <label className={styles.field}>
          <span>Display name</span>
          <input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
        </label>
        {renaming && <p className={styles.hint}>The id ({renaming.id}) stays unchanged.</p>}
      </Modal>

      {/* assign classify */}
      <Modal open={!!classifyTarget} title="Assign classification" onClose={() => setClassifyTarget(null)}
        footer={<>
          <Button onClick={() => setClassifyTarget(null)}>Cancel</Button>
          <Button variant="primary" disabled={!classifyCid || !classifyLabel} onClick={() => void submitClassify()}>Save</Button>
        </>}>
        <p className={styles.hint}>Label this snapshot for the chosen classification.</p>
        <label className={styles.field}>
          <span>Classification</span>
          <select className={styles.fieldSelect} value={classifyCid}
            onChange={(e) => { setClassifyCid(e.target.value); const c = classifiers.find((x) => x.id === e.target.value); setClassifyLabel(c?.classes?.[0] || ""); }}>
            {classifiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Label / class</span>
          <select className={styles.fieldSelect} value={classifyLabel} onChange={(e) => setClassifyLabel(e.target.value)}>
            {classifiers.find((c) => c.id === classifyCid)?.classes.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
          </select>
        </label>
        {classifyErr && <p className={styles.errModal}>{classifyErr}</p>}
      </Modal>

      {/* results */}
      <Modal open={!!resultsFor} title="Classifications" onClose={() => setResultsFor(null)}
        footer={<>
          <Button onClick={() => setResultsFor(null)}>Close</Button>
          {resultsFor && <Button onClick={() => void rerun(resultsFor.tag, resultsFor.filename)}>Rerun classifiers</Button>}
        </>}>
        {results.length ? (
          <table className={styles.results}>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}><td>{r.classifier || ""}</td><td>{r.label ?? ""}</td><td>{r.confidence ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.hint}>No classification results yet. Run 'Rerun classifiers'.</p>
        )}
      </Modal>
    </div>
  );
}