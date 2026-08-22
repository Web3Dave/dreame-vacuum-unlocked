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

/* ---- Audio ---- */
export interface AudioPayload {
  files: string[];
  error?: string;
}