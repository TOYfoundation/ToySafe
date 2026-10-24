import { CheckForm } from "../components/CheckForm";
import { Checklist } from "../components/Checklist";
import { Icon } from "../components/Icon";
import { Empty, FindingItem, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { useEngine } from "../lib/engine";

const LAYERS = ["op.layer.edge", "op.layer.sentry", "op.layer.keys", "op.layer.host", "op.layer.watch", "op.layer.release"];

export function Operator() {
  const t = useT();
  const { job, modules, live } = useEngine();
  const findings = (job?.findings ?? []).filter((f) => f.station === "operator");
  const assets = new Map((job?.assets ?? []).map((a) => [a.id, a]));

  return (
    <div className="station">
      <StationHeader icon="operator" title={t("station.operator")} lead={t("op.lead")} />

      <Panel title={t("op.findings", { n: findings.length })} icon="operator" tone={findings.some((f) => f.severity === "critical") ? "alert" : undefined}>
        {findings.length ? (
          <ul className="findings">
            {findings.map((f) => (
              <FindingItem key={f.id} finding={f} asset={assets.get(f.asset_id)} />
            ))}
          </ul>
        ) : (
          <Empty icon="operator" title={t("op.none")} />
        )}
      </Panel>

      <div className="two-col">
        <Panel title={t("op.layers")} icon="shields" tone="shield">
          <p>{t("op.layersLead")}</p>
          <ul className="layers">
            {LAYERS.map((k) => (
              <li key={k}>
                <strong>{t(`${k}.t`)}</strong>
                <span>{t(`${k}.d`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("op.headers")} icon="link">
          <p>{t("op.headersLead")}</p>
          <CheckForm label={t("op.url")} placeholder="https://gang.example" run={(u) => api.checkHeaders(u)} />
        </Panel>
      </div>

      <Panel title={t("op.modules")} icon="scan">
        <p className="muted">{live ? t("op.modulesLive") : t("op.modulesDemo")}</p>
        <ul className="modules">
          {modules.map((m) => (
            <li key={m.name} className={m.available ? "is-on" : ""}>
              <span className="mod-state" aria-label={m.available ? t("op.available") : t("op.missing")}>
                <Icon name={m.available ? "check" : "close"} size={14} />
              </span>
              <div>
                <strong>{m.name}</strong>
                <small>
                  {m.phase_label}, {m.tool}
                </small>
                <p>{m.explanation}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="two-col">
        <Checklist id="node" />
        <Checklist id="webops" />
      </div>
    </div>
  );
}
