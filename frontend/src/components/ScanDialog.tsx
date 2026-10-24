import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { api, ApiError } from "../lib/api";
import { useEngine } from "../lib/engine";
import { exportAssets, parseAssets } from "../lib/assets";
import { isFramed } from "../lib/router";
import { getState, setState, updateSettings, useStore } from "../lib/store";
import { ASSET_TYPES, type Asset, type AssetType } from "../lib/types";
import { Icon } from "./Icon";
import { Modal } from "./ui";

const FALLBACK_STATEMENT = {
  version: "2026-10-1",
  text:
    "Ich bestätige, dass ich Eigentümer der angegebenen Geräte, Netze, Dienste und Repositories bin oder eine ausdrückliche, schriftliche Erlaubnis zur Prüfung habe. Ich prüfe keine fremden Systeme. Mir ist bekannt, dass unerlaubte Scans in vielen Ländern strafbar sind (in Deutschland u. a. §§ 202a ff. und 303b StGB).",
};

const blank = (i: number): Asset => ({
  id: `a${Date.now().toString(36)}${i}`,
  name: "",
  asset_type: "network_segment",
  ip_address: "",
  criticality: 3,
  externally_reachable: false,
});

function targetField(type: AssetType): "ip_address" | "url" | "path" | "image" {
  if (type === "web_service") return "url";
  if (type === "code_repository") return "path";
  if (type === "container_image") return "image";
  return "ip_address";
}

export function ScanDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { live, startScan, startDemoScan } = useEngine();
  const operatorSaved = useStore((s) => s.settings.operator);
  const [statement, setStatement] = useState(FALLBACK_STATEMENT);
  const [operator, setOperator] = useState(operatorSaved);
  const [networks, setNetworks] = useState(() => getState().networks || "192.168.178.0/24");
  const [allowPublic, setAllowPublic] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // The inventory is remembered in this browser, so the next scan starts with the same targets.
  const [assets, setAssets] = useState<Asset[]>(() =>
    getState().targets.length ? getState().targets : [{ ...blank(1), name: "Heimnetz", ip_address: "192.168.178.0/24" }],
  );
  const [importError, setImportError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (live) api.statement().then(setStatement).catch(() => undefined);
  }, [live]);

  const patch = (i: number, p: Partial<Asset>) => setAssets((xs) => xs.map((a, j) => (j === i ? { ...a, ...p } : a)));

  const submit = async () => {
    setProblems([]);
    if (!live) {
      startDemoScan();
      onClose();
      return;
    }
    const local: string[] = [];
    if (!operator.trim()) local.push(t("scan.err.operator"));
    if (!confirmed) local.push(t("scan.err.confirm"));
    const clean = assets.filter((a) => a.name.trim());
    if (!clean.length) local.push(t("scan.err.assets"));
    if (local.length) return setProblems(local);
    setBusy(true);
    try {
      updateSettings({ operator: operator.trim() });
      setState((st) => ({ ...st, targets: clean, networks }));
      await startScan(
        {
          operator: operator.trim(),
          confirmed,
          networks: networks.split(/[\s,]+/).filter(Boolean),
          allow_public_targets: allowPublic,
          statement_version: statement.version,
        },
        clean.map((a, i) => ({ ...a, id: a.id || `a${i}` })),
      );
      onClose();
    } catch (e) {
      const err = e as ApiError;
      setProblems(err.problems?.length ? err.problems : [err.message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("scan.dialogTitle")} onClose={onClose} wide>
      <div className="scope">
        <div className="scope-oath">
          <Icon name="lock" size={22} />
          <p>{statement.text}</p>
        </div>

        {live ? (
          <>
            <div className="form-grid">
              <label className="field">
                <span>{t("scan.operator")}</span>
                <input value={operator} onChange={(e) => setOperator(e.target.value)} autoComplete="name" />
              </label>
              <label className="field">
                <span>{t("scan.networks")}</span>
                <input value={networks} onChange={(e) => setNetworks(e.target.value)} placeholder="192.168.178.0/24, gang.example" />
                <small>{t("scan.networksHelp")}</small>
              </label>
            </div>

            <fieldset className="assets-edit">
              <legend>{t("scan.assets")}</legend>
              {assets.map((a, i) => {
                const field = targetField(a.asset_type);
                return (
                  <div className="asset-row" key={i}>
                    <label className="field">
                      <span>{t("scan.assetName")}</span>
                      <input value={a.name} onChange={(e) => patch(i, { name: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>{t("scan.assetType")}</span>
                      <select value={a.asset_type} onChange={(e) => patch(i, { asset_type: e.target.value as AssetType })}>
                        {ASSET_TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t(`asset.${ty}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{t(`scan.target.${field}`)}</span>
                      <input
                        value={(a[field] as string | undefined) ?? ""}
                        onChange={(e) =>
                          patch(i, field === "url" ? { url: e.target.value, hostname: safeHost(e.target.value) } : { [field]: e.target.value })
                        }
                      />
                    </label>
                    <label className="field field-narrow">
                      <span>{t("scan.criticality")}</span>
                      <select value={a.criticality} onChange={(e) => patch(i, { criticality: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="check-inline">
                      <input type="checkbox" checked={a.externally_reachable} onChange={(e) => patch(i, { externally_reachable: e.target.checked })} />
                      {t("scan.external")}
                    </label>
                    {assets.length > 1 && (
                      <button type="button" className="icon-btn" aria-label={t("common.remove")} onClick={() => setAssets((xs) => xs.filter((_, j) => j !== i))}>
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="btn-row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAssets((xs) => [...xs, blank(xs.length + 1)])}>
                  {t("scan.addAsset")}
                </button>
                <label className="btn btn-ghost btn-sm file-btn">
                  <Icon name="file" size={16} />
                  {t("assets.import")}
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        setAssets(parseAssets(await file.text()));
                        setImportError("");
                      } catch (err) {
                        setImportError(t((err as Error).message));
                      }
                    }}
                  />
                </label>
                {!isFramed && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const url = URL.createObjectURL(new Blob([exportAssets(assets.filter((a) => a.name.trim()))], { type: "application/json" }));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "assets.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    {t("assets.export")}
                  </button>
                )}
              </div>
              <small className="muted">{t("assets.help")}</small>
              {importError && <p className="problems" role="alert">{importError}</p>}
            </fieldset>

            <label className="check-inline">
              <input type="checkbox" checked={allowPublic} onChange={(e) => setAllowPublic(e.target.checked)} />
              {t("scan.allowPublic")}
            </label>
            <label className="check-inline oath-check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <strong>{t("scan.confirm")}</strong>
            </label>
          </>
        ) : (
          <p className="muted">{t("scan.demoExplain")}</p>
        )}

        {problems.length > 0 && (
          <ul className="problems" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || (live && !confirmed)}>
            <Icon name="scan" size={18} />
            {live ? t("scan.go") : t("scan.goDemo")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function safeHost(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
}
