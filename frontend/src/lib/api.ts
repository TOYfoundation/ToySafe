import { getState } from "./store";
import type { Asset, ModuleInfo, ScanJob } from "./types";

/** Talks only to the user's own ToySafe engine. No third-party requests. */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public problems: string[] = [],
  ) {
    super(message);
  }
}

function base() {
  return getState().settings.apiBase.replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  const token = getState().settings.apiToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
  const res = await fetch(base() + path, { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (!res.ok) {
    let message = res.statusText;
    let problems: string[] = [];
    try {
      const body = await res.json();
      const d = body.detail;
      if (typeof d === "string") message = d;
      else if (d?.message) {
        message = d.message;
        problems = d.problems ?? [];
      }
    } catch {
      /* body not json */
    }
    throw new ApiError(message, res.status, problems);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export interface Health {
  name: string;
  version: string;
  auth: "token" | "local-only";
  auto_update_hours: number;
}

export interface ScopeIn {
  operator: string;
  confirmed: boolean;
  networks: string[];
  allow_public_targets: boolean;
  statement_version: string;
}

export interface CheckResult {
  id: string;
  ok: boolean;
  severity: string;
  title: string;
  detail?: string;
  fix?: string;
}
export interface UpdateResult {
  step: string;
  success: boolean;
  detail: string;
}

export const api = {
  health: () => call<Health>("/api/health"),
  modules: () => call<ModuleInfo[]>("/api/modules"),
  statement: () => call<{ version: string; text: string; hash: string }>("/api/scope/statement"),
  startScan: (scope: ScopeIn, assets: Asset[]) =>
    call<ScanJob>("/api/scans", { method: "POST", body: JSON.stringify({ scope, assets }) }),
  scans: () => call<ScanJob[]>("/api/scans"),
  scan: (id: string) => call<ScanJob>(`/api/scans/${encodeURIComponent(id)}`),
  reportUrl: (id: string, format: "html" | "markdown" | "pdf") =>
    `${base()}/api/scans/${encodeURIComponent(id)}/report?format=${format}`,
  report: (id: string, format: "html" | "markdown") =>
    call<string>(`/api/scans/${encodeURIComponent(id)}/report?format=${format}`),
  updatesStatus: () =>
    call<{ at: string | null; results: UpdateResult[] }>("/api/updates/status"),
  runUpdates: () => call<UpdateResult[]>("/api/updates/run", { method: "POST" }),
  checkHeaders: (url: string) =>
    call<{ url: string; results: CheckResult[] }>(
      "/api/checks/headers",
      { method: "POST", body: JSON.stringify({ url }) },
    ),
  checkEmailDns: (domain: string) =>
    call<{ domain: string; results: CheckResult[] }>("/api/checks/email-dns", {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
};

/**
 * Reads the engine's live progress stream (Server-Sent Events) with fetch, so the access token
 * can travel as a header (EventSource cannot send headers). Resolves with the final summary.
 * Rejects if the stream breaks; the caller then falls back to polling.
 */
export async function streamScan(id: string, onProgress: (job: ScanJob) => void, signal: AbortSignal): Promise<ScanJob> {
  const res = await fetch(`${base()}/api/scans/${encodeURIComponent(id)}/events`, {
    headers: { Accept: "text/event-stream", ...authHeaders() },
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.statusText, res.status);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new ApiError("stream ended", 0);
    buffer += value;
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || !data) continue; // heartbeat comment
      const job = JSON.parse(data) as ScanJob;
      if (event === "done") return job;
      if (event === "progress") onProgress(job);
      if (event === "gone") throw new ApiError("scan gone", 404);
    }
  }
}
