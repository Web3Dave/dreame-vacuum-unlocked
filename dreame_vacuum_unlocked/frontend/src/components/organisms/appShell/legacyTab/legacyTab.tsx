"use client";

import styles from "./legacyTab.module.css";

interface LegacyTabProps {
  tab: string;
  /** Rooted URL of the not-yet-ported Jinja page, e.g. /api/hassio_ingress/<id>/maps */
  src: string;
}

/**
 * Renders a not-yet-ported tab (a server-rendered Jinja page) in an iframe
 * inside the persistent AppShell. Keep the shell nav mounted - only this frame
 * changes. The user-facing label is the tab key.
 */
export default function LegacyTab({ tab, src }: LegacyTabProps) {
  return (
    <div className={styles.wrap}>
      <iframe
        key={src}
        title={tab}
        src={src}
        className={styles.frame}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
      />
    </div>
  );
}