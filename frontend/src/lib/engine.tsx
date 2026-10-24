import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, streamScan, type Health, type ScopeIn } from "./api";
import { demoAssets, demoJob, demoModules, demoScanScript } from "./demo";
import { shieldStrength } from "./score";
import { setState, useStore } from "./store";
import type { Asset, ModuleInfo, ScanJob } from "./types";

interface Engine {
  live: boolean;
  checking: boolean;
  health: Health | null;
  modules: ModuleInfo[];
  job: ScanJob | null; // with findings the user marked as fixed removed
  rawJob: ScanJob | null;
  scanning: boolean;
  startScan: (scope: ScopeIn, assets: Asset[]) => Promise<void>;
  startDemoScan: () => void;
  loadJob: (id: string) => Promise<void>;
  recheck: () => void;
}

const Ctx = createContext<Engine | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const mode = useStore((s) => s.settings.mode);
  const apiBase = useStore((s) => s.settings.apiBase);
  const apiToken = useStore((s) => s.settings.apiToken);
  const lastJobId = useStore((s) => s.lastJobId);
  const resolved = useStore((s) => s.resolved);
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);
  const [modules, setModules] = useState<ModuleInfo[]>(demoModules);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const live = mode !== "demo" && health !== null;

  useEffect(() => {
    let cancelled = false;
    if (mode === "demo") {
      setHealth(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    api
      .health()
      .then(async (h) => {
        if (cancelled) return;
        setHealth(h);
        try {
          setModules(await api.modules());
        } catch {
          /* keep demo list */
        }
      })
      .catch(() => !cancelled && setHealth(null))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [mode, apiBase, apiToken, nonce]);

  // Demo mode shows the demo fleet; live mode shows the last scan of this browser.
  useEffect(() => {
    if (checking) return;
    if (!live) {
      setModules(demoModules);
      setJob(demoJob());
      return;
    }
    if (lastJobId)
      api
        .scan(lastJobId)
        .then((j) => {
          setJob(j);
          if (j.status === "running" || j.status === "queued") followRef.current(j.id);
        })
        .catch(() => setJob(null));
    else setJob(null);
  }, [live, checking, lastJobId]);

  const stream = useRef<AbortController | null>(null);
  const followRef = useRef<(id: string) => void>(() => undefined);

  const poll = useCallback((id: string) => {
    window.clearTimeout(timer.current);
    const step = async () => {
      try {
        const j = await api.scan(id);
        setJob(j);
        if (j.status === "queued" || j.status === "running") timer.current = window.setTimeout(step, 1200);
      } catch {
        timer.current = window.setTimeout(step, 3000);
      }
    };
    step();
  }, []);

  // Live progress: follow the engine's event stream, keep findings/assets from the last full load,
  // fetch the full result once at the end. If the stream is blocked, fall back to polling.
  const follow = useCallback(
    (id: string) => {
      stream.current?.abort();
      window.clearTimeout(timer.current);
      const ctrl = new AbortController();
      stream.current = ctrl;
      streamScan(id, (summary) => setJob((prev) => ({ ...prev, ...summary })), ctrl.signal)
        .then(async () => {
          if (!ctrl.signal.aborted) setJob(await api.scan(id));
        })
        .catch(() => {
          if (!ctrl.signal.aborted) poll(id);
        });
    },
    [poll],
  );
  followRef.current = follow;

  useEffect(() => () => (window.clearTimeout(timer.current), stream.current?.abort()), []);

  const startScan = useCallback(
    async (scope: ScopeIn, assets: Asset[]) => {
      const j = await api.startScan(scope, assets);
      setState((s) => ({ ...s, lastJobId: j.id }));
      setJob(j);
      follow(j.id);
    },
    [follow],
  );

  const startDemoScan = useCallback(() => {
    window.clearTimeout(timer.current);
    setState((s) => ({ ...s, resolved: Object.fromEntries(Object.entries(s.resolved).filter(([k]) => !k.startsWith("demo:"))) }));
    const total = demoScanScript.length;
    const base: ScanJob = {
      id: "demo",
      operator: "Demo",
      status: "running",
      created_at: new Date().toISOString(),
      step: 0,
      total_steps: total,
      log: [],
      asset_count: demoAssets.length,
      finding_count: 0,
      phase: demoScanScript[0].phase,
    };
    setJob(base);
    let i = 0;
    const next = () => {
      const line = demoScanScript[i];
      i += 1;
      setJob((prev) => {
        const p = prev ?? base;
        const log = [...p.log, { at: new Date().toISOString(), kind: "step", message: line.message }];
        if (i >= total) return { ...demoJob(), log, created_at: p.created_at, finished_at: new Date().toISOString() };
        return { ...p, step: i, phase: line.phase, current: line.message, log };
      });
      if (i < total) timer.current = window.setTimeout(next, 650);
    };
    timer.current = window.setTimeout(next, 400);
  }, []);

  const loadJob = useCallback(
    async (id: string) => {
      setState((s) => ({ ...s, lastJobId: id }));
      const j = await api.scan(id);
      setJob(j);
      if (j.status === "running" || j.status === "queued") follow(id);
    },
    [follow],
  );

  // Findings the user marked as fixed leave the list and the score is recalculated (same formula as the engine).
  const effective = useMemo<ScanJob | null>(() => {
    if (!job?.findings || job.status !== "done") return job;
    const open = job.findings.filter((f) => !resolved[`${job.id}:${f.id}`]);
    if (open.length === job.findings.length) return job;
    return { ...job, findings: open, finding_count: open.length, score: shieldStrength(open, job.assets ?? []) };
  }, [job, resolved]);

  const value = useMemo<Engine>(
    () => ({
      live,
      checking,
      health,
      modules,
      job: effective,
      rawJob: job,
      scanning: job?.status === "running" || job?.status === "queued",
      startScan,
      startDemoScan,
      loadJob,
      recheck: () => setNonce((n) => n + 1),
    }),
    [live, checking, health, modules, effective, job, startScan, startDemoScan, loadJob],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEngine() {
  const v = useContext(Ctx);
  if (!v) throw new Error("EngineProvider missing");
  return v;
}
