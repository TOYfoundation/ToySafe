import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { getState } from "../lib/store";
import type { ScanJob } from "../lib/types";
import { Meter } from "./ui";

const PHASES = ["1_discovery", "2_external", "3_vuln_scan", "4_config_audit", "5_deep_dive"];
const LABEL_TO_PHASE: Record<string, string> = {
  Erkundung: "1_discovery",
  Außenhülle: "2_external",
  Schwachstellen: "3_vuln_scan",
  Härtung: "4_config_audit",
  Tiefenprüfung: "5_deep_dive",
  Bericht: "5_deep_dive",
};

export function ScanConsole({ job }: { job: ScanJob }) {
  const t = useT();
  const logRef = useRef<HTMLOListElement>(null);
  const phase = job.phase ? (LABEL_TO_PHASE[job.phase] ?? job.phase) : null;
  const idx = phase ? PHASES.indexOf(phase) : -1;
  const done = job.status === "done";

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.log.length]);

  return (
    <div className={`console ${done ? "is-done" : ""}`} aria-live="polite">
      <ol className="phases">
        {PHASES.map((p, i) => (
          <li key={p} className={done || i < idx ? "past" : i === idx ? "now" : ""}>
            <span className="phase-dot" aria-hidden="true" />
            {t(`phase.${p}`)}
          </li>
        ))}
      </ol>
      <Meter value={job.step} max={Math.max(job.total_steps, 1)} label={t("scan.progress")} />
      <p className="console-now">
        {job.status === "failed"
          ? t("scan.failed", { error: job.error ?? "" })
          : done
            ? t("scan.done", { n: job.finding_count })
            : (job.current ?? t("scan.queued"))}
      </p>
      <ol className="console-log" ref={logRef}>
        {job.log.map((l, i) => (
          <li key={i} className={`log-${l.kind}`}>
            <time>{new Date(l.at).toLocaleTimeString(getState().settings.lang)}</time> {l.message}
          </li>
        ))}
      </ol>
    </div>
  );
}
