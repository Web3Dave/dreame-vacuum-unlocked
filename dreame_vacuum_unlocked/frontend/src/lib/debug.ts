"use client";

/**
 * Minimal main-thread stall detector for diagnosing UI freezes on mobile/Safari.
 *
 * A setInterval callback that should fire ~every 1000ms will instead fire much
 * LATER if the main thread is blocked by a synchronous loop (React render loop,
 * endless layout/repaint). The delta is logged to the console so a user can
 * read "blocked for Nms" in Safari's Web Inspector and tell us.
 *
 * Usage: startStallDetector() from a suspicious screen. Returns a stop() fn.
 */
export function startStallDetector(tag = "ui"): () => void {
  let last = performance.now();
  let stop = false;
  const id = setInterval(() => {
    const now = performance.now();
    const drift = now - last - 1000;
    last = now;
    if (drift > 250) {
      // The interval fired late -> the main thread was blocked for `drift` ms.
      // eslint-disable-next-line no-console
      console.log(`[${tag}] main thread BLOCKED for ~${drift.toFixed(0)}ms (layout/render loop?)`);
    }
  }, 1000);
  return () => {
    stop = true;
    clearInterval(id);
  };
}

/** Log a one-time marker to the console (surfaced in Web Inspector). */
export function logMarker(tag: string, msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${msg}`);
}