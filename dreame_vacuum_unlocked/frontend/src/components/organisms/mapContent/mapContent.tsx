"use client";

import { useEffect, useRef, useState } from "react";
import Select from "../../../components/atoms/select/select";
import Spinner from "../../../components/atoms/spinner/spinner";
import { call } from "../../../lib/api";
import type { Device } from "../../../lib/types";
import styles from "./mapContent.module.css";

// The map renderer is owned by the **integration**, served by HA at
// /dreame_vacuum_unlocked_integration/map.js (deliberate: the map stays with
// the integration, the app just consumes it). We dynamically import it like the
// legacy Jinja pages do, and drive its exports. Version trailer keeps the
// browser from holding a stale cached copy.
const MAP_JS = "/dreame_vacuum_unlocked_integration/map.js?v=11";

// Ingress-independent way to reach the integration's static JS. Under ingress,
// the integration static path is NOT under our base - it's served by HA itself
// at the root, so a root-relative import is correct here.
interface MapApi {
  decodeMap(doc: unknown): any;
  drawBase(ctx: CanvasRenderingContext2D, map: unknown, opts?: Record<string, unknown>): void;
  drawDock(ctx: CanvasRenderingContext2D, map: unknown, dock: { x: number; y: number; heading: number }, opts?: Record<string, unknown>): void;
  drawVacuum(ctx: CanvasRenderingContext2D, map: unknown, pose: { x: number; y: number; heading: number }, opts?: Record<string, unknown>): void;
  loadSprites(): Promise<void>;
}

export default function MapContent() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [did, setDid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache the static base layer (rooms/walls/dock) so live robot draws don't
  // ghost over it - redraw of the base only happens when the map key changes.
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseKeyRef = useRef<string | null>(null);
  const mapApiRef = useRef<MapApi | null>(null);
  const didRef = useRef(did);
  const stopperRef = useRef(false);

  useEffect(() => { didRef.current = did; }, [did]);

  // Load device list once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rs = await call<{ devices: Device[] }>("api/devices");
        if (!alive) return;
        const devs = rs.data?.devices || [];
        setDevices(devs);
        if (devs.length) {
          setDid((prev) => prev || devs[0].did);
        } else {
          setError("No devices registered. Install the dreame_vacuum_unlocked_integration integration.");
        }
      } catch (e) {
        if (alive) setError((e as Error).message || "Could not load devices");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; stopperRef.current = true; };
  }, []);

  // Load the integration's map module once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ MAP_JS);
        if (alive) {
          mapApiRef.current = mod as unknown as MapApi;
          await (mod as unknown as MapApi).loadSprites();
        }
      } catch (e) {
        if (alive) setError("Map renderer unavailable: " + ((e as Error).message || ""));
      }
    })();
    return () => { alive = false; };
  }, []);

  // Poll the live map while mounted + a device is selected.
  useEffect(() => {
    if (!did) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const renderDoc = async (doc: Record<string, any>) => {
      const canvas = canvasRef.current;
      const api = mapApiRef.current;
      if (!canvas || !api) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let decoded: any;
      try {
        decoded = api.decodeMap(doc);
      } catch (e) {
        setError(`Could not decode the map: ${(e as Error).message}`);
        return;
      }
      const scale = (doc as any).suggested_scale || 5;
      const width = decoded.cols * scale;
      const height = decoded.rows * scale;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const key = `${(doc as any).map_id}|${(doc as any).cells.join("x")}|${(doc as any).origin.join(",")}`;

      // Cache the static base layer; only rebuild when the map key changes.
      if (!baseRef.current || baseKeyRef.current !== key) {
        const base = document.createElement("canvas");
        base.width = width;
        base.height = height;
        const bctx = base.getContext("2d");
        if (bctx) {
          api.drawBase(bctx, decoded, { scale, showRoomNames: true });
          if (decoded.dock) {
            api.drawDock(bctx, decoded, { x: decoded.dock[0], y: decoded.dock[1], heading: decoded.dock_angle }, { scale });
          }
        }
        baseRef.current = base;
        baseKeyRef.current = key;
      }

      // Compose: static base + live robot on top (draw only the robot each tick).
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (baseRef.current) ctx.drawImage(baseRef.current, 0, 0);
      if (decoded.robot) {
        api.drawVacuum(
          ctx,
          decoded,
          { x: decoded.robot[0], y: decoded.robot[1], heading: decoded.angle },
          { scale, opacity: 0.9, fov: 70, reach: 900 }
        );
      }
      setError(null);
    };

    const tick = async () => {
      if (!alive) return;
      try {
        const url = `api/maps/${encodeURIComponent(didRef.current)}/current`;
        const rs = await call<Record<string, any>>(url);
        if (!alive) return;
        if (!rs.ok || !rs.data) {
          // Surface a clear reason instead of silently doing nothing, and KEEP
          // polling so the map appears the moment the robot comes back.
          const reason = (rs.data && (rs.data as any).error) || `Map request failed (HTTP ${rs.status})`;
          setError(reason);
          timer = setTimeout(tick, 5000);
          return;
        }
        await renderDoc(rs.data);
        setError(null);
        if (alive) timer = setTimeout(tick, 3000);
      } catch (e) {
        if (alive) {
          setError((e as Error).message || "Could not load the live map");
          timer = setTimeout(tick, 5000);
        }
      }
    };

    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [did]);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Maps</h1>
        {devices.length > 1 ? (
          <Select
            value={did}
            onChange={setDid}
            options={devices.map((d) => ({ value: d.did, label: d.name || d.did }))}
          />
        ) : null}
      </header>

      {error && <p className={styles.err}>{error}</p>}
      {loading ? (
        <p className={styles.loading}><Spinner /> Loading devices…</p>
      ) : (
        did && (
          <div className={styles.canvasWrap} style={{ width: "min-content" }}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>
        )
      )}
    </div>
  );
}