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

  // Load the integration's map module once. This is a genuine browser-native
  // dynamic import() (webpackIgnore bypasses Next's bundler), fetching a
  // cross-origin-ish absolute URL served by Home Assistant core, not by this
  // app - a CSP block, a wrong MIME type, or the HA host being unreachable
  // from inside an ingress iframe can all leave this promise neither
  // resolving nor rejecting in some browsers, instead of throwing. Without a
  // timeout that looks identical to "still loading" forever, which is
  // indistinguishable from a slow network in the UI - so race it against one
  // and surface *something* either way.
  useEffect(() => {
    let alive = true;
    const timedOut = { current: false };
    const timer = setTimeout(() => {
      timedOut.current = true;
      if (alive && !mapApiRef.current) {
        console.error(`[mapContent] timed out loading ${MAP_JS} after 8s (no reject/resolve - `
          + `check the Network tab for its request status and the Console for CSP errors)`);
        setMapState("error");
        setMessage(
          `Map renderer did not load (timed out fetching ${MAP_JS}). Check the browser console `
          + "and Network tab - this is usually a blocked/failed request to Home Assistant, not the add-on."
        );
      }
    }, 8000);

    (async () => {
      try {
        console.log(`[mapContent] loading map renderer from ${MAP_JS}`);
        const mod = await import(/* webpackIgnore: true */ MAP_JS);
        if (!alive) return;
        mapApiRef.current = mod as unknown as MapApi;
        console.log("[mapContent] map renderer module loaded", mod);
        await (mod as unknown as MapApi).loadSprites();
        console.log("[mapContent] sprites loaded");
        if (alive && timedOut.current) {
          // Recovered after the timeout already fired - clear the error so
          // the next successful poll can show the map instead of being
          // stuck behind a stale error state.
          setMapState("loading");
          setMessage(null);
        }
      } catch (e) {
        console.error("[mapContent] failed to load map renderer:", e);
        if (alive) {
          setMapState("error");
          setMessage("Map renderer unavailable: " + ((e as Error).message || String(e)));
        }
      }
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const renderDoc = useCallback(async (doc: Record<string, any>) => {
    const canvas = canvasRef.current;
    const api = mapApiRef.current;
    if (!canvas) {
      console.warn("[mapContent] renderDoc: no canvas ref yet");
      return false;
    }
    if (!api) {
      console.warn("[mapContent] renderDoc: map renderer not loaded yet");
      return false; // map.js still loading; caller retries
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("[mapContent] renderDoc: canvas 2d context unavailable");
      return false;
    }
    // Everything below - not just decodeMap - can throw on an unexpected doc
    // shape (a missing field the old Jinja page never happened to exercise,
    // for instance). Catching only decodeMap let those propagate all the way
    // out to fetchOnce's catch with no trace of where they actually came from.
    try {
      const decoded = api.decodeMap(doc);
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
    } catch (e) {
      console.error("[mapContent] renderDoc failed on doc:", doc, e);
      setMessage(`Could not render the map: ${(e as Error).message || e}`);
      return false;
    }
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
          console.warn("[mapContent] map fetch not ok:", rs.status, rs.data);
          setMessage((rs.data && (rs.data as any).error) || `Map request failed (HTTP ${rs.status})`);
          return false;
        }
        console.log("[mapContent] got map doc, keys:", Object.keys(rs.data), "rendererLoaded:", !!mapApiRef.current);
        const ok = await renderDoc(rs.data);
        if (ok) setMessage(null);
        return ok;
      } catch (e) {
        console.error("[mapContent] fetchOnce threw:", e);
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