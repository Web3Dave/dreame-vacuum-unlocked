"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Select from "../../../components/atoms/select/select";
import Button from "../../../components/atoms/button/button";
import Spinner from "../../../components/atoms/spinner/spinner";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call } from "../../../lib/api";
import styles from "./mapContent.module.css";

// The map renderer is owned by the **integration**, served by HA at
// /dreame_vacuum_unlocked_integration/map.js. We dynamically import it and
// drive its exports, exactly like the legacy Jinja pages.
const MAP_JS = "/dreame_vacuum_unlocked_integration/map.js?v=11";

interface MapApi {
  decodeMap(doc: unknown): any;
  drawBase(ctx: CanvasRenderingContext2D, map: unknown, opts?: Record<string, unknown>): void;
  drawDock(ctx: CanvasRenderingContext2D, map: unknown, dock: { x: number; y: number; heading: number }, opts?: Record<string, unknown>): void;
  drawVacuum(ctx: CanvasRenderingContext2D, map: unknown, pose: { x: number; y: number; heading: number }, opts?: Record<string, unknown>): void;
  loadSprites(): Promise<void>;
}

interface MapBackup { time: number; first: boolean; }
interface MapEntry { id: number; name?: string | null; is_current: boolean; backups: MapBackup[]; }
interface MapDevice { did: string; name: string; model?: string; }
interface MapsData {
  current_map_id?: number | null;
  default_map_id?: string | null;
  maps: MapEntry[];
}

/** Floor display name: the app's name ("Floor 0") or a "Map N" fallback. */
function mapLabel(m: { id: number; name?: string | null }): string {
  return (m.name && m.name.trim()) ? m.name : `Map ${m.id}`;
}

type MapState = "idle" | "loading" | "no-map" | "ok" | "error";

/** Draw a decoded doc onto a canvas element (base + optional vacuum/dock). */
function drawDoc(api: MapApi, canvas: HTMLCanvasElement, doc: Record<string, any>, showDev: boolean) {
  const decoded = api.decodeMap(doc);
  const scale = (doc as any).suggested_scale || 5;
  canvas.width = decoded.cols * scale;
  canvas.height = decoded.rows * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  api.drawBase(ctx, decoded, { scale, showRoomNames: true });
  if (showDev) {
    if (decoded.dock) api.drawDock(ctx, decoded, { x: decoded.dock[0], y: decoded.dock[1], heading: decoded.dock_angle }, { scale });
    if (decoded.robot) api.drawVacuum(ctx, decoded, { x: decoded.robot[0], y: decoded.robot[1], heading: decoded.angle }, { scale });
  }
}

export default function MapContent() {
  const [devices, setDevices] = useState<MapDevice[]>([]);
  const [did, setDid] = useState("");
  const [mapsData, setMapsData] = useState<MapsData | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const [subtab, setSubtab] = useState<"current" | "backups">("current");
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);

  const [mapState, setMapState] = useState<MapState>("idle");
  const [liveError, setLiveError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseKeyRef = useRef<string | null>(null);
  const mapApiRef = useRef<MapApi | null>(null);

  // Backup view state, keyed by "mapId:time".
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [backupDocs, setBackupDocs] = useState<Record<string, Record<string, any>>>({});
  const [backupBusy, setBackupBusy] = useState<Record<string, boolean>>({});
  const [backupErr, setBackupErr] = useState<Record<string, string>>({});
  const [backupShowDev, setBackupShowDev] = useState<Record<string, boolean>>({});

  function resetBase() { baseRef.current = null; baseKeyRef.current = null; }

  // Load the integration's map module once (race against a timeout).
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (alive && !mapApiRef.current) {
        setMapState("error");
        setLiveError(`Map renderer did not load (timed out fetching ${MAP_JS}). Check the console and Network tab.`);
      }
    }, 8000);
    (async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ MAP_JS);
        if (!alive) return;
        mapApiRef.current = mod as unknown as MapApi;
        await (mod as unknown as MapApi).loadSprites();
        if (alive) setMapState("loading");
      } catch (e) {
        console.error("[mapContent] failed to load map renderer:", e);
        if (alive) { setMapState("error"); setLiveError("Map renderer unavailable: " + ((e as Error).message || String(e))); }
      }
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // Load devices once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rs = await call<{ devices: MapDevice[] }>("api/maps/devices");
        if (!alive) return;
        const devs = rs.data?.devices || [];
        setDevices(devs);
        if (devs.length) setDid(devs[0].did);
        else setMapsError("No devices registered. Install the integration.");
      } catch (e) {
        if (alive) setMapsError((e as Error).message || "Could not load devices");
      }
      setMapsLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Load the maps listing when the device changes.
  useEffect(() => {
    if (!did) return;
    let alive = true;
    (async () => {
      setMapsLoading(true); setMapsError(null); setMapsData(null);
      setSelectedMapId(null); setExpanded({}); setBackupDocs({}); setBackupErr({});
      resetBase();
      try {
        const rs = await call<MapsData>(`api/maps/${encodeURIComponent(did)}`);
        if (!alive) return;
        if (!rs.ok || !rs.data) { setMapsError((rs.data as any)?.error || `Could not load maps (HTTP ${rs.status})`); return; }
        const data = rs.data;
        setMapsData(data);
        const defNum = data.default_map_id ? Number(data.default_map_id) : NaN;
        const byDefault = Number.isFinite(defNum) ? (data.maps || []).find((m) => m.id === defNum) : undefined;
        const start = byDefault
          || (data.maps || []).find((m) => m.is_current)
          || (data.maps || [])[0];
        setSelectedMapId(start ? start.id : null);
        setSubtab(start && start.is_current ? "current" : "backups");
      } catch (e) {
        if (alive) setMapsError((e as Error).message || "Could not load maps");
      } finally {
        if (alive) setMapsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [did]);

  const selectedMap = mapsData?.maps.find((m) => m.id === selectedMapId) ?? null;
  const isCurrent = !!selectedMap?.is_current;

  // Render the live current map.
  const renderLiveDoc = useCallback(async (doc: Record<string, any>) => {
    const canvas = canvasRef.current;
    const api = mapApiRef.current;
    if (!canvas || !api) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    try {
      const decoded = api.decodeMap(doc);
      const scale = (doc as any).suggested_scale || 5;
      const width = decoded.cols * scale;
      const height = decoded.rows * scale;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const key = `${(doc as any).map_id}|${(doc as any).cells.join("x")}|${(doc as any).origin.join(",")}`;
      if (!baseRef.current || baseKeyRef.current !== key) {
        const base = document.createElement("canvas");
        base.width = width; base.height = height;
        const bctx = base.getContext("2d");
        if (bctx) {
          api.drawBase(bctx, decoded, { scale, showRoomNames: true });
          if (decoded.dock) api.drawDock(bctx, decoded, { x: decoded.dock[0], y: decoded.dock[1], heading: decoded.dock_angle }, { scale });
        }
        baseRef.current = base; baseKeyRef.current = key;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (baseRef.current) ctx.drawImage(baseRef.current, 0, 0);
      if (decoded.robot) {
        api.drawVacuum(ctx, decoded, { x: decoded.robot[0], y: decoded.robot[1], heading: decoded.angle }, { scale, opacity: 0.9, fov: 70, reach: 900 });
      }
      return true;
    } catch (e) {
      console.error("[mapContent] live render failed:", e);
      setLiveError((e as Error).message || "Could not render the map");
      return false;
    }
  }, []);

  // Poll the live current map while the current subtab is shown for a current map.
  useEffect(() => {
    if (!did || subtab !== "current" || !isCurrent || !selectedMapId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hasMap = false;
    setMapState("loading");
    const tick = async (refresh: boolean) => {
      if (!alive) return;
      if (!hasMap) setMapState("loading");
      try {
        const url = `api/maps/${encodeURIComponent(did)}/current${refresh ? "?refresh=1" : ""}`;
        const rs = await call<Record<string, any>>(url);
        if (!alive) return;
        if (rs.ok && rs.data) {
          const ok = await renderLiveDoc(rs.data);
          if (alive && ok) { hasMap = true; setMapState("ok"); setLiveError(null); timer = setTimeout(() => tick(false), 3000); return; }
        } else {
          setLiveError((rs.data as any)?.error || `Map request failed (HTTP ${rs.status})`);
        }
      } catch (e) {
        if (alive) setLiveError((e as Error).message || "Could not load the live map");
      }
      if (alive) {
        if (hasMap) timer = setTimeout(() => tick(false), 3000);
        else { setMapState(mapApiRef.current ? "no-map" : "loading"); timer = setTimeout(() => tick(false), 5000); }
      }
    };
    tick(false);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [did, subtab, isCurrent, selectedMapId, renderLiveDoc]);

  async function setDefaultThis() {
    if (!selectedMap) return;
    await call(`api/maps/${encodeURIComponent(did)}/default`, { method: "PUT", body: JSON.stringify({ map_id: selectedMap.id }) });
    setMapsData((d) => d ? { ...d, default_map_id: String(selectedMap.id) } : d);
  }
  async function clearDefault() {
    await call(`api/maps/${encodeURIComponent(did)}/default`, { method: "DELETE" });
    setMapsData((d) => d ? { ...d, default_map_id: null } : d);
  }

  async function toggleBackup(time: number) {
    if (selectedMapId == null) return;
    const key = `${selectedMapId}:${time}`;
    setExpanded((p) => ({ ...p, [key]: !p[key] }));
    if (backupDocs[key] || expanded[key]) return;
    setBackupBusy((b) => ({ ...b, [key]: true }));
    setBackupErr((e) => { const n = { ...e }; delete n[key]; return n; });
    try {
      const rs = await call<Record<string, any>>(`api/maps/${encodeURIComponent(did)}/backup/${selectedMapId}/${time}`);
      if (rs.ok && rs.data?.grid) setBackupDocs((d) => ({ ...d, [key]: rs.data }));
      else setBackupErr((p) => ({ ...p, [key]: (rs.data as any)?.error || "Could not decode this backup map" }));
    } catch (e) {
      setBackupErr((p) => ({ ...p, [key]: (e as Error).message || "Could not load backup map" }));
    } finally {
      setBackupBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const showLive = subtab === "current" && isCurrent;
  const isDefaultFloor = mapsData?.default_map_id != null && String(mapsData.default_map_id) === String(selectedMapId);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.h1}>Maps</h1>
        {devices.length > 0 && (
          <div className={styles.controls}>
            <Select value={did} onChange={(v) => setDid(v)}
              options={devices.map((d) => ({ value: d.did, label: d.name || d.did }))} />
          </div>
        )}
      </header>

      {mapsError && <StatusMessage tone="err">{mapsError}</StatusMessage>}

      {mapsLoading ? (
        <p className={styles.loading}><Spinner /> Loading maps…</p>
      ) : mapsData && mapsData.maps.length ? (
        <>
          <div className={styles.mapTabs}>
            {(mapsData.maps || []).map((m) => {
              const isDef = String(m.id) === String(mapsData.default_map_id);
              return (
                <button key={m.id} type="button"
                  className={m.id === selectedMapId ? `${styles.mapTab} ${styles.mapTabOn}` : styles.mapTab}
                  onClick={() => { setSelectedMapId(m.id); setSubtab(m.is_current ? "current" : "backups"); resetBase(); setMapState("loading"); }}>
                  {mapLabel(m)}
                  {m.is_current ? <span className={styles.badge}>current</span> : null}
                  {isDef ? <span className={`${styles.badge} ${styles.badgeDefault}`}>default</span> : null}
                </button>
              );
            })}
          </div>

          <div className={styles.subtabs}>
            <button type="button" className={subtab === "current" ? styles.subtabOn : undefined} onClick={() => { setSubtab("current"); resetBase(); }}>Current map</button>
            <button type="button" className={subtab === "backups" ? styles.subtabOn : undefined} onClick={() => setSubtab("backups")}>Backups</button>
          </div>

          <div className={styles.mapHead}>
            <span className={styles.mapTitle}>
              {selectedMap ? mapLabel(selectedMap) : ""}
              {isCurrent ? " · current" : ""}
              {isDefaultFloor ? " · default" : ""}
            </span>
            <div className={styles.defaultCtl}>
              {isDefaultFloor ? (
                <Button variant="ghost" onClick={() => void clearDefault()}>Clear default floor</Button>
              ) : (
                <Button variant="primary" onClick={() => void setDefaultThis()}>Set as default floor</Button>
              )}
            </div>
          </div>

          {subtab === "current" ? (
            isCurrent ? (
              <>
                <div className={styles.stage} hidden={mapState !== "ok"}>
                  <div className={styles.canvasWrap}><canvas ref={canvasRef} className={styles.canvas} /></div>
                </div>
                {mapState !== "ok" && (
                  <div className={styles.empty}>
                    {mapState === "loading" ? <p className={styles.loading}><Spinner /> Loading map…</p>
                      : mapState === "error" ? <p className={styles.err}>{liveError}</p>
                      : <p className={styles.err}>{liveError || "No map found."}</p>}
                    <Button onClick={() => { resetBase(); setMapState("loading"); }}>Refresh map</Button>
                  </div>
                )}
              </>
            ) : (
              <p className={styles.hint}>
                This isn&apos;t the vacuum&apos;s active map right now, so there is no live view for it — only its
                backup history, under the Backups tab.
              </p>
            )
          ) : (
            <BackupList
              mapId={selectedMap?.id}
              backups={selectedMap?.backups || []}
              expanded={expanded}
              busy={backupBusy}
              docs={backupDocs}
              errors={backupErr}
              showDev={backupShowDev}
              api={mapApiRef.current}
              onToggle={toggleBackup}
              onShowDev={setBackupShowDev}
            />
          )}
        </>
      ) : mapsData ? (
        <p className={styles.hint}>No maps found for this device yet — the account has no backup history to list.</p>
      ) : null}
    </div>
  );
}

function BackupList(props: {
  mapId: number | undefined;
  backups: MapBackup[];
  expanded: Record<string, boolean>;
  busy: Record<string, boolean>;
  docs: Record<string, Record<string, any>>;
  errors: Record<string, string>;
  showDev: Record<string, boolean>;
  api: MapApi | null;
  onToggle: (time: number) => void;
  onShowDev: (cb: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const { mapId, backups, expanded, busy, docs, errors, showDev, api, onToggle, onShowDev } = props;
  if (!backups.length) return <p className={styles.hint}>No backup history for this map yet.</p>;
  return (
    <div>
      <table className={styles.backupTable}>
        <thead><tr><th style={{ width: "60%" }}>Saved</th><th>First of its set</th></tr></thead>
        <tbody>
          {backups.map((b) => {
            const key = mapId != null ? `${mapId}:${b.time}` : `${b.time}`;
            const open = !!expanded[key];
            return (
              <BackupRow key={key} backup={b} open={open}
                doc={docs[key]} busy={!!busy[key]} err={errors[key]}
                api={api} showDev={!!showDev[key]}
                onToggle={() => onToggle(b.time)}
                onShowDev={(on) => onShowDev((p) => ({ ...p, [key]: on }))}
              />
            );
          })}
        </tbody>
      </table>
      <p className={styles.hint} style={{ marginTop: 12 }}>
        Click a saved time to expand and render that backup map. Restoring a backup isn&apos;t supported yet, but every
        backup&apos;s map is decoded and drawn here with the same renderer the live map uses.
      </p>
    </div>
  );
}

function BackupRow(props: {
  backup: MapBackup;
  open: boolean;
  doc: Record<string, any> | undefined;
  busy: boolean;
  err: string | undefined;
  api: MapApi | null;
  showDev: boolean;
  onToggle: () => void;
  onShowDev: (on: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { doc, api, showDev, open } = props;
  useEffect(() => {
    if (open && doc && api && canvasRef.current) drawDoc(api, canvasRef.current, doc, showDev);
  }, [open, doc, api, showDev]);
  return (
    <>
      <tr className={styles.backupRow} onClick={props.onToggle}>
        <td>{new Date(props.backup.time * 1000).toLocaleString()}</td>
        <td>{props.backup.first ? "Yes" : ""}</td>
      </tr>
      {props.open && (
        <tr className={styles.backupPreview}><td colSpan={2}>
          <div className={styles.backupBody}>
            {props.busy ? <p className={styles.hint}><Spinner /> Loading backup…</p>
              : props.err ? <p className={styles.err}>{props.err}</p>
              : props.doc && props.api ? (
                <>
                  <label className={styles.backupDevicesToggle}>
                    <input type="checkbox" checked={props.showDev} onChange={(e) => props.onShowDev(e.target.checked)} /> Show vacuum &amp; dock
                  </label>
                  <div className={styles.backupCanvas}><canvas ref={canvasRef} className={styles.canvas} /></div>
                </>
              ) : <p className={styles.hint}>Loading…</p>}
          </div>
        </td></tr>
      )}
    </>
  );
}