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
  const isVideo = /\.(mp4|mkv|webm)$/i.test(snap.filename);
  const src = apiUrl(`snapshot/${encodeURIComponent(tag)}/${encodeURIComponent(snap.filename)}`);

  return (
    <figure className={styles.card}>
      <div className={styles.thumb}>
        {isVideo ? (
          <video className={styles.media} src={src} preload="metadata" muted playsInline />
        ) : (
          <img className={styles.media} src={src} alt={snap.filename} loading="lazy" />
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