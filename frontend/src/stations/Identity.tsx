import { useMemo, useState } from "react";
import { CheckForm } from "../components/CheckForm";
import { Checklist } from "../components/Checklist";
import { Icon } from "../components/Icon";
import { CopyButton, Meter, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { BITS_PER_WORD, estimate, generate } from "../lib/passphrase";
import { looksLikePhrase } from "../lib/scam";

const LEVEL_TONE = ["bad", "bad", "warn", "ok", "ok"];

export function Identity() {
  const t = useT();
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [words, setWords] = useState(7);
  const [gen, setGen] = useState(() => generate(7));
  const s = useMemo(() => estimate(pass), [pass]);
  const phraseAlarm = looksLikePhrase(pass);

  return (
    <div className="station">
      <StationHeader icon="identity" title={t("station.identity")} lead={t("identity.lead")} />

      <div className="two-col">
        <Panel title={t("identity.lab")} icon="key" tone="shield">
          <p className="warn-line">
            <Icon name="lock" size={16} />
            {t("identity.labWarn")}
          </p>
          <label className="field">
            <span>{t("identity.try")}</span>
            <div className="input-row">
              <input
                type={show ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                data-lpignore="true"
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(!show)} aria-pressed={show}>
                <Icon name="eye" size={16} />
                {show ? t("common.hide") : t("common.show")}
              </button>
            </div>
          </label>
          {phraseAlarm ? (
            <div className="alarm" role="alert">
              <strong>{t("identity.phraseAlarm")}</strong>
              <p>{t("identity.phraseAlarmText")}</p>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setPass("")}>
                {t("identity.clear")}
              </button>
            </div>
          ) : (
            <>
              <Meter value={Math.min(s.bits, 90)} max={90} label={t("identity.bits", { bits: s.bits })} tone={LEVEL_TONE[s.level]} />
              <p className="strength-line">
                <strong>{t(`identity.level.${s.level}`)}</strong> <span className="muted">({t("identity.bits", { bits: s.bits })})</span>
              </p>
              {s.notes.length > 0 && (
                <ul className="bullets">
                  {s.notes.map((n) => (
                    <li key={n}>{t(n)}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>

        <Panel title={t("identity.gen")} icon="star" tone="brass">
          <p className="passgen" aria-live="polite">{gen}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setGen(generate(words))}>
              <Icon name="refresh" size={16} />
              {t("identity.newGen")}
            </button>
            <CopyButton text={gen} />
            <label className="field field-inline">
              <span>{t("identity.words")}</span>
              <select value={words} onChange={(e) => (setWords(Number(e.target.value)), setGen(generate(Number(e.target.value))))}>
                {[5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">{t("identity.genInfo", { bits: Math.round(words * BITS_PER_WORD) })}</p>
          <p className="fineprint">{t("identity.genNotWallet")}</p>
        </Panel>
      </div>

      <div className="two-col">
        <Panel title={t("identity.twofa")} icon="lock">
          <ol className="steps">
            <li>{t("identity.2fa.1")}</li>
            <li>{t("identity.2fa.2")}</li>
            <li>{t("identity.2fa.3")}</li>
            <li>{t("identity.2fa.4")}</li>
            <li>{t("identity.2fa.5")}</li>
          </ol>
          <p className="muted">{t("identity.2faNote")}</p>
        </Panel>
        <Panel title={t("identity.mail")} icon="chat">
          <p>{t("identity.mailLead")}</p>
          <CheckForm label={t("identity.domain")} placeholder="gang.example" run={(d) => api.checkEmailDns(d)} />
        </Panel>
      </div>

      <Checklist id="identity" />
    </div>
  );
}
