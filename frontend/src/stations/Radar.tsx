import { useState } from "react";
import { Icon } from "../components/Icon";
import { RadarScope } from "../components/RadarScope";
import { DemoNote, Empty, FindingItem, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { demoDevices } from "../lib/demo";
import { useEngine } from "../lib/engine";
import { go } from "../lib/router";
import { toggleMap, useStore } from "../lib/store";
import type { Device } from "../lib/types";

export function Radar() {
  const t = useT();
  const { job, live, scanning } = useEngine();
  const knownMap = useStore((s) => s.knownDevices);
  const [selected, setSelected] = useState<string | null>(null);

  const devices: Device[] = live
    ? (job?.assets ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        vendor: t(`asset.${a.asset_type}`),
        ip: a.ip_address || a.hostname || a.url || a.path || "",
        kind: a.asset_type === "network_device" ? "router" : a.asset_type === "toychain_node" ? "node" : "iot",
        known: true,
        since: "",
      }))
    : demoDevices;

  const isKnown = (d: Device) => knownMap[d.id] ?? d.known;
  const unknown = devices.filter((d) => !isKnown(d));
  const sel = devices.find((d) => d.id === selected) ?? null;
  const findings = (job?.findings ?? []).filter((f) => f.station === "radar" || f.station === "comms");
  const assets = new Map((job?.assets ?? []).map((a) => [a.id, a]));

  return (
    <div className="station">
      <StationHeader icon="radar" title={t("station.radar")} lead={t("radar.lead")} />
      {!live && <DemoNote />}
      <div className="radar-layout">
        <div className="radar-col">
          <RadarScope devices={devices} known={isKnown} selected={selected} onSelect={setSelected} scanning={scanning} />
          <p className="radar-count" aria-live="polite">
            {t("radar.count", { n: devices.length, u: unknown.length })}
          </p>
        </div>
        <div className="radar-side">
          {sel ? (
            <Panel title={sel.name} icon={isKnown(sel) ? "check" : "eye"} tone={isKnown(sel) ? "shield" : "alert"}>
              <dl className="kv">
                <div><dt>{t("radar.vendor")}</dt><dd>{sel.vendor}</dd></div>
                <div><dt>{t("radar.address")}</dt><dd>{sel.ip}</dd></div>
                {sel.since && <div><dt>{t("radar.since")}</dt><dd>{sel.since}</dd></div>}
                {sel.note && <div><dt>{t("radar.note")}</dt><dd>{sel.note}</dd></div>}
              </dl>
              {isKnown(sel) ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleMap("knownDevices", sel.id, false)}>
                  {t("radar.markUnknown")}
                </button>
              ) : (
                <>
                  <p>{t("radar.unknownAdvice")}</p>
                  <div className="btn-row">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => toggleMap("knownDevices", sel.id, true)}>
                      <Icon name="check" size={16} />
                      {t("radar.markKnown")}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("emergency", "unknown-device")}>
                      {t("radar.playbook")}
                    </button>
                  </div>
                </>
              )}
            </Panel>
          ) : (
            <Panel title={t("radar.howTitle")} icon="radar">
              <p>{t("radar.how")}</p>
              <ul className="bullets">
                <li>{t("radar.tip1")}</li>
                <li>{t("radar.tip2")}</li>
                <li>{t("radar.tip3")}</li>
              </ul>
            </Panel>
          )}
          <Panel title={t("radar.list")} icon="users">
            <ul className="device-list">
              {devices.map((d) => (
                <li key={d.id}>
                  <button type="button" className={`device ${isKnown(d) ? "" : "is-unknown"} ${selected === d.id ? "is-selected" : ""}`} onClick={() => setSelected(d.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className="device-name">{d.name}</span>
                    <span className="device-meta">{d.vendor}</span>
                    <span className="device-ip">{d.ip}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <Panel title={t("radar.findings")} icon="radar">
        {findings.length ? (
          <ul className="findings">
            {findings.map((f) => (
              <FindingItem key={f.id} finding={f} asset={assets.get(f.asset_id)} />
            ))}
          </ul>
        ) : (
          <Empty icon="radar" title={t("radar.noFindings")} />
        )}
      </Panel>
    </div>
  );
}
