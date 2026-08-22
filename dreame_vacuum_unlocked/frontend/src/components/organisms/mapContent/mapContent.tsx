"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Select from "../../../components/atoms/select/select";
import Button from "../../../components/atoms/button/button";
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
  // Map lifecycle: 'loading' (fetch in flight) / 'no-map' (nothing to draw) /
  // 'ok' (a map doc has rendered) / 'error' (couldn't reach HA/map renderer).
  const [mapState, setMapState] = useState<"idle" | "loading" | "no-map" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache the static base layer (rooms/walls/dock) so live robot draws don't
  // ghost over it - redraw only when the map key changes.
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseKeyRef = useRef<string | null>(null);
  const mapApiRef = useRef<MapApi | null>(null);
  const didRef = useRef(did);
  // Manual refresh re-triggers the poll effect immediately with ?refresh=1.
  const [refreshKey, setRefreshKey] = useState(0);

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
          setMapState("no-map");
          setMessage("No devices registered. Install the dreame_vacuum_unlocked_integration integration.");
        }
      } catch (e) {
        if (alive) {
          setMapState("error");
          setMessage((e as Error).message || "Could not load devices");
        }
      } finally {
        if (alive) setDevLoading(false);
      }
    })();
    return () => { alive = false; };
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
        if (alive) {
          setMapState("error");
          setMessage("Map renderer unavailable: " + ((e as Error).message || ""));
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const renderDoc = useCallback(async (doc: Record<string, any>) => {
    const canvas = canvasRef.current;
    const api = mapApiRef.current;
    if (!canvas) return false;
    if (!api) return false; // map.js still loading; caller retries
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    let decoded: any;
    try {
      decoded = api.decodeMap(doc);
    } catch (e) {
      setMessage(`Could not decode the map: ${(e as Error).message}`);
      return false;
    }
    const scale = (doc as any).suggested_scale || 5;
    const width = decoded.cols * scale;
    const height = decoded.rows * scale;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const key = `${(doc as any).map_id}|${(doc as any).cells.join("x")}|${(doc as any).origin.join(",")}`;

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
    return true;
  }, []);

  // Poll the live map while mounted + a device is selected.
  useEffect(() => {
    if (!did) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopRetry = false;

    const fetchOnce = async (refresh: boolean): Promise<boolean> => {
      // returns true if a map was drawn
      try {
        const url = `api/maps/${encodeURIComponent(didRef.current)}/current${refresh ? "?refresh=1" : ""}`;
        const rs = await call<Record<string, any>>(url);
        if (!alive) return false;
        if (!rs.ok || !rs.data) {
          setMessage((rs.data && (rs.data as any).error) || `Map request failed (HTTP ${rs.status})`);
          return false;
        }
        const ok = await renderDoc(rs.data);
        if (ok) setMessage(null);
        return ok;
      } catch (e) {
        if (alive) {
          setMessage((e as Error).message || "Could not load the live map");
        }
        return false;
      }
    };

    const tick = async () => {
      if (!alive || stopRetry) return;
      setMapState("loading");
      const drawn = await fetchOnce(false);
      if (!alive) return;
      if (drawn) {
        setMapState("ok");
        timer = setTimeout(tick, 3000); // live follow
      } else {
        // No map / error: stay in a "no map found - refresh" state but keep a
        // gentle retry so the map appears when the robot comes back online.
        setMapState(mapApiRef.current ? "no-map" : "loading");
        timer = setTimeout(tick, 5000);
      }
    };

    tick();
    return () => { alive = false; stopRetry = true; if (timer) clearTimeout(timer); };
    // refreshKey is intentionally a dep: a manual refresh restarts this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, refreshKey, renderDoc]);

  const handleRefresh = useCallback(() => {
    setMapState("loading");
    setMessage(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const showMap = mapState === "ok";
  const showNoMap = (mapState === "no-map" || mapState === "error") && !devLoading;
  const isSpinning = mapState === "loading" || devLoading;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Maps</h1>
        {devices.length > 0 ? (
          <div className={styles.controls}>
            <Select
              value={did}
              onChange={(v) => { setDid(v); setMessage(null); }}
              options={devices.map((d) => ({ value: d.did, label: d.name || d.did }))}
            />
            <Button variant="primary" onClick={handleRefresh} disabled={isSpinning}>
              {isSpinning ? <Spinner /> : "Refresh map"}
            </Button>
          </div>
        ) : null}
      </header>

      {/* The canvas is ALWAYS mounted so canvasRef.current is bound and the
          renderer can draw into it; visibility is toggled by state. If it were
          mounted only after mapState==='ok', the first draw could never happen
          (renderDoc needs the canvas, but the canvas only appears after a draw)
          - a deadlock. Loading/empty messages overlay it. */}
      <div className={styles.stage} hidden={showMap ? false : true}>
        <div className={styles.canvasWrap} style={{ width: "min-content" }}>
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>
      </div>

      {!showMap && isSpinning ? (
        <p className={styles.loading}><Spinner /> Loading map…</p>
      ) : showNoMap ? (
        <div className={styles.empty}>
          <p className={styles.err}>
            {message || "No map found."}
          </p>
          <p className={styles.hint}>The map may not have been generated yet, or the robot is offline.</p>
          <Button variant="primary" onClick={handleRefresh}>
            Refresh map
          </Button>
        </div>
      ) : null}
    </div>
  );
}