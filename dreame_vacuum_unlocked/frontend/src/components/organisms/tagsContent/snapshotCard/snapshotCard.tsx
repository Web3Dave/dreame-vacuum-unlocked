"use client";

import Popover from "../../../atoms/popover/popover";
import { apiUrl } from "../../../../lib/api";
import type { SnapshotSummary } from "../../../../lib/types";
import styles from "./snapshotCard.module.css";

interface SnapshotCardProps {
  tag: string;
  snap: SnapshotSummary;
  onClassify?: () => void;
  onRerun?: () => void;
  onViewResults?: () => void;
}

/**
 * A single snapshot (or clip) thumbnail inside a tag card, with a per-item
 * "⋮" menu. The menu is anchored with the shared Popover atom (portal +
 * position:fixed) so it can NEVER be clipped by the card/grid container's
 * overflow or border-radius — the exact bug that cut the old tag menus off.
 */
export default function SnapshotCard({ tag, snap, onClassify, onRerun, onViewResults }: SnapshotCardProps) {
  const isVideo = snap.kind === "video" || /\.(mp4|mkv|webm)$/i.test(snap.filename);
  const src = apiUrl(`snapshot/${encodeURIComponent(tag)}/${encodeURIComponent(snap.filename)}`);

  return (
    <figure className={styles.card}>
      <div className={styles.thumb}>
        {isVideo ? (
          // IMPORTANT: do NOT mount a real <video> element here. A grid of
          // dozens of <video preload="metadata"> elements freezes mobile
          // browsers (the whole tab hangs). Show a static clip placeholder
          // instead; the Open link plays it in the browser.
          <a className={styles.videoPlaceholder} href={src} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.5)" />
              <path d="M10 9l5 3-5 3z" fill="#fff" />
            </svg>
            <span className={styles.typeBadge}>clip</span>
          </a>
        ) : (
          <img className={styles.media} src={src} alt={snap.filename} loading="lazy" onClick={() => window.open(src, "_blank", "noopener")} />
        )}
        <div className={styles.menuAnchor}>
          <Popover
            align="end"
            id={`snap-menu-${snap.filename}`}
            trigger={(toggle) => (
              <button type="button" className={styles.dots} aria-label="Snapshot actions" onClick={toggle}>&#8942;</button>
            )}
          >
            {(close) => (
              <div className={styles.menu}>
                {onViewResults && (
                  <button type="button" onClick={() => { close(); onViewResults(); }}>View classifications</button>
                )}
                {onRerun && (
                  <button type="button" onClick={() => { close(); onRerun(); }}>Rerun classifiers</button>
                )}
                {onClassify && (
                  <button type="button" onClick={() => { close(); onClassify(); }}>Classify</button>
                )}
                <a className={styles.openLink} href={src} target="_blank" rel="noopener noreferrer">Open</a>
              </div>
            )}
          </Popover>
        </div>
      </div>
      <figcaption className={styles.caption}>{snap.filename}</figcaption>
    </figure>
  );
}