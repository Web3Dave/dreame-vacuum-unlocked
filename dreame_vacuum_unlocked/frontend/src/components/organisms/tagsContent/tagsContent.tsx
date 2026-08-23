"use client";

import { useEffect, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Spinner from "../../../components/atoms/spinner/spinner";
import Modal from "../../../components/atoms/modal/modal";
import { call, readInlinedData, apiUrl } from "../../../lib/api";
import type { Classifier, SnapshotSummary, Tag, TagsOverviewPayload } from "../../../lib/types";
import SnapshotCard from "./snapshotCard/snapshotCard";
import { startStallDetector, logMarker } from "../../../lib/debug";
import styles from "./tagsContent.module.css";

function isVideoName(filename: string): boolean {
  return /\.(mp4|mkv|webm)$/i.test(filename);
}

export default function TagsContent() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // detail: tag whose screen is open (+ its full snapshots, paginated)
  const [detail, setDetail] = useState<Tag | null>(null);
  const [detailSnaps, setDetailSnaps] = useState<SnapshotSummary[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const PAGE = 40;

  async function openDetail(tag: Tag) {
    logMarker("tags", `open detail "${tag.name}" (${tag.count ?? "?"} snaps)`);
    setDetail(tag);
    setDetailSnaps([]);
    setDetailTotal(tag.count ?? 0);
    setDetailLoading(true);
    const rs = await call<{ snapshots: SnapshotSummary[]; total?: number }>(
      `api/tags/${encodeURIComponent(tag.id)}/snapshots?offset=0&limit=${PAGE}`
    );
    setDetailSnaps(rs.data?.snapshots || []);
    if (rs.data?.total !== undefined) setDetailTotal(rs.data.total);
    setDetailLoading(false);
  }

  async function loadMoreDetail() {
    if (!detail) return;
    setDetailLoading(true);
    const rs = await call<{ snapshots: SnapshotSummary[]; total?: number }>(
      `api/tags/${encodeURIComponent(detail.id)}/snapshots?offset=${detailSnaps.length}&limit=${PAGE}`
    );
    setDetailSnaps((prev) => [...prev, ...(rs.data?.snapshots || [])]);
    if (rs.data?.total !== undefined) setDetailTotal(rs.data.total);
    setDetailLoading(false);
  }
  // create / rename modals
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [renameName, setRenameName] = useState("");
  // results + classify
  const [resultsFor, setResultsFor] = useState<{ tag: string; filename: string } | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [classifiers, setClassifiers] = useState<{ id: string; name: string; classes: string[] }[]>([]);
  const [classifyTarget, setClassifyTarget] = useState<{ tag: string; filename: string } | null>(null);
  const [classifyCid, setClassifyCid] = useState("");
  const [classifyLabel, setClassifyLabel] = useState("");
  const [classifyErr, setClassifyErr] = useState<string | null>(null);

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
    // DEBUG: detect main-thread stalls (layout/render loop) on mobile Safari.
    logMarker("tags", `mounted, ${boot?.tags?.length ?? "?"} tags`);
    const stop = startStallDetector("tags");
    return () => stop();
  }, []);

  async function createTag() {
    setCreateErr(null);
    const rs = await call<{ tag?: Tag; error?: string }>("api/tags", {
      method: "POST", body: JSON.stringify({ name: newName, id: newId || undefined }),
    });
    if (!rs.ok || !rs.data?.tag) { setCreateErr(rs.data?.error || "Could not create tag"); return; }
    setShowCreate(false); setNewName(""); setNewId(""); load();
  }

  async function renameTag() {
    if (!renaming) return;
    const rs = await call(`api/tags/${encodeURIComponent(renaming.id)}`, { method: "PUT", body: JSON.stringify({ name: renameName }) });
    if (!rs.ok) { setError("Could not rename; check the name"); return; }
    setRenaming(null); load(); if (detail) setDetail({ ...detail, name: renameName });
  }

  async function deleteTag(id: string, count: number) {
    if (!confirm(`Delete tag and its ${count} snapshot(s)?`)) return;
    await call(`api/tags/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (detail?.id === id) setDetail(null);
    load();
  }

  async function classifySnapshot(tag: string, filename: string) {
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
      `api/tags/${encodeURIComponent(tag)}/snapshots/${encodeURIComponent(filename)}/rerun`, { method: "POST" }
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

  // ---- Tag detail view (a specific tag's screen) ----
  if (detail) {
    return (
      <div className={styles.wrap}>
        <div className={styles.top}>
          <button type="button" className={styles.back} onClick={() => setDetail(null)}>&larr; All tags</button>
          <h1 className={styles.h1}>{detail.name}</h1>
          <span className={styles.spacer} />
          <Button variant="ghost" onClick={() => { setRenaming(detail); setRenameName(detail.name); }}>Rename</Button>
          <Button variant="danger" onClick={() => void deleteTag(detail.id, detail.count ?? 0)}>Delete</Button>
        </div>

        {detail.classifications && detail.classifications.length ? (
          <div className={styles.chips}>
            {detail.classifications.map((c) => <span key={c.id} className={styles.chip}>{c.name}</span>)}
          </div>
        ) : null}

        {detailLoading ? (
          <p className={styles.sub}><Spinner /> Loading…</p>
        ) : detailSnaps.length ? (
          <div className={styles.shotsGrid}>
            {detailSnaps.map((s) => (
              <SnapshotCard key={s.filename} tag={detail.id} snap={s}
                onClassify={() => void classifySnapshot(detail.id, s.filename)}
                onRerun={() => void rerun(detail.id, s.filename)}
                onViewResults={() => void viewResults(detail.id, s.filename)} />
            ))}
          </div>
        ) : (
          <p className={styles.hint}>No snapshots for this tag yet.</p>
        )}

        {detailSnaps.length < detailTotal ? (
          <div className={styles.moreBar}>
            <Button variant="ghost" disabled={detailLoading} onClick={() => void loadMoreDetail()}>
              {detailLoading ? <Spinner /> : `Load more (${detailSnaps.length}/${detailTotal})`}
            </Button>
          </div>
        ) : null}

        {dialogs()}
      </div>
    );
  }

  // ---- Overview: horizontally scrollable tag cards, each with a "more" ----
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Tags</h1>
        <span className={styles.sub}>{tags.length ? `${tags.length} tag(s)` : ""}</span>
        <span className={styles.spacer} />
        <Button variant="primary" onClick={() => setShowCreate(true)}>New tag</Button>
      </header>

      {error && <p className={styles.err}>{error}</p>}

      {loading ? (
        <p className={styles.sub}><Spinner /> Loading…</p>
      ) : tags.length ? (
        <div className={styles.tagRow}>
          {tags.map((t) => (
            <div key={t.id} className={styles.tagCard}>
              <button type="button" className={styles.tagBody} onClick={() => void openDetail(t)}>
                <span className={styles.tagName}>{t.name}</span>
                <span className={styles.tagCount}>{t.count ?? 0}</span>
                {t.snapshots && t.snapshots[0] ? (
                  isVideoName(t.snapshots[0].filename) ? (
                    <span className={styles.tagThumb}>
                      <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" style={{ opacity: 0.7 }}>
                        <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,.12)" />
                        <path d="M10 9l5 3-5 3z" fill="#fff" />
                      </svg>
                    </span>
                  ) : (
                    <img className={styles.tagThumb} src={`${apiUrl(`snapshot/${encodeURIComponent(t.id)}/${encodeURIComponent(t.snapshots[0].filename)}`)}?w=320`} alt={t.name} loading="lazy" decoding="async" />
                  )
                ) : null}
              </button>
              <div className={styles.tagFoot}>
                {t.classifications && t.classifications.length ? (
                  <span className={styles.tagClf}>{t.classifications.length} clf</span>
                ) : <span />}
                <button type="button" className={styles.moreBtn} title="Open this tag" onClick={() => void openDetail(t)}>&rarr;</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p><strong>No tags yet.</strong></p>
          <p>A tag groups the photos a task takes.</p>
        </div>
      )}

      {dialogs()}
    </div>
  );

  // ---- shared modals ----
  function dialogs() {
    return (
      <>
        <Modal open={showCreate} title="New tag" onClose={() => setShowCreate(false)}
          footer={<><Button onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" onClick={() => void createTag()}>Create</Button></>}>
          <label className={styles.field}><span>Name</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. poop_check" /></label>
          <label className={styles.field}><span>ID (optional)</span><input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="letters/numbers" /></label>
          {createErr && <p className={styles.err}>{createErr}</p>}
        </Modal>

        <Modal open={!!renaming} title="Rename tag" onClose={() => setRenaming(null)}
          footer={<><Button onClick={() => setRenaming(null)}>Cancel</Button><Button variant="primary" onClick={() => void renameTag()}>Save</Button></>}>
          <label className={styles.field}><span>Display name</span><input value={renameName} onChange={(e) => setRenameName(e.target.value)} /></label>
        </Modal>

        {/* assign classify */}
        <Modal open={!!classifyTarget} title="Assign classification" onClose={() => setClassifyTarget(null)}
          footer={<><Button onClick={() => setClassifyTarget(null)}>Cancel</Button><Button variant="primary" disabled={!classifyCid || !classifyLabel} onClick={() => void submitClassify()}>Save</Button></>}>
          <p className={styles.hint}>Label this snapshot for the chosen classification.</p>
          <label className={styles.field}><span>Classification</span>
            <select className={styles.fieldSelect} value={classifyCid}
              onChange={(e) => { setClassifyCid(e.target.value); const c = classifiers.find((x) => x.id === e.target.value); setClassifyLabel(c?.classes?.[0] || ""); }}>
              {classifiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className={styles.field}><span>Label / class</span>
            <select className={styles.fieldSelect} value={classifyLabel} onChange={(e) => setClassifyLabel(e.target.value)}>
              {classifiers.find((c) => c.id === classifyCid)?.classes.map((cl) => <option key={cl} value={cl}>{cl}</option>)}
            </select></label>
          {classifyErr && <p className={styles.err}>{classifyErr}</p>}
        </Modal>

        {/* results */}
        <Modal open={!!resultsFor} title="Classifications" onClose={() => setResultsFor(null)}
          footer={<><Button onClick={() => setResultsFor(null)}>Close</Button>{resultsFor && <Button onClick={() => void rerun(resultsFor.tag, resultsFor.filename)}>Rerun classifiers</Button>}</>}>
          {results.length ? (
            <table className={styles.results}>
              <tbody>{results.map((r, i) => (
                <tr key={i}><td>{r.classifier || ""}</td><td>{r.label ?? ""}</td><td>{r.confidence ?? ""}</td></tr>
              ))}</tbody>
            </table>
          ) : (<p className={styles.hint}>No classification results yet. Run 'Rerun classifiers'.</p>)}
        </Modal>
      </>
    );
  }
}