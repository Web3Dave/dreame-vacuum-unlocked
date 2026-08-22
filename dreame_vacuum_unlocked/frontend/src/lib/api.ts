/**
 * Client-side API helpers.
 *
 * The add-on UI is served through HA ingress under a generated path prefix
 * (e.g. /hassio/ingress/<slug>/). Absolute /api/... URLs would miss the prefix,
 * so we resolve every request RELATIVE to the current document path. That works
 * transparently whether the app is reached via ingress or directly.
 */

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

/** Resolve a relative API path against the current document (ingress-aware). */
export function apiUrl(path: string): string {
  return path.replace(/^\//, ""); // relative; drop any leading slash
}

export async function fetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const { ok, status, data } = await call<T>(path, init);
  if (!ok) {
    throw new Error(`GET ${path} -> ${status}: ${JSON.stringify(data)}`);
  }
  return data;
}

/** Generic request that returns ok/status/data, tolerating non-2xx bodies. */
export async function call<T = unknown>(path: string, init?: RequestInit): Promise<FetchResult<T>> {
  const url = apiUrl(path);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

/** Special form for multipart uploads (no JSON content-type). */
export async function callFormData<T = unknown>(path: string, form: FormData): Promise<FetchResult<T>> {
  const res = await fetch(apiUrl(path), { method: "POST", body: form });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

/**
 * Read the server-inlined initial data, if present.
 *
 * Flask writes each ported page's initial payload as `window.__DATA__` in the
 * served HTML (Option 1 - hot first load). The page hydrates from it
 * synchronously on mount, so there is NO first-load fetch round-trip. When
 * absent (a dev/preview build, or a page not yet wired), the page falls back to
 * its normal client fetch.
 */
export function readInlinedData<T = unknown>(): T | null {
  if (typeof window !== "undefined") {
    const d = (window as unknown as { __DATA__?: unknown }).__DATA__;
    if (d !== undefined) return d as T;
  }
  return null;
}