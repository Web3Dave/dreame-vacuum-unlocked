"use client";

import Popover from "../../../components/atoms/popover/popover";
import styles from "./contextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  /** label used for the trigger's aria-label (screen readers). */
  ariaLabel?: string;
  align?: "end" | "start";
  trigger?: React.ReactNode;
}

/**
 * The generic kebab (⋮) menu used for per-capture actions (assign classifier,
 * re-run, view results, delete...). Opens inside the shared Popover so the menu
 * is portaled to a position:fixed layer and is NEVER clipped by the snapshot
 * card's border-radius / overflow — the fix for the tag-menu cut-off problem.
 */
export default function ContextMenu({ items, ariaLabel = "Options", align = "end", trigger }: ContextMenuProps) {
  return (
    <Popover
      align={align}
      trigger={(toggle) =>
        trigger ? (
          <span onClick={toggle}>{trigger}</span>
        ) : (
          <button type="button" className={styles.dots} aria-label={ariaLabel} aria-haspopup="true" onClick={toggle}>
            ⋮
          </button>
        )
      }
    >
      {(close) => (
        <>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.danger ? styles.danger : undefined}
              onClick={() => {
                close();
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}