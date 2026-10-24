import levelData from "@content/level7/missions.json";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { Panel } from "../components/ui";
import { useT } from "../i18n";
import { go } from "../lib/router";
import { resetGame, setState, useStore } from "../lib/store";
import { MissionPlayer } from "./MissionPlayer";
import { NpcPortrait } from "./NpcPortrait";
import type { Level, Mission } from "./types";

const level = levelData as unknown as Level;
const BOSS_NEEDS = 10;

function Skyline() {
  // Simple silhouette of domes and minarets: Baghdad below the star ship.
  return (
    <svg className="skyline" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 120V96h40v-8h18v8h30V70c0-14 18-24 30-30 12 6 30 16 30 30v26h26V40l6-12 6 12v56h40V82c0-20 26-34 40-40 14 6 40 20 40 40v14h34V88h20v8h40V60c0-26 34-44 52-50 18 6 52 24 52 50v36h28V34l6-14 6 14v62h36V80c0-12 14-20 24-24 10 4 24 12 24 24v16h44V90h22v6h34V66c0-16 22-28 34-32 12 4 34 16 34 32v30h30V46l6-12 6 12v50h50V84c0-10 12-16 20-20 8 4 20 10 20 20v12h40v24z" />
    </svg>
  );
}

export function Academy({ arg }: { arg: string | null }) {
  const t = useT();
  const game = useStore((s) => s.game);
  const [confirmReset, setConfirmReset] = useState(false);
  const missions = level.missions;
  const doneCount = missions.filter((m) => game.completed[m.id]).length;
  const npcs = new Map(level.npcs.map((n) => [n.id, n]));
  const locs = new Map(level.locations.map((l) => [l.id, l]));
  const active = missions.find((m) => m.id === arg);

  const unlocked = (m: Mission, i: number) => (m.boss ? doneCount >= BOSS_NEEDS : i <= doneCount + 2 || !!game.completed[m.id]);

  if (active) return <MissionPlayer key={active.id} level={level} mission={active} onClose={() => go("academy")} />;

  // Each mission gets a star position: its location, nudged so several missions at one place don't overlap.
  const perLoc: Record<string, number> = {};
  const pos = missions.map((m) => {
    const l = locs.get(m.location);
    const k = (perLoc[m.location] = (perLoc[m.location] ?? -1) + 1);
    return { x: (l?.x ?? 50) + k * 4.5, y: (l?.y ?? 40) + k * 6 };
  });
  const allDone = doneCount === missions.length;
  const doneIdx = missions.map((m, i) => (game.completed[m.id] ? i : -1)).filter((i) => i >= 0);
  const nextOpen = missions.findIndex((m, i) => !game.completed[m.id] && unlocked(m, i));
  const trail = [{ x: 50, y: 14 }, ...doneIdx.map((i) => pos[i]), ...(nextOpen >= 0 ? [pos[nextOpen]] : [])];

  return (
    <div className="station academy">
      <header className="academy-head">
        <p className="academy-kicker">{t("game.kicker", { game: level.game, n: level.level })}</p>
        <h1>{level.title}</h1>
        <p className="academy-sub">{level.subtitle}</p>
      </header>

      <div className="starmap" role="group" aria-label={t("game.map")}>
        <svg className="starmap-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {/* The course you have flown: completed missions in order, then a dashed line to the next open one. */}
          {trail.slice(1).map((p, i) => (
            <line key={i} x1={trail[i].x} y1={trail[i].y} x2={p.x} y2={p.y} className={i < trail.length - 2 || !nextOpen ? "on" : ""} />
          ))}
        </svg>
        <div className="starship" aria-hidden="true">
          <svg viewBox="0 0 200 60">
            <ellipse cx="100" cy="34" rx="92" ry="12" className="ship-ring" />
            <path d="M60 34c0-14 18-24 40-24s40 10 40 24z" className="ship-dome" />
            <ellipse cx="100" cy="34" rx="56" ry="7" className="ship-deck" />
          </svg>
        </div>
        {missions.map((m, i) => {
          const open = unlocked(m, i);
          const done = game.completed[m.id];
          return (
            <button
              key={m.id}
              type="button"
              className={`star-node ${done ? "is-done" : ""} ${open ? "" : "is-locked"} ${m.boss ? "is-boss" : ""} ${m.team ? "is-team" : ""}`}
              style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
              disabled={!open}
              onClick={() => go("academy", m.id)}
              aria-label={`${i + 1}. ${m.title}${done ? `, ${t("game.stars", { n: done.stars })}` : ""}${open ? "" : `, ${t("game.locked")}`}`}
            >
              <span className="star-dot" />
              <span className="star-label">{i + 1}</span>
            </button>
          );
        })}
        <Skyline />
      </div>

      <div className="academy-grid">
        <Panel title={t("game.story")} icon="academy" className="story">
          {level.story.map((p, i) => (
            <p key={i} className="tale">{p}</p>
          ))}
          <p className="fineprint">{level.note}</p>
        </Panel>

        <Panel title={t("game.you")} icon="star" tone="brass">
          <dl className="kv">
            <div><dt>{t("game.missionsDone")}</dt><dd>{doneCount} / {missions.length}</dd></div>
            <div><dt>{t("game.dukaten")}</dt><dd>{game.dukaten}</dd></div>
            <div><dt>{t("game.seals")}</dt><dd>{game.seals.length}</dd></div>
            <div><dt>{t("game.realSeals")}</dt><dd>{game.realWorld.length}</dd></div>
          </dl>
          {allDone && <p className="meisterbrief">{t("game.master", { reward: level.rewards.level })}</p>}
          <p className="fineprint">{level.rewards.rule}</p>
          {confirmReset ? (
            <div className="btn-row">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => (resetGame(), setConfirmReset(false))}>{t("game.resetConfirm")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>{t("common.cancel")}</button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>{t("game.reset")}</button>
          )}
        </Panel>
      </div>

      <Panel title={t("game.class")} icon="users">
        <p className="muted">{t("game.classLead")}</p>
        <ul className="classes">
          {Object.entries(level.classes).map(([name, desc]) => (
            <li key={name}>
              <button type="button" aria-pressed={game.playerClass === name} className={`class-card ${game.playerClass === name ? "is-on" : ""}`}
                onClick={() => setState((s) => ({ ...s, game: { ...s.game, playerClass: name } }))}>
                <strong>{name}</strong>
                <span>{desc}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t("game.missions")} icon="academy">
        <ol className="mission-list">
          {missions.map((m, i) => {
            const open = unlocked(m, i);
            const done = game.completed[m.id];
            return (
              <li key={m.id} className={`${done ? "is-done" : ""} ${open ? "" : "is-locked"}`}>
                <NpcPortrait npc={npcs.get(m.npc)} size={44} />
                <div className="ml-text">
                  <strong>{m.title}</strong>
                  <small>
                    {locs.get(m.location)?.name}, {t("game.players", { p: m.players })}, {m.skill}
                  </small>
                </div>
                <div className="ml-state">
                  {done ? (
                    <span className="mini-stars" aria-label={t("game.stars", { n: done.stars })}>
                      {"★".repeat(done.stars)}
                      <span className="dim">{"★".repeat(3 - done.stars)}</span>
                    </span>
                  ) : !open ? (
                    <span className="muted">{m.boss ? t("game.bossLocked", { n: BOSS_NEEDS }) : t("game.locked")}</span>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!open} onClick={() => go("academy", m.id)}>
                    <Icon name="play" size={14} />
                    {done ? t("game.replay") : t("game.play")}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="two-col">
        <Panel title={t("game.side")} icon="star">
          <ul className="side-quests">
            {level.side_quests.map((q) => (
              <li key={q.id}>
                <strong>{q.title}</strong>
                <p>{q.text}</p>
                <small>{t("game.sideReward", { r: q.reward })}</small>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("game.cast")} icon="users">
          <ul className="cast">
            {level.npcs.map((n) => (
              <li key={n.id}>
                <NpcPortrait npc={n} size={40} />
                <div>
                  <strong>{n.name}</strong>
                  <small>{n.role}</small>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
