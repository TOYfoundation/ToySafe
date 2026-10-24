import { useState } from "react";
import { Icon } from "../components/Icon";
import { Panel, StationHeader } from "../components/ui";
import { LANGS, useT } from "../i18n";
import { useEngine } from "../lib/engine";
import { resetAll, updateSettings, useStore, type Settings as S } from "../lib/store";

function Seg<K extends keyof S>({ field, options, label }: { field: K; options: S[K][]; label: string }) {
  const t = useT();
  const value = useStore((s) => s.settings[field]);
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={value === o}
            className={value === o ? "is-on" : ""}
            onClick={() => updateSettings({ [field]: o } as Partial<S>)}
          >
            {t(`set.${String(field)}.${String(o)}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const { live, checking, health, recheck } = useEngine();
  const [base, setBase] = useState(settings.apiBase);
  const [token, setToken] = useState(settings.apiToken);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="station">
      <StationHeader icon="settings" title={t("station.settings")} lead={t("set.lead")} />
      <div className="two-col">
        <Panel title={t("set.engine")} icon="operator" tone={live ? "shield" : undefined}>
          <p className={`state-line st-${live ? "ok" : "warn"}`} role="status">
            <Icon name={live ? "check" : "emergency"} size={16} />
            {checking ? t("common.checking") : live ? t("set.connected", { v: health?.version ?? "" }) : t("set.notConnected")}
          </p>
          <Seg field="mode" options={["auto", "live", "demo"]} label={t("set.modeLabel")} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSettings({ apiBase: base.trim(), apiToken: token.trim() });
              recheck();
            }}
          >
            <label className="field">
              <span>{t("set.base")}</span>
              <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://127.0.0.1:8000" spellCheck={false} />
              <small>{t("set.baseHelp")}</small>
            </label>
            <label className="field">
              <span>{t("set.token")}</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
              <small>{t("set.tokenHelp")}</small>
            </label>
            <button className="btn btn-primary btn-sm">{t("set.connect")}</button>
          </form>
          {health && <p className="muted">{t(`set.auth.${health.auth}`)}</p>}
        </Panel>

        <Panel title={t("set.look")} icon="settings">
          <Seg field="theme" options={["auto", "dark", "light"]} label={t("set.themeLabel")} />
          <Seg field="motion" options={["auto", "reduced"]} label={t("set.motionLabel")} />
          <div className="setting">
            <span className="setting-label">{t("set.langLabel")}</span>
            <div className="seg" role="radiogroup" aria-label={t("set.langLabel")}>
              {LANGS.map((l) => (
                <button key={l.code} type="button" role="radio" aria-checked={settings.lang === l.code} className={settings.lang === l.code ? "is-on" : ""} onClick={() => updateSettings({ lang: l.code })}>
                  {l.name}
                </button>
              ))}
            </div>
            <small className="muted">{t("set.langNote")}</small>
          </div>
        </Panel>
      </div>

      <div className="two-col">
        <Panel title={t("set.privacy")} icon="lock" tone="brass">
          <ul className="facts">
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i}>
                <Icon name="check" size={16} />
                <span>{t(`set.priv.${i}`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("set.data")} icon="refresh">
          <p>{t("set.dataLead")}</p>
          {confirmReset ? (
            <div className="btn-row">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => (resetAll(), setConfirmReset(false))}>
                {t("set.resetConfirm")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>
              {t("set.reset")}
            </button>
          )}
          <p className="fineprint">{t("set.about")} {t("set.version", { v: __APP_VERSION__, d: __BUILD_DATE__ })}</p>
        </Panel>
      </div>
    </div>
  );
}
