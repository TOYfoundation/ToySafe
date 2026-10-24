import playbooks from "@content/playbooks.json";
import { Icon } from "../components/Icon";
import { Meter, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { go, isFramed } from "../lib/router";
import { setState, toggleMap, useStore } from "../lib/store";

interface Step {
  phase: string;
  text: string;
}
interface Playbook {
  id: string;
  title: string;
  audience: string;
  urgency: string;
  calm: string;
  steps: Step[];
}
const PB = playbooks.playbooks as Playbook[];
const PHASES = playbooks.phases as { id: string; label: string }[];
const CONTACTS = playbooks.contacts as { name: string; detail: string; url?: string }[];

export function Emergency({ arg }: { arg: string | null }) {
  const t = useT();
  const done = useStore((s) => s.playbook);
  const pb = PB.find((p) => p.id === arg);

  if (!pb)
    return (
      <div className="station">
        <StationHeader icon="emergency" title={t("station.emergency")} lead={t("em.lead")} />
        <h2 className="section-q">{t("em.question")}</h2>
        <ul className="pb-grid">
          {PB.map((p) => (
            <li key={p.id}>
              <button type="button" className={`pb-card urg-${p.urgency}`} onClick={() => go("emergency", p.id)}>
                <span className="pb-urg">{t(`sev.${p.urgency}`)}</span>
                <strong>{p.title}</strong>
                <small>{p.audience}</small>
              </button>
            </li>
          ))}
        </ul>
        <Panel title={t("em.contacts")} icon="users">
          <ul className="contacts">
            {CONTACTS.map((c) => (
              <li key={c.name}>
                <strong>{c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.name}</a> : c.name}</strong>
                <span>{c.detail}</span>
              </li>
            ))}
          </ul>
          <p className="fineprint">{t("em.contactsNote")}</p>
        </Panel>
      </div>
    );

  const key = (i: number) => `${pb.id}:${i}`;
  const n = pb.steps.filter((_, i) => done[key(i)]).length;

  return (
    <div className="station">
      <button type="button" className="btn btn-ghost btn-sm back" onClick={() => go("emergency")}>
        <Icon name="back" size={16} />
        {t("em.back")}
      </button>
      <header className={`pb-head urg-${pb.urgency}`}>
        <h1>{pb.title}</h1>
        <p className="calm">{pb.calm}</p>
        <div className="checklist-progress">
          <Meter value={n} max={pb.steps.length} label={t("check.progress", { n, total: pb.steps.length })} tone={n === pb.steps.length ? "ok" : undefined} />
          <span>{t("check.progress", { n, total: pb.steps.length })}</span>
        </div>
      </header>
      <ol className="pb-phases">
        {PHASES.filter((ph) => pb.steps.some((s) => s.phase === ph.id)).map((ph) => (
          <li key={ph.id} className="pb-phase">
            <h2>{ph.label}</h2>
            <ul className="checklist-items">
              {pb.steps.map((s, i) =>
                s.phase !== ph.id ? null : (
                  <li key={i} className={done[key(i)] ? "is-done" : ""}>
                    <label>
                      <input type="checkbox" checked={!!done[key(i)]} onChange={() => toggleMap("playbook", key(i))} />
                      <span className="check-box" aria-hidden="true" />
                      <span className="check-text">
                        <span>{s.text}</span>
                      </span>
                    </label>
                  </li>
                ),
              )}
            </ul>
          </li>
        ))}
      </ol>
      <div className="btn-row">
        {!isFramed && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            <Icon name="print" size={16} />
            {t("common.print")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            setState((s) => ({
              ...s,
              playbook: Object.fromEntries(Object.entries(s.playbook).filter(([k]) => !k.startsWith(`${pb.id}:`))),
            }))
          }
        >
          <Icon name="refresh" size={16} />
          {t("em.reset")}
        </button>
      </div>
    </div>
  );
}
