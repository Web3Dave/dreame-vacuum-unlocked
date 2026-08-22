"use client";

import Popover from "../../../components/atoms/popover/popover";
import { readBase, routeHref } from "../../../lib/api";
import styles from "./settingsGear.module.css";

const MENU: { path: string; label: string }[] = [
  { path: "config", label: "Config" },
  { path: "voice", label: "Custom voice" },
  { path: "audio", label: "Audio" },
];

export default function SettingsGear() {
  const base = readBase();
  return (
    <div className={styles.menu}>
      <Popover
        align="end"
        id="settings-menu"
        trigger={(toggle) => (
          <button type="button" className={styles.btn} aria-haspopup="true" aria-expanded={false} title="Settings" onClick={toggle}>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      >
        {() => (
          <>
            {MENU.map((item) => (
              <a key={item.path} href={routeHref(base, item.path)} role="menuitem">
                {item.label}
              </a>
            ))}
          </>
        )}
      </Popover>
    </div>
  );
}