"use client";

import { useEffect, useState } from "react";
import NavBar from "../navbar/navbar";
import DevicesContent from "../devicesContent/devicesContent";
import AudioContent from "../audioContent/audioContent";
import TasksContent from "../tasksContent/tasksContent";
import MapContent from "../mapContent/mapContent";
import TagsContent from "../tagsContent/tagsContent";
import ClassificationsContent from "../classificationsContent/classificationsContent";
import ActivityContent from "../activityContent/activityContent";
import ConfigContent from "../configContent/configContent";
import VoiceContent from "../voiceContent/voiceContent";
import CleaningContent from "../cleaningContent/cleaningContent";
import LegacyTab from "./legacyTab/legacyTab";
import { readBase } from "../../../lib/api";
import styles from "./appShell.module.css";

/** Route paths that ARE ported to React (rendered as live content components). */
const REACT_TABS: Record<string, React.ComponentType> = {
  devices: DevicesContent,
  audio: AudioContent,
  tasks: TasksContent,
  maps: MapContent,
  tags: TagsContent,
  classifications: ClassificationsContent,
  activity: ActivityContent,
  config: ConfigContent,
  voice: VoiceContent,
  cleaning: CleaningContent,
};

/** Route paths that are NOT yet ported; shown via an iframe to the Jinja page. */
const LEGACY_TABS: Record<string, string> = {};

function activeTab(): string {
  // URL hash holds the tab, e.g. "#/tasks" (or "#" empty = devices).
  const raw = typeof window !== "undefined" ? window.location.hash : "";
  const t = raw.replace(/^#\/?/, "").split("/")[0].toLowerCase();
  return t || "devices";
}

/**
 * The persistent app shell. Rendered ONCE and never remounted across tab
 * changes - the nav + header stay put, and only the content area below swaps.
 * Tab routing is hash-based (#/tab) so switching is purely client-side (no page
 * reload, back/forward works) and works under any ingress mount.
 */
export default function AppShell() {
  const [tab, setTab] = useState<string>(activeTab);
  const base = readBase();

  useEffect(() => {
    const onHash = () => setTab(activeTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Reset scroll on tab change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const Content = REACT_TABS[tab];

  return (
    <div className={styles.shell}>
      <NavBar active={tab} />
      <div className={styles.content}>
        {Content ? (
          <Content />
        ) : LEGACY_TABS[tab] ? (
          <LegacyTab tab={tab} src={`${base || ""}/${LEGACY_TABS[tab]}`} />
        ) : (
          <p className={styles.notFound}>Unknown page. Pick a tab above.</p>
        )}
      </div>
    </div>
  );
}