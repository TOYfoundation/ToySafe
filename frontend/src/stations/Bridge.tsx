import { useEffect, useState } from "react";
import { ShieldRing, statusOf } from "../components/ShieldRing";
import { Icon } from "../components/Icon";
import { DemoNote, Empty, FindingItem, Panel } from "../components/ui";
import { useT } from "../i18n";
import { getState } from "../lib/store";
import { api, type UpdateResult } from "../lib/api";
import { useEngine } from "../lib/engine";
import { go, type Route } from "../lib/router";
import { RING_STATIONS } from "../lib/types";

const QUICK: { route: Route; icon: string; key: string }[] = [
  { route: "comms", icon: "chat", key: "bridge.quick.message" },
  { route: "vault", icon: "key", key: "bridge.quick.address" },
  { route: "emergency", icon: "emergency", key: "bridge.quick.emergency" },
  { route: "academy", icon: "academy", key: "bridge.quick.academy" },
];

export function Bridge() {
  const t = useT();
  const { job, live, scanning } = useEngine();
  const [updates, setUpdates] = useState<{ at: string | null; results: UpdateResult[] } | null>(null);

  useEffect(() => {
    if (live) api.updatesStatus().then(setUpdates).catch(() => setUpdates(null));
  }, [live]);

  const score = job?.score ?? null;
  const findings = job?.findings ?? [];
  const assets = job?.assets ?? [];
  const urgent = findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 4);
  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <div className="bridge">
      <section className="bridge-hero" aria-labelledby="bridge-title">
        <div className="bridge-ring">
          <ShieldRing
            score={score?.score ?? null}
            stations={score?.stations ?? null}
            gradeLabel={score ? score.label : t("bridge.noScan")}
            onSelect={(s) => go(s)}
          />
        </div>
        <div className="bridge-intro">
          <h1 id="bridge-title">{t("bridge.title")}</h1>
          <p className="lead">{t("bridge.lead")}</p>
          {!live && <DemoNote />}
          <ul className="station-legend">
            {RING_STATIONS.map((s) => {
              const v = score?.stations[s];
              return (
                <li key={s}>
                  <button type="button" onClick={() => go(s)} className={`legend-row ${v == null ? "" : `st-${statusOf(v)}`}`}>
                    <Icon name={s} size={18} />
                    <span>{t(`station.${s}`)}</span>
                    <span className="legend-val">{v ?? "–"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="bridge-cta">
            <button type="button" className="btn btn-primary" onClick={() => go("shields", "scan")} disabled={scanning}>
              <Icon name="scan" size={18} />
              {scanning ? t("scan.running") : t("scan.start")}
            </button>
            {score && score.kev > 0 && <span className="kev-alert">{t("bridge.kev", { n: score.kev })}</span>}
          </div>
        </div>
      </section>

      <div className="bridge-grid">
        <Panel title={t("bridge.urgent")} icon="emergency" tone={urgent.length ? "alert" : undefined} className="span-2">
          {urgent.length ? (
            <ul className="findings">
              {urgent.map((f, i) => (
                <FindingItem key={f.id} finding={f} asset={assetById.get(f.asset_id)} defaultOpen={i === 0} />
              ))}
            </ul>
          ) : (
            <Empty icon="shields" title={job ? t("bridge.noUrgent") : t("bridge.noScanYet")}>
              {!job && (
                <button type="button" className="btn btn-ghost" onClick={() => go("shields", "scan")}>
                  {t("scan.start")}
                </button>
              )}
            </Empty>
          )}
          {findings.length > urgent.length && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("shields")}>
              {t("bridge.allFindings", { n: findings.length })}
            </button>
          )}
        </Panel>

        <Panel title={t("bridge.quick")} icon="star" tone="brass">
          <div className="quick-grid">
            {QUICK.map((q) => (
              <button key={q.route} type="button" className="quick" onClick={() => go(q.route)}>
                <Icon name={q.icon} size={22} />
                <span>{t(q.key)}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t("bridge.situation")} icon="refresh">
          {live ? (
            updates?.at ? (
              <>
                <p className="muted">{t("bridge.updatedAt", { at: new Date(updates.at).toLocaleString(getState().settings.lang) })}</p>
                <ul className="status-list">
                  {updates.results.map((r) => (
                    <li key={r.step} className={r.success ? "ok" : "bad"}>
                      <span className="dot" aria-hidden="true" />
                      <span>{r.step}</span>
                      <small>{r.detail}</small>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">{t("bridge.noUpdates")}</p>
            )
          ) : (
            <ul className="status-list">
              <li className="ok"><span className="dot" aria-hidden="true" /><span>{t("bridge.demo.kev")}</span></li>
              <li className="ok"><span className="dot" aria-hidden="true" /><span>{t("bridge.demo.templates")}</span></li>
              <li className="ok"><span className="dot" aria-hidden="true" /><span>{t("bridge.demo.signatures")}</span></li>
            </ul>
          )}
          <p className="fineprint">{t("bridge.principles")}</p>
        </Panel>
      </div>
    </div>
  );
}
