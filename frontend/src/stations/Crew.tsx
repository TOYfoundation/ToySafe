import { useState } from "react";
import { ALL_LISTS, Checklist, listProgress } from "../components/Checklist";
import { Icon } from "../components/Icon";
import { Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { go } from "../lib/router";
import { useStore } from "../lib/store";

const AUDIENCES = ["kids", "elders", "gang", "mods"] as const;
const RULES = [1, 2, 3, 4, 5];

export function Crew() {
  const t = useT();
  const done = useStore((s) => s.checklist);
  const realWorld = useStore((s) => s.game.realWorld);
  const [aud, setAud] = useState<(typeof AUDIENCES)[number]>("kids");
  const [name, setName] = useState("");

  return (
    <div className="station">
      <StationHeader icon="crew" title={t("station.crew")} lead={t("crew.lead")} />

      <div className="two-col">
        <Panel title={t("crew.card")} icon="print" tone="brass" className="no-print-panel">
          <p>{t("crew.cardLead")}</p>
          <div className="seg" role="radiogroup" aria-label={t("crew.for")}>
            {AUDIENCES.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={aud === a} className={aud === a ? "is-on" : ""} onClick={() => setAud(a)}>
                {t(`crew.aud.${a}`)}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t("crew.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("crew.namePh")} />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <Icon name="print" size={16} />
            {t("crew.printCard")}
          </button>
        </Panel>

        <article className="safety-card print-area" aria-label={t("crew.card")}>
          <header>
            <Icon name="bridge" size={26} />
            <div>
              <h2>{t(`crew.cardTitle.${aud}`)}</h2>
              {name && <p>{t("crew.forName", { name })}</p>}
            </div>
          </header>
          <ol>
            {RULES.map((r) => (
              <li key={r}>{t(`crew.rule.${aud}.${r}`)}</li>
            ))}
          </ol>
          <footer>{t("crew.cardFooter")}</footer>
        </article>
      </div>

      <div className="two-col">
        <Checklist id="family" />
        <Panel title={t("crew.mods")} icon="users" tone="shield">
          <ol className="steps">
            <li>{t("crew.mod.1")}</li>
            <li>{t("crew.mod.2")}</li>
            <li>{t("crew.mod.3")}</li>
            <li>{t("crew.mod.4")}</li>
            <li>{t("crew.mod.5")}</li>
          </ol>
          <p className="fineprint">{t("crew.modNote")}</p>
        </Panel>
      </div>

      <Panel title={t("crew.progress")} icon="academy">
        <ul className="progress-lists">
          {ALL_LISTS.map((l) => {
            const p = listProgress(l, done);
            return (
              <li key={l.id}>
                <span>{l.title}</span>
                <span className="muted">{t("check.progress", { n: p.n, total: p.total })}</span>
                {realWorld.includes(l.id) && <span className="seal-chip">{t("crew.sealed")}</span>}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("academy")}>
          {t("crew.toGame")}
        </button>
      </Panel>
    </div>
  );
}
