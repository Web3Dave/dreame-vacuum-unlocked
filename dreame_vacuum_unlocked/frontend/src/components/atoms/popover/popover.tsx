"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./popover.module.css";

export interface PopoverProps {
  trigger: (open: () => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  /** Position the popover relative to the viewport (fixed) or the trigger rect. */
  align?: "end" | "start";
  /** Give the popover an id + aria for a11y wiring to the trigger. */
  id?: string;
}

/**
 * The ONE way popups open in this app. Renders into a portal at document.body
 * on a `position:fixed` layer, so it is NEVER clipped by an ancestor's overflow,
 * border-radius, or transform — the issue that previously made the settings gear
 * and per-capture tag menus get cut off. All menus (nav gear, snapshot/ tag
 * menus, context menus) must use this, not a bare absolutely-positioned div.
 */
export default function Popover({ trigger, children, align = "end", id }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      if (align === "end") {
        setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
      } else {
        setPos({ top: r.bottom + 6, left: r.left });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, align]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <span ref={btnRef} className={styles.anchor} onClick={(e) => e.stopPropagation()}>
        {trigger(() => setOpen((o) => !o))}
      </span>
      {typeof document !== "undefined" &&
        open &&
        pos &&
        createPortal(
          <div
            id={id}
            role="menu"
            className={styles.layer}
            style={{ top: pos.top, right: pos.right, left: pos.left }}
            data-popover=""
            onClick={(e) => e.stopPropagation()}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </>
  );
}