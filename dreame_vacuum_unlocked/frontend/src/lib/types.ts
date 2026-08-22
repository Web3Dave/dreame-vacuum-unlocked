/**
 * Data types mirroring the Flask API shape. Keep in sync with ui.py / store.py.
 * The Devices page ports the old server-side enrichment into a client fetch of
 * an enriched JSON endpoint (see ui.py api_devices_enriched).
 */

export interface DeviceStateEntry {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface Device {
  did: string;
  name?: string;
  model?: string;
  entities?: Record<string, string>;
  state?: Record<string, DeviceStateEntry>;
}

export interface DevicesPayload {
  devices: Device[];
  ha_up: boolean;
  viewer?: string | null;
  routes: number;
  base?: string;
}

/* ---- Tasks ---- */
export interface StepField {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  help?: string;
}

export interface StepTypeSpec {
  label: string;
  help?: string;
  fields: StepField[];
}

export interface TaskStep {
  type: string;
  [key: string]: unknown;
}

export interface Task {
  slug: string;
  name: string;
  did?: string;
  steps: TaskStep[];
  running?: boolean;
  device_busy?: boolean;
  busy_with?: string | null;
  progress?: { step?: number | null; steps?: number | null; detail?: string | null; run_id?: string | null } | null;
}

export interface TasksPayload {
  tasks: Task[];
  devices: { did: string; name: string }[];
  step_types: Record<string, StepTypeSpec>;
}

/* ---- Task editor ---- */
export interface TaskEditorData {
  task?: Task | null;
  devices: { did: string; name: string }[];
  step_types: Record<string, StepTypeSpec>;
  classifiers: Classifier[];
  audio_files: string[];
  map_doc?: Record<string, unknown> | null;
}

/* ---- Camera / monitor ---- */
export interface MonitorSnapshot {
  filename: string;
  name?: string;
  timestamp?: number;
}

/* ---- Tags ---- */
export interface Tag {
  id: string;
  name: string;
  count?: number;
  snapshots?: SnapshotSummary[];
  classifications?: { id: string; name: string }[];
}

export interface SnapshotSummary {
  filename: string;
  taken_at?: number;
  kind?: string;
}

export interface TagsOverviewPayload {
  tags: Tag[];
}

export interface Classifier {
  id: string;
  name: string;
  enabled: boolean;
  classification_type?: string | null;
  classes: string[];
  threshold: number;
  tags: { tag_id: string; crop?: number[] }[];
  can_train?: boolean;
  train_status?: string;
  [key: string]: unknown;
}

export interface ClassificationsPayload {
  classifications: Classifier[];
  tags: Tag[];
}

/* ---- Activity ---- */
export interface Run {
  id?: string;
  slug?: string;
  task?: string;
  did?: string;
  started?: number;
  finished?: number;
  status?: string;
  detail?: string;
  run_id?: string;
}

/* ---- Audio ---- */
export interface AudioPayload {
  files: string[];
  error?: string;
}