"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Select from "../../../components/atoms/select/select";
import Spinner from "../../../components/atoms/spinner/spinner";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call } from "../../../lib/api";
import styles from "./cleaningContent.module.css";

const MAP_JS = "/dreame_vacuum_unlocked_integration/map.js?v=12";

interface CleanDevice {
  did: string;
  name: string;
  entity_id: string;
  state: string;
  work_mode?: string;
}

interface MapApi {
  decodeMap(doc: unknown): any;
  drawBase(ctx: CanvasRenderingContext2D, map: unknown, opts?: Record<string, unknown>): void;
  drawDock(ctx: CanvasRenderingContext2D, map: unknown, dock: { x: number; y: number; heading: number }, opts?: Record<string, unknown>): void;
  drawVacuum(ctx: CanvasRenderingContext2D, map: unknown, pose: { x: number; y: number; heading: number }, opts?: Record<string, unknown>): void;
  drawRoomSelection(ctx: CanvasRenderingContext2D, map: unknown, opts?: Record<string, unknown>): void;
  roomAtPixel(map: unknown, x: number, y: number, scale: number): number | null;
  loadSprites(): Promise<void>;
}

const CLEANING_MODES = new Set([2, 4, 5, 18, 19, 20, 21, 24, 25, 26, 27, 28, 29, 30]);

function isCleaning(d: CleanDevice): boolean {
  if (!d) return false;
  if (d.state === "cleaning") return true;
  try {
    return CLEANING_MODES.has(parseInt(d.work_mode || "", 10));
  } catch { return false; }
}
function isPaused(d: CleanDevice): boolean {
  if (!d) return false;
  if (d.state === "paused") return true;
  try { return parseInt(d.work_mode || "", 10) === 1; } catch { return false; }
}

export default function CleaningContent() {
  const [devices, setDevices] = useState<CleanDevice[]>([]);
  const [did, setDid] = useState("");
  const [device, setDevice] = useState<CleanDevice | null>(null);
  const [mode, setMode] = useState<"all" | "room">("all");
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});
  const [selectedRooms, setSelectedRooms] = useState<number[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<MapApi | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rs = await call<{ devices: CleanDevice[] }>("api/cleaning/devices");
        if (!alive) return;
        const d = rs.data?.devices || [];
        setDevices(d);
        if (d.length) { setDid(d[0].did); setDevice(d[0]); }
        else setMapError("No devices registered.");
      } catch (e) {
        if (alive) setMapError((e as Error).message || "Could not load devices");
      }
    })();
    return () => { alive = false; };
  }, []);

  // load map module
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ MAP_JS);
        if (alive) { apiRef.current = mod as unknown as MapApi; await (mod as unknown as MapApi).loadSprites(); }
      } catch (e) {
        if (alive) setMapError("Map renderer unavailable: " + ((e as Error).message || ""));
      }
    })();
    return () => { alive = false; };
  }, []);

  // load live map + draw, polling while mounted + device selected
  useEffect(() => {
    if (!did) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (!alive) return;
      try {
        const rs = await call<Record<string, any>>(`api/maps/${encodeURIComponent(did)}/current`);
        const canvas = canvasRef.current; const api = apiRef.current;
        if (!alive || !canvas || !api || !rs.ok || !rs.data) {
          if (alive && !(rs && rs.ok)) setMapError((rs?.data && (rs.data as any).error) || `Map request failed (${rs?.status})`);
          timer = setTimeout(tick, 5000); return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) { timer = setTimeout(tick, 5000); return; }
        let decoded: any;
        try { decoded = api.decodeMap(rs.data); } catch (e) { setMapError((e as Error).message); timer = setTimeout(tick, 5000); return; }
        const scale = (rs.data as any).suggested_scale || 5;
        const w = decoded.cols * scale, h = decoded.rows * scale;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        const key = `${(rs.data as any).map_id}|${(rs.data as any).cells.join("x")}`;
        if (!baseRef.current || baseKeyRef.current !== key) {
          const base = document.createElement("canvas"); base.width = w; base.height = h;
          const bctx = base.getContext("2d");
          if (bctx) {
            if (mode === "room") api.drawRoomSelection(bctx, decoded, { scale, selectedOrder: selectedRooms });
            else { api.drawBase(bctx, decoded, { scale, showRoomNames: true }); }
            if (decoded.dock) api.drawDock(bctx, decoded, { x: decoded.dock[0], y: decoded.dock[1], heading: decoded.dock_angle }, { scale });
          }
          baseRef.current = base; baseKeyRef.current = key;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (baseRef.current) ctx.drawImage(baseRef.current, 0, 0);
        if (decoded.robot && mode !== "room") api.drawVacuum(ctx, decoded, { x: decoded.robot[0], y: decoded.robot[1], heading: decoded.angle }, { scale, opacity: 0.9 });
        setRoomNames((rs.data as any).room_names || {});
        setMapError(null);
        timer = setTimeout(tick, 3000);
      } catch (e) {
        if (alive) { setMapError((e as Error).message || "Could not load map"); timer = setTimeout(tick, 5000); }
      }
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [did, mode, selectedRooms]);

  async function callService(service: string, extra: Record<string, unknown> = {}, domain = "vacuum") {
    if (!device?.entity_id) return false;
    const rs = await call<{ ok?: boolean; error?: string }>("api/service", {
      method: "POST",
      body: JSON.stringify({ domain, service, data: { entity_id: device.entity_id, ...extra } }),
    });
    if (!rs.ok && rs.data?.error) setStatus(rs.data.error);
    return rs.ok;
  }

  async function onClean() {
    if (!device) return;
    if (isCleaning(device) || isPaused(device)) {
      await callService("pause"); setStatus("Paused");
    } else if (mode === "room" && selectedRooms.length) {
      await callService("clean_rooms", { rooms: selectedRooms }, "dreame_vacuum_unlocked_integration");
      setStatus("Cleaning rooms");
    } else {
      await callService("start"); setStatus("Cleaning (all)");
    }
    setTimeout(() => { call<{ devices: CleanDevice[] }>("api/cleaning/devices").then((r) => { if (r.data?.devices) { setDevices(r.data.devices); setDevice(r.data.devices.find((x) => x.did === did) || null); } }); }, 800);
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Cleaning</h1>
      </header>

      {status && <StatusMessage tone="info">{status}</StatusMessage>}
      {mapError && <p className={styles.err}>{mapError}</p>}

      <div className={styles.bar}>
        {devices.length > 0 && (
          <Select value={did} onChange={(v) => { setDid(v); setDevice(devices.find((x) => x.did === v) || null); }}
            options={devices.map((d) => ({ value: d.did, label: d.name || d.did }))} />
        )}
        <Button onClick={() => setSelectedRooms([])}>Clear rooms</Button>
      </div>

      <div className={styles.modes}>
        <button className={mode === "all" ? `${styles.tab} ${styles.tabOn}` : styles.tab} onClick={() => setMode("all")}>All / Zone</button>
        <button className={mode === "room" ? `${styles.tab} ${styles.tabOn}` : styles.tab} onClick={() => setMode("room")}>Rooms</button>
      </div>

      {did && <div className={styles.mapWrap}><canvas ref={canvasRef} className={styles.canvas} /></div>}

      {mode === "room" && (
        <div className={styles.roomPane}>
          <div className={styles.roomList}>
            {Object.entries(roomNames).map(([id, name]) => {
              const on = selectedRooms.includes(parseInt(id, 10));
              return (
                <button key={id} className={on ? `${styles.roomChip} ${styles.roomChipOn}` : styles.roomChip}
                  onClick={() => {
                    const n = parseInt(id, 10);
                    setSelectedRooms((p) => on ? p.filter((x) => x !== n) : [...p, n]);
                  }}>
                  {name || id}
                </button>
              );
            })}
            {!Object.keys(roomNames).length && <p className={styles.hint}>No room data yet — refresh the map.</p>}
          </div>
          <p className={styles.hint}>{selectedRooms.length ? `Order: ${selectedRooms.join(" → ")}` : "Pick the rooms to clean, in order."}</p>
        </div>
      )}

      <div className={styles.cleanBar}>
        <Button variant="primary"
          onClick={() => void onClean()}
          disabled={mode === "room" && !selectedRooms.length && !(isCleaning(device as any) || isPaused(device as any))}>
          {isCleanState(device) ? "Pause" : "Clean"}
        </Button>
      </div>
    </div>
  );
}

function isCleanState(d: CleanDevice | null): boolean {
  return !!d && (isCleaning(d) || isPaused(d));
}