import { useEffect, useMemo, useState } from "react";
import { Checklist } from "../components/Checklist";
import { Icon } from "../components/Icon";
import { ScanConsole } from "../components/ScanConsole";
import { ScanDialog } from "../components/ScanDialog";
import { DemoNote, Empty, FindingItem, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { useEngine } from "../lib/engine";
import { setState, useStore } from "../lib/store";
import { go } from "../lib/router";
import { RING_STATIONS, SEVERITIES, type Severity, type StationId } from "../lib/types";

export function Shields({ arg }: { arg: string | null }) {
  const t = useT();
  const { job, rawJob, live, scanning } = useEngine();
  const resolved = useStore((s) => s.resolved);
  const resolvedHere = rawJob ? Object.keys(resolved).filter((k) => k.startsWith(`${rawJob.id}:`) && resolved[k]).length : 0;
  const [dialog, setDialog] = useState(false);
  const [sev, setSev] = useState<Severity | "all">("all");
  const [station, setStation] = useState<StationId | "all">("all");

  useEffect(() => {
    if (arg === "scan") {
      setDialog(true);
      go("shields");
    }
  }, [arg]);

  const findings = job?.findings ?? [];
  const assets = new Map((job?.assets ?? []).map((a) => [a.id, a]));
  const shown = useMemo(
    () => findings.filter((f) => (sev === "all" || f.severity === sev) && (station === "all" || f.station === station)),
    [findings, sev, station],
  );

  return (
    <div className="station">
      <StationHeader icon="shields" title={t("station.shields")} lead={t("shields.lead")}>
        <button type="button" className="btn btn-primary" onClick={() => setDialog(true)} disabled={scanning}>
          <Icon name="scan" size={18} />
          {scanning ? t("scan.running") : t("scan.start")}
        </button>
      </StationHeader>
      {!live && <DemoNote />}

      {job && (scanning || job.status === "failed" || job.log.length > 0) && (
        <Panel title={t("scan.console")} icon="scan" tone="shield">
          <ScanConsole job={job} />
        </Panel>
      )}

      <Panel
        title={t("shields.findings", { n: findings.length })}
        icon="shields"
        actions={
          <div className="filters">
            <label className="sr-only" htmlFor="f-sev">{t("shields.filterSev")}</label>
            <select id="f-sev" value={sev} onChange={(e) => setSev(e.target.value as Severity | "all")}>
              <option value="all">{t("shields.allSev")}</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {t(`sev.${s}`)} ({job?.score?.counts[s] ?? 0})
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="f-st">{t("shields.filterStation")}</label>
            <select id="f-st" value={station} onChange={(e) => setStation(e.target.value as StationId | "all")}>
              <option value="all">{t("shields.allStations")}</option>
              {RING_STATIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`station.${s}`)}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {shown.length ? (
          <>
            <p className="muted">{t("shields.order")}</p>
            <ol className="findings">
              {shown.map((f) => (
                <FindingItem key={f.id} finding={f} asset={assets.get(f.asset_id)} />
              ))}
            </ol>
          </>
        ) : (
          <Empty icon="shields" title={job ? t("shields.none") : t("bridge.noScanYet")} />
        )}
        {resolvedHere > 0 && rawJob && (
          <div className="resolved-row">
            <span className="muted">{t("shields.resolved", { n: resolvedHere })}</span>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => setState((s) => ({ ...s, resolved: Object.fromEntries(Object.entries(s.resolved).filter(([k]) => !k.startsWith(`${rawJob.id}:`))) }))}>
              {t("shields.reopen")}
            </button>
          </div>
        )}
      </Panel>

      <div className="two-col">
        <Checklist id="router" />
        <Checklist id="devices" />
      </div>

      {dialog && <ScanDialog onClose={() => setDialog(false)} />}
    </div>
  );
}
