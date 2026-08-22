"use client";

import { useEffect } from "react";
import Button from "../button/button";
import styles from "./modal.module.css";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** A `position:fixed` modal overlay. Uses React portal to body like Popover. */
export default function Modal({ open, title, onClose, footer, children }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <strong className={styles.title}>{title}</strong>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </div>
  );
}