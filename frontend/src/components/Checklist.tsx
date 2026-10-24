import checklists from "@content/checklists.json";
import { setState, toggleMap, useStore } from "../lib/store";
import { useT } from "../i18n";
import { Meter, Panel } from "./ui";

interface Item {
  id: string;
  level: string;
  text: string;
  why: string;
}
interface List {
  id: string;
  station: string;
  title: string;
  items: Item[];
}

export const ALL_LISTS = checklists.checklists as List[];
const LEVELS = checklists.levels as Record<string, string>;

export function listProgress(list: List, done: Record<string, boolean>) {
  const n = list.items.filter((i) => done[i.id]).length;
  return { n, total: list.items.length };
}

export function Checklist({ id }: { id: string }) {
  const t = useT();
  const done = useStore((s) => s.checklist);
  const list = ALL_LISTS.find((l) => l.id === id);
  if (!list) return null;
  const { n, total } = listProgress(list, done);
  const complete = n === total;

  const markRealWorld = () =>
    setState((s) =>
      s.game.realWorld.includes(list.id) ? s : { ...s, game: { ...s.game, realWorld: [...s.game.realWorld, list.id] } },
    );

  return (
    <Panel title={list.title} icon="check" className="checklist">
      <div className="checklist-progress">
        <Meter value={n} max={total} label={t("check.progress", { n, total })} tone={complete ? "ok" : undefined} />
        <span>{t("check.progress", { n, total })}</span>
      </div>
      <ul className="checklist-items">
        {list.items.map((item) => (
          <li key={item.id} className={done[item.id] ? "is-done" : ""}>
            <label>
              <input type="checkbox" checked={!!done[item.id]} onChange={() => toggleMap("checklist", item.id)} />
              <span className="check-box" aria-hidden="true" />
              <span className="check-text">
                <span>{item.text}</span>
                <small>{item.why}</small>
              </span>
              <span className={`lvl lvl-${item.level}`}>{LEVELS[item.level]}</span>
            </label>
          </li>
        ))}
      </ul>
      {complete && (
        <div className="checklist-done">
          <p>{t("check.complete")}</p>
          <button type="button" className="btn btn-brass btn-sm" onClick={markRealWorld}>
            {t("check.toGame")}
          </button>
        </div>
      )}
    </Panel>
  );
}
