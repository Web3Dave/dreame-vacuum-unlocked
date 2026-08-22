"use client";

import { useEffect, useState } from "react";
import Badge from "../components/atoms/badge/badge";
import Card from "../components/atoms/card/card";
import Mono from "../components/atoms/mono/mono";
import NavBar from "../components/organisms/navbar/navbar";
import DeviceCard from "../components/organisms/deviceCard/deviceCard";
import { fetchJson } from "../lib/api";
import type { DevicesPayload } from "../lib/types";
import styles from "./page.module.css";

export default function HomePage() {
  const [data, setData] = useState<DevicesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<DevicesPayload>("api/devices-enriched")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main>
      <NavBar active="devices" />

      <header className={styles.header}>
        <h1 className={styles.h1}>Devices</h1>
        {data ? (
          data.ha_up ? (
            <Badge tone="ok">Home Assistant connected</Badge>
          ) : (
            <Badge tone="bad">Home Assistant API unavailable</Badge>
          )
        ) : null}
        {data?.viewer ? <span className={styles.sub}>signed in as {data.viewer}</span> : null}
      </header>

      {error ? (
        <p className={styles.err}>Could not load devices: {error}</p>
      ) : !data ? (
        <p className={styles.sub}>Loading…</p>
      ) : data.devices.length ? (
        <div className={styles.grid}>
          {data.devices.map((dev) => (
            <DeviceCard key={dev.did} dev={dev} haUp={data.ha_up} />
          ))}
        </div>
      ) : (
        <Card className={styles.emptyCard}>
          <p className={styles.emptyTitle}>
            <strong>No devices registered yet.</strong>
          </p>
          <p>
            Install and configure the <Mono>dreame_vacuum_unlocked_integration</Mono> integration. It registers its devices
            with this add-on on startup.
          </p>
        </Card>
      )}

      <footer className={styles.footer}>
        {data ? `${data.devices.length} device(s) · ${data.routes} route(s) · control flows through Home Assistant` : ""}
      </footer>
    </main>
  );
}