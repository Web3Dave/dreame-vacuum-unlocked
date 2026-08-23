"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../components/atoms/button/button";
import Select from "../../../components/atoms/select/select";
import Spinner from "../../../components/atoms/spinner/spinner";
import StatusMessage from "../../../components/molecules/statusMessage/statusMessage";
import { call } from "../../../lib/api";
import type { Classifier, StepTypeSpec, Task, TaskStep } from "../../../lib/types";
import styles from "./taskEditor.module.css";

/** A value editor for a single field, driven by the step schema's field type. */
function FieldInput({ field, value, stepType, audioFiles, onChange }: {
  field: { name: string; type: string; required?: boolean; default?: unknown; help?: string };
  value: unknown;
  stepType: string;
  audioFiles: string[];
  onChange: (v: unknown) => void;
}) {
  const label = field.name + (field.required ? " *" : "");
  const help = field.help || "";
  if (field.type === "bool") {
    return (
      <label className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{field.name}</span>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} title={help} />
      </label>
    );
  }
  if (stepType === "play_audio" && field.name === "filename") {
    const current = value ? String(value) : (audioFiles[0] || "");
    return (
      <label className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <Select value={current} onChange={(v) => onChange(v === "" ? "" : v)}
          options={[{ value: "", label: "No audio" }, ...audioFiles.map((f) => ({ value: f, label: f }))]} />
      </label>
    );
  }
  if (stepType === "clean_rooms" && field.name === "cleaning_type") {
    const current = value ? String(value) : "auto";
    const options = [
      { value: "auto", label: "Default (vacuum & mop)" },
      { value: "vacuum_and_mop", label: "Vacuum & mop" },
      { value: "vacuum_only", label: "Vacuum" },
      { value: "mop_only", label: "Mop" },
      { value: "vacuum_then_mop", label: "Vacuum then mop" },
    ];
    return (
      <label className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <Select value={current} onChange={(v) => onChange(v === "auto" ? "auto" : v)} options={options} />
      </label>
    );
  }
  const type = field.name === "filename" || field.type === "str" ? "text" : "number";
  return (
    <label className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type={type}
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { onChange(undefined); return; }
          if (field.type === "int") onChange(parseInt(raw, 10));
          else if (field.type === "float") onChange(parseFloat(raw));
          else onChange(raw);
        }}
        title={help}
        placeholder={field.default != null ? String(field.default) : ""}
      />
    </label>
  );
}

/** Human-readable one-line description for the step list. */
function stepLabel(step: TaskStep, schema: Record<string, StepTypeSpec>, classifiers: Classifier[]): string {
  const spec = schema[step.type] || {};
  if (step.type === "if_classification") {
    const c = classifiers.find((x) => x.id === step.classifier);
    const n = Object.keys((step.cases as Record<string, unknown>) || {}).length;
    return `If ${c ? c.name : `classification ${step.classifier}`} (${n} case${n === 1 ? "" : "s"})`;
  }
  if (step.type === "go_to_point" && step.x !== undefined) return `Go to x ${step.x}, y ${step.y}`;
  if (step.type === "rotate_to_heading" && step.heading !== undefined) return `Face ${step.heading}°`;
  if (step.type === "take_snapshot") return `Snapshot${step.tag ? ` → ${step.tag}` : ""}`;
  if (step.type === "record_clip") return step.tag ? `Record clip → ${step.tag}` : "Record clip";
  if (step.type === "play_audio") return step.filename ? `Play ${step.filename}` : "Play audio";
  if (step.type === "clean_rooms") return `Clean rooms (${((step.rooms as number[]) || []).length})`;
  const detail = (spec.fields || [])
    .filter((f) => step[f.name] !== undefined)
    .map((f) => `${f.name} ${step[f.name]}`)
    .join(", ");
  return (spec.label || step.type) + (detail ? ` (${detail})` : "");
}

interface TaskEditorProps {
  task?: Task | null;
  initialSlug?: string;
  onSaved?: () => void;
}

export default function TaskEditor({ task, initialSlug, onSaved }: TaskEditorProps) {
  const [devices, setDevices] = useState<{ did: string; name: string }[]>([]);
  const [schema, setSchema] = useState<Record<string, StepTypeSpec>>({});
  const [classifiers, setClassifiers] = useState<Classifier[]>([]);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [name, setName] = useState(task?.name || "");
  const [id, setId] = useState(task?.slug || "");
  const [did, setDid] = useState(task?.did || "");
  const [steps, setSteps] = useState<TaskStep[]>(task?.steps || []);
  const [sel, setSel] = useState(-1);
  const [sideView, setSideView] = useState<"steps" | "yaml">("steps");
  const [yaml, setYaml] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isNew = !task;
  const selStep = sel >= 0 ? steps[sel] : null;

  // Load the vocabulary + supporting lists once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [, devRs, clfRs, audRs] = await Promise.all([
          Promise.resolve(null),
          call<{ devices: { did: string; name: string }[] }>("api/devices"),
          call<{ classifications: Classifier[] }>("api/classifications"),
          call<{ files: string[] }>("api/audio"),
        ]);
        if (!alive) return;
        setDevices(devRs.data?.devices || []);
        setClassifiers(clfRs.data?.classifications || []);
        setAudioFiles(audRs.data?.files || []);
        const tRs = await call<{ step_types: Record<string, StepTypeSpec> }>("api/tasks");
        if (alive) setSchema(tRs.data?.step_types || {});
        if (!did && (devRs.data?.devices || []).length) setDid(devRs.data.devices[0].did);
        if (!name) setName(task?.name || "");
      } catch (e) {
        if (alive) setError((e as Error).message || "Could not load editor data");
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the YAML view from current steps (uses the server round-trip like prior).
  const buildYaml = useCallback(async () => {
    setBusy(true);
    try {
      const rs = await call<{ yaml?: string; error?: string }>("api/tasks/yaml", {
        method: "POST",
        body: JSON.stringify({ steps }),
      });
      if (!rs.ok || !rs.data || rs.data.yaml === undefined) {
        setError(rs.data?.error || "Could not build YAML");
      } else {
        setYaml(rs.data.yaml || "");
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message || "Could not build YAML");
    } finally {
      setBusy(false);
    }
  }, [steps]);

  const addStep = (type: string) => {
    const step: TaskStep = { type };
    const spec = schema[type];
    if (spec) {
      for (const f of spec.fields || []) {
        if (f.default !== undefined && f.type !== "steps_list" && f.type !== "steps_map") {
          step[f.name] = f.default;
        } else if (f.type === "steps_list") step[f.name] = [];
        else if (f.type === "steps_map") step[f.name] = {};
      }
    }
    const at = sel >= 0 ? sel + 1 : steps.length;
    setSteps((prev) => { const next = [...prev]; next.splice(at, 0, step); return next; });
    setSel(at);
  };

  const removeStep = (i: number) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
    setSel((s) => (s === i ? -1 : s > i ? s - 1 : s));
  };

  const updateStep = (i: number, patch: Partial<TaskStep>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    let finalSteps = steps;
    if (sideView === "yaml") {
      const rs = await call<{ steps?: TaskStep[]; error?: string }>("api/tasks/yaml", {
        method: "POST",
        body: JSON.stringify({ yaml }),
      });
      if (!rs.ok || !rs.data?.steps) { setError(rs.data?.error || "Could not read that YAML"); setSaving(false); return; }
      finalSteps = rs.data.steps;
    }
    const payload: Record<string, unknown> = { did, name, steps: finalSteps };
    if (id) payload.slug = id;
    const rs = await call<{ task?: Task; error?: string }>("api/tasks", { method: "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (!rs.ok || !rs.data?.task) {
      setError(rs.data?.error || "Could not save the task");
      return;
    }
    setStatus("Saved");
    if (onSaved) onSaved();
  };

  const del = async () => {
    if (isNew) return;
    if (!confirm(`Delete task "${name}"?`)) return;
    const rs = await call<{ ok?: boolean; error?: string }>(`api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (rs.ok || rs.data?.ok) { if (onSaved) onSaved(); }
    else setError(rs.data?.error || "Could not delete the task");
  };

  const run = async () => {
    if (isNew) return;
    setBusy(true);
    const rs = await call<{ ok?: boolean; error?: string }>(`api/tasks/${encodeURIComponent(id)}/run`, { method: "POST" });
    setBusy(false);
    if (!rs.ok && !rs.data?.ok) { setError(rs.data?.error || "Could not run the task"); return; }
    setStatus("Task started");
    if (onSaved) onSaved();
  };

  const exportTask = async () => {
    if (isNew) return;
    setBusy(true);
    const rs = await call<{ yaml?: string; error?: string }>(`api/tasks/${encodeURIComponent(id)}/export`);
    setBusy(false);
    if (!rs.ok || !rs.data?.yaml) { setError(rs.data?.error || "Could not export"); return; }
    setYaml(rs.data.yaml);
    setSideView("yaml");
  };

  const types = Object.keys(schema).sort((a, b) => (schema[a].label || a).localeCompare(schema[b].label || b));

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <button type="button" className={styles.back} onClick={() => { window.location.hash = "#/tasks"; if (onSaved) onSaved(); }}>&larr; Tasks</button>
        <h1 className={styles.title}>{isNew ? "New task" : `Edit: ${task?.name || name}`}</h1>
        <div className={styles.spacer} />
        <Button variant="primary" disabled={saving || busy} onClick={() => void save()}>
          {saving ? <Spinner /> : null}Save
        </Button>
        {!isNew && (
          <Button variant="danger" disabled={busy} onClick={() => void del()}>Delete</Button>
        )}
      </div>

      {error && <StatusMessage tone="err">{error}</StatusMessage>}
      {status && <StatusMessage tone="ok">{status}</StatusMessage>}

      {/* metadata */}
      <div className={styles.meta}>
        <label className={styles.metaField}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.metaField}>
          <span>ID</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="letters/numbers" disabled={!isNew} />
        </label>
        <label className={styles.metaField}>
          <span>Device</span>
          <Select value={did} onChange={setDid}
            options={devices.length ? devices.map((d) => ({ value: d.did, label: d.name || d.did }))
              : [{ value: "", label: "No devices registered" }]} />
        </label>
      </div>

      <div className={styles.tabs}>
        <button type="button" className={sideView === "steps" ? styles.tabActive : ""} onClick={() => setSideView("steps")}>Steps</button>
        <button type="button" className={sideView === "yaml" ? styles.tabActive : ""} onClick={() => { setSideView("yaml"); if (!yaml) void buildYaml(); }}>YAML</button>
      </div>

      {sideView === "steps" ? (
        <div className={styles.edGrid}>
          {/* step list */}
          <div className={styles.side}>
            <div className={styles.addRow}>
              <Select value="" onChange={(v) => { if (v) addStep(v); }}
                options={[{ value: "", label: "Add step…" }, ...types.map((t) => ({ value: t, label: schema[t].label || t }))]} />
            </div>
            <div className={styles.stepList}>
              {steps.map((step, i) => (
                <div key={i} className={sel === i ? `${styles.stepRow} ${styles.stepRowSel}` : styles.stepRow}
                  onClick={() => setSel(i)}>
                  <span className={styles.stepLabel}>{stepLabel(step, schema, classifiers)}</span>
                  <button type="button" className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); removeStep(i); }}>&times;</button>
                </div>
              ))}
              {!steps.length && <p className={styles.hint}>No steps yet. Add one above.</p>}
            </div>
          </div>

          {/* selected step editor */}
          <div className={styles.main}>
            {selStep ? (
              <StepEditor did={did} step={selStep} index={sel} schema={schema} classifiers={classifiers}
                audioFiles={audioFiles} onPatch={(p) => updateStep(sel, p)} />
            ) : (
              <p className={styles.hint}>Select a step to edit its fields.</p>
            )}
          </div>
        </div>
      ) : (
        <textarea className={styles.yaml} value={yaml} onChange={(e) => setYaml(e.target.value)} rows={20} />
      )}

      <div className={styles.actions}>
        {!isNew && <Button disabled={busy} onClick={() => void run()}>{busy ? <Spinner /> : null}Run</Button>}
        {!isNew && <Button disabled={busy} onClick={() => void exportTask()}>Export</Button>}
        {sideView === "steps" && <Button onClick={() => void buildYaml()}>Preview YAML</Button>}
      </div>
    </div>
  );
}

function StepEditor({ did, step, index, schema, classifiers, audioFiles, onPatch }: {
  did: string;
  step: TaskStep;
  index: number;
  schema: Record<string, StepTypeSpec>;
  classifiers: Classifier[];
  audioFiles: string[];
  onPatch: (p: Partial<TaskStep>) => void;
}) {
  const spec = schema[step.type] || { fields: [] as { name: string; type: string; required?: boolean; default?: unknown; help?: string }[] };
  const fields = spec.fields || [];
  const roomsField = step.type === "clean_rooms" ? fields.find((f) => f.name === "rooms") : null;
  const otherFields = step.type === "clean_rooms" ? fields.filter((f) => f.name !== "rooms") : fields;

  return (
    <div className={styles.stepEdit}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>{spec.label || step.type}</h2>
        {spec.help && <p className={styles.helpText}>{spec.help}</p>}
      </div>

      {step.type === "if_classification" ? (
        <IfClassEditor step={step} classifiers={classifiers} onPatch={onPatch} schema={schema} />
      ) : (
        <>
          {roomsField && (
            <RoomsEditor did={did} rooms={(step.rooms as number[]) || []}
              onRooms={(rooms) => onPatch({ rooms })} />
          )}
          {otherFields.map((f) => (
            <FieldInput key={f.name} field={f} value={step[f.name]} stepType={step.type}
              audioFiles={audioFiles} onChange={(v) => onPatch({ [f.name]: v })} />
          ))}
        </>
      )}
    </div>
  );
}

function RoomsEditor({ did, rooms, onRooms }: { did: string; rooms: number[]; onRooms: (r: number[]) => void }) {
  // The clean step acts on the device's DEFAULT floor (or the current map if
  // no default is set), so the pickable rooms are that floor's segment ids -
  // fetched from the same /api/maps/<did>/rooms endpoint the Maps tab uses.
  const [allNames, setAllNames] = useState<Record<string, string> | null>(null);
  const [mapId, setMapId] = useState<number | null>(null);
  const [mapName, setMapName] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomsErr, setRoomsErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!did) { setAllNames(null); setMapId(null); setMapName(null); return; }
    setLoadingRooms(true); setRoomsErr(null);
    (async () => {
      try {
        const rs = await call<{ map_id?: number | null; map_name?: string | null; rooms: Record<string, string> }>(`api/maps/${encodeURIComponent(did)}/rooms`);
        if (!alive) return;
        if (rs.ok && rs.data) {
          setAllNames(rs.data.rooms || {});
          setMapId(rs.data.map_id ?? null);
          setMapName(rs.data.map_name ?? null);
        } else {
          setRoomsErr((rs.data as any)?.error || "Could not load rooms");
        }
      } catch (e) {
        if (alive) setRoomsErr((e as Error).message || "Could not load rooms");
      } finally {
        if (alive) setLoadingRooms(false);
      }
    })();
    return () => { alive = false; };
  }, [did]);

  const all = allNames ? Object.keys(allNames).map(Number).filter((n) => !Number.isNaN(n)) : [];
  const [manual, setManual] = useState(rooms.join(", "));

  return (
    <div className={styles.fieldBlock}>
      <span className={styles.fieldBlockLabel}>Rooms (in order) {mapId != null ? `· ${(mapName && mapName.trim()) ? mapName : `floor map ${mapId}`}` : ""}</span>
      {loadingRooms ? (
        <p className={styles.hint}><Spinner /> Loading rooms…</p>
      ) : roomsErr ? (
        <>
          <p className={styles.hint}>{roomsErr} — enter room ids manually.</p>
          <input value={manual} onChange={(e) => { setManual(e.target.value);
            const nums = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
            onRooms(nums); }} placeholder="1, 3, 5" />
        </>
      ) : all.length ? (
        <div className={styles.chips}>
          {all.map((r) => {
            const on = rooms.includes(r);
            const order = on ? rooms.indexOf(r) + 1 : null;
            return (
              <button key={r} type="button" className={on ? `${styles.chip} ${styles.chipSel}` : styles.chip}
                onClick={() => onRooms(on ? rooms.filter((x) => x !== r) : [...rooms, r])}>
                {order != null && <span className={styles.chipOrder}>{order}</span>}
                {allNames ? allNames[String(r)] : `Room ${r}`}
              </button>
            );
          })}
        </div>
      ) : (
        <input value={manual} onChange={(e) => { setManual(e.target.value);
          const nums = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
          onRooms(nums); }} placeholder="1, 3, 5" />
      )}
      <p className={styles.hint}>{rooms.length ? `Order: ${rooms.join(" → ")}` : "Pick the rooms to clean (this floor's rooms)."}</p>
    </div>
  );
}

function IfClassEditor({ step, classifiers, onPatch, schema }: {
  step: TaskStep;
  classifiers: Classifier[];
  onPatch: (p: Partial<TaskStep>) => void;
  schema: Record<string, StepTypeSpec>;
}) {
  const cases = (step.cases as Record<string, TaskStep[] | undefined>) || {};
  const clf = classifiers.find((c) => c.id === step.classifier) || classifiers[0];
  const cls = clf?.classes || [];
  const [label, setLabel] = useState<string | null>(null);
  const [clsSel, setClsSel] = useState("");

  const addCase = (labelName: string, stepsArr: TaskStep[]) => {
    onPatch({ cases: { ...cases, [labelName]: stepsArr } });
  };

  return (
    <div>
      <div className={styles.fieldBlock}>
        <span className={styles.fieldBlockLabel}>Classifier</span>
        {classifiers.length ? (
          <Select value={clf?.id || ""} onChange={(v) => onPatch({ classifier: v })}
            options={classifiers.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <p className={styles.hint}>No configured classifications yet. Create one on the Classifications tab first.</p>
        )}
      </div>

      {(Object.keys(cases) || []).map((cn) => (
        <div key={cn} className={styles.branch}>
          <div className={styles.branchHead}>
            <span className={styles.branchLabel}>When result = {cn}</span>
            <button type="button" className={styles.removeBtn}
              onClick={() => { const next = { ...cases }; delete next[cn]; onPatch({ cases: next }); }}>&times;</button>
          </div>
          <p className={styles.hint}>Nested branch steps are edited in the YAML view.</p>
        </div>
      ))}

      {cls.length && (
        <div className={styles.addRow}>
          <Select value={clsSel} onChange={(v) => setClsSel(v)}
            options={[{ value: "", label: "Add a case for…" }, ...cls.filter((c) => !(c in cases)).map((c) => ({ value: c, label: c }))]} />
          <Button onClick={() => { if (clsSel) { addCase(clsSel, []); setClsSel(""); } }}>Add case</Button>
        </div>
      )}
    </div>
  );
}