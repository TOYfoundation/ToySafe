import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { ScanConsole } from "../components/ScanConsole";
import { DemoNote, Empty, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { isFramed } from "../lib/router";
import { useEngine } from "../lib/engine";
import { getState } from "../lib/store";
import type { ScanJob } from "../lib/types";

function toMarkdown(job: ScanJob, t: (k: string, v?: Record<string, string | number>) => string) {
  const assets = new Map((job.assets ?? []).map((a) => [a.id, a]));
  const lines = [
    `# ${t("log.reportTitle")}`,
    "",
    `${t("log.created")}: ${new Date(job.finished_at ?? job.created_at).toLocaleString(getState().settings.lang)}`,
    job.score ? `${t("ring.unit")}: ${job.score.score}/100 (${job.score.label})` : "",
    "",
  ];
  (job.findings ?? []).forEach((f, i) => {
    lines.push(`## ${i + 1}. ${f.title}`, "");
    lines.push(`- ${t("log.asset")}: ${assets.get(f.asset_id)?.name ?? f.asset_id}`);
    lines.push(`- ${t("log.severity")}: ${t(`sev.${f.severity}`)}${f.is_actively_exploited ? ` (${t("finding.kev")})` : ""}`);
    lines.push(`- ${t("finding.source")}: ${f.source_plugin}`, "", f.description, "");
    if (f.recommendation) lines.push(`**${t("finding.fix")}** ${f.recommendation}`, "");
  });
  return lines.join("\n");
}

function download(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Logbook() {
  const t = useT();
  const { job, live, loadJob } = useEngine();
  const [scans, setScans] = useState<ScanJob[]>([]);

  useEffect(() => {
    if (live) api.scans().then(setScans).catch(() => setScans([]));
  }, [live, job?.status]);

  return (
    <div className="station">
      <StationHeader icon="logbook" title={t("station.logbook")} lead={t("log.lead")} />
      {!live && <DemoNote />}
      <div className="two-col">
        <Panel title={t("log.current")} icon="scan">
          {job ? (
            <>
              <ScanConsole job={job} />
              {job.status === "done" && !isFramed && (
                <div className="btn-row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => download(`toysafe-${job.id}.md`, toMarkdown(job, t))}>
                    <Icon name="file" size={16} />
                    {t("log.md")}
                  </button>
                  {live && (
                    <>
                      <a className="btn btn-ghost btn-sm" href={api.reportUrl(job.id, "html")} target="_blank" rel="noreferrer">
                        {t("log.html")}
                      </a>
                      <a className="btn btn-ghost btn-sm" href={api.reportUrl(job.id, "pdf")}>
                        {t("log.pdf")}
                      </a>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <Empty icon="logbook" title={t("bridge.noScanYet")} />
          )}
        </Panel>
        <Panel title={t("log.history")} icon="logbook">
          {live ? (
            scans.length ? (
              <ul className="scan-list">
                {scans.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={`scan-row ${job?.id === s.id ? "is-selected" : ""}`} onClick={() => loadJob(s.id)}>
                      <span className={`dot st-${s.status === "done" ? "ok" : s.status === "failed" ? "bad" : "warn"}`} aria-hidden="true" />
                      <span>{new Date(s.created_at).toLocaleString(getState().settings.lang)}</span>
                      <span className="muted">{s.operator}</span>
                      <span>{s.score ? `${s.score.score}` : t(`log.status.${s.status}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="logbook" title={t("log.noHistory")} />
            )
          ) : (
            <p className="muted">{t("log.demoHistory")}</p>
          )}
          <p className="fineprint">{t("log.privacy")}</p>
        </Panel>
      </div>
    </div>
  );
}
