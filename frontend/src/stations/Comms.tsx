import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Empty, FindingItem, Meter, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { useEngine } from "../lib/engine";
import { analyzeMessage, checkLink } from "../lib/scam";
import { setState, useStore } from "../lib/store";

const EXAMPLES = ["comms.ex.support", "comms.ex.swap", "comms.ex.friend"];

export function Comms() {
  const t = useT();
  const { job } = useEngine();
  const bookmarks = useStore((s) => s.bookmarks);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [newMark, setNewMark] = useState("");
  const report = useMemo(() => (text.trim() ? analyzeMessage(text, bookmarks) : null), [text, bookmarks]);
  const linkReport = useMemo(() => (link.trim() ? checkLink(link.trim(), bookmarks) : null), [link, bookmarks]);
  const findings = (job?.findings ?? []).filter((f) => f.station === "comms");
  const assets = new Map((job?.assets ?? []).map((a) => [a.id, a]));

  return (
    <div className="station">
      <StationHeader icon="comms" title={t("station.comms")} lead={t("comms.lead")} />

      <div className="comms-layout">
        <Panel title={t("comms.detector")} icon="chat" tone="shield" className="comms-main">
          <label className="field">
            <span>{t("comms.paste")}</span>
            <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("comms.placeholder")} />
            <small>{t("comms.local")}</small>
          </label>
          <div className="btn-row">
            <span className="muted">{t("comms.examples")}</span>
            {EXAMPLES.map((k, i) => (
              <button key={k} type="button" className="btn btn-ghost btn-sm" onClick={() => setText(t(k))}>
                {t("comms.example", { n: i + 1 })}
              </button>
            ))}
          </div>

          {report && (
            <div className={`verdict verdict-${report.verdict}`} role="status" aria-live="polite">
              <div className="verdict-head">
                <strong>{t(`comms.verdict.${report.verdict}`)}</strong>
                <span>{t("comms.score", { n: report.score })}</span>
              </div>
              <Meter value={report.score} label={t("comms.score", { n: report.score })} tone={report.verdict === "safe" ? "ok" : report.verdict === "caution" ? "warn" : "bad"} />
              {report.phraseLeak && <p className="alarm-inline">{t("comms.phraseLeak")}</p>}
              {report.hits.length > 0 && (
                <ul className="hits">
                  {report.hits.map((h) => (
                    <li key={h.id}>
                      <strong>{h.title}</strong>
                      <q>{h.match}</q>
                      <p>{h.fact}</p>
                    </li>
                  ))}
                </ul>
              )}
              {report.links.map((l) => (
                <div key={l.url} className="link-report">
                  <p>
                    <Icon name="link" size={14} /> <code>{l.host}</code>
                  </p>
                  <ul className="bullets">
                    {l.issues.length ? l.issues.map((i) => <li key={i.id}>{t(i.detail)}</li>) : <li>{t("link.none")}</li>}
                  </ul>
                </div>
              ))}
              {report.verdict !== "safe" && <p className="muted">{t("comms.next")}</p>}
            </div>
          )}
        </Panel>

        <div className="comms-side">
          <Panel title={t("comms.linkCheck")} icon="link">
            <label className="field">
              <span>{t("comms.linkLabel")}</span>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" spellCheck={false} />
            </label>
            {linkReport && (
              <ul className={`bullets ${linkReport.issues.length ? "is-bad" : "is-ok"}`} role="status">
                {linkReport.issues.length ? (
                  linkReport.issues.map((i) => <li key={i.id}>{t(i.detail)}</li>)
                ) : (
                  <li>{t("link.none")}</li>
                )}
              </ul>
            )}
          </Panel>
          <Panel title={t("comms.bookmarks")} icon="star" tone="brass">
            <p className="muted">{t("comms.bookmarksLead")}</p>
            <form
              className="input-row"
              onSubmit={(e) => {
                e.preventDefault();
                const d = newMark.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
                if (d && !bookmarks.includes(d)) setState((s) => ({ ...s, bookmarks: [...s.bookmarks, d] }));
                setNewMark("");
              }}
            >
              <label className="sr-only" htmlFor="bm">{t("comms.bookmarkAdd")}</label>
              <input id="bm" value={newMark} onChange={(e) => setNewMark(e.target.value)} placeholder="toyverse.example" />
              <button className="btn btn-ghost btn-sm">{t("common.add")}</button>
            </form>
            {bookmarks.length > 0 && (
              <ul className="chips">
                {bookmarks.map((b) => (
                  <li key={b}>
                    {b}
                    <button type="button" aria-label={t("common.remove")} onClick={() => setState((s) => ({ ...s, bookmarks: s.bookmarks.filter((x) => x !== b) }))}>
                      <Icon name="close" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t("comms.wifi")} icon="comms">
            <ul className="bullets">
              <li>{t("comms.wifi1")}</li>
              <li>{t("comms.wifi2")}</li>
              <li>{t("comms.wifi3")}</li>
            </ul>
            {findings.length ? (
              <ul className="findings">
                {findings.map((f) => (
                  <FindingItem key={f.id} finding={f} asset={assets.get(f.asset_id)} />
                ))}
              </ul>
            ) : (
              <Empty icon="comms" title={t("comms.noFindings")} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
