import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { go, routeFromLink } from "../lib/router";
import { setState, useStore } from "../lib/store";
import { NpcPortrait } from "./NpcPortrait";
import { Speech, StepView } from "./steps";
import type { Level, Mission } from "./types";

type Phase = { kind: "intro"; line: number } | { kind: "step"; index: number } | { kind: "outro" } | { kind: "done" };

export function starsFor(mistakes: number) {
  return Math.max(1, 3 - mistakes);
}

export function MissionPlayer({ level, mission, onClose }: { level: Level; mission: Mission; onClose: () => void }) {
  const t = useT();
  const playerClass = useStore((s) => s.game.playerClass);
  const already = useStore((s) => s.game.completed[mission.id]);
  const npcs = new Map(level.npcs.map((n) => [n.id, n]));
  const loc = level.locations.find((l) => l.id === mission.location);
  const [phase, setPhase] = useState<Phase>({ kind: "intro", line: 0 });
  const [mistakes, setMistakes] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const bonus = playerClass === mission.class_bonus;

  useEffect(() => {
    topRef.current?.focus();
  }, [phase.kind, phase.kind === "step" ? phase.index : 0]);

  const finish = (total: number) => {
    const stars = starsFor(total);
    setState((s) => {
      const prev = s.game.completed[mission.id];
      const first = !prev;
      return {
        ...s,
        game: {
          ...s.game,
          completed: { ...s.game.completed, [mission.id]: { stars: Math.max(stars, prev?.stars ?? 0), at: new Date().toISOString() } },
          dukaten: s.game.dukaten + (first ? mission.reward.dukaten : 0),
          seals: first && !s.game.seals.includes(mission.reward.seal) ? [...s.game.seals, mission.reward.seal] : s.game.seals,
        },
      };
    });
  };

  const stepCount = mission.steps.length;
  const progress =
    phase.kind === "intro" ? 0 : phase.kind === "step" ? phase.index / stepCount : 1;
  const link = routeFromLink(mission.real_world.link);

  return (
    <div className="mission" role="region" aria-label={mission.title}>
      <header className="mission-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <Icon name="back" size={16} />
          {t("game.toMap")}
        </button>
        <div className="mission-title">
          <h1 ref={topRef} tabIndex={-1}>{mission.title}</h1>
          <p>
            {loc?.name}, {t("game.players", { p: mission.players })}, {t("game.minutes", { m: mission.minutes })}
          </p>
        </div>
        <div className="mission-progress" aria-label={t("game.progress")}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <div className="mission-meta">
        <span className="chip">{mission.rank}</span>
        <span className="chip">{t("game.skill")}: {mission.skill}</span>
        <span className={`chip ${bonus ? "chip-on" : ""}`}>{t("game.bonus")}: {mission.class_bonus}</span>
        {mission.boss && <span className="chip chip-alert">{t("game.boss")}</span>}
      </div>

      {mission.team && phase.kind !== "done" && (
        <div className="team">
          <Icon name="users" size={18} />
          <div>
            <p>{mission.team.rule}</p>
            <ul className="chips">
              {mission.team.roles.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <small>{t("game.teamSolo")}</small>
          </div>
        </div>
      )}

      <div className="mission-stage">
        {phase.kind === "intro" && (
          <div className="dialogue">
            {mission.intro.slice(0, phase.line + 1).map((l, i) => (
              <Speech key={i} npc={npcs.get(l.npc)} text={l.text} />
            ))}
            <button
              type="button"
              className="btn btn-primary"
              autoFocus
              onClick={() =>
                setPhase(phase.line + 1 < mission.intro.length ? { kind: "intro", line: phase.line + 1 } : { kind: "step", index: 0 })
              }
            >
              {phase.line + 1 < mission.intro.length ? t("game.continue") : t("game.begin")}
            </button>
          </div>
        )}

        {phase.kind === "step" && (
          <div className="stepwrap">
            <p className="step-count">{t("game.stepOf", { n: phase.index + 1, total: stepCount })}</p>
            <StepView
              key={`${mission.id}-${phase.index}`}
              step={mission.steps[phase.index]}
              npcs={npcs}
              showHint={bonus}
              extraSeconds={playerClass === "Wüstenblitz" ? 30 : 0}
              onSolved={(m) => {
                setMistakes((x) => x + m);
                setPhase(phase.index + 1 < stepCount ? { kind: "step", index: phase.index + 1 } : { kind: "outro" });
              }}
            />
          </div>
        )}

        {phase.kind === "outro" && (
          <div className="dialogue">
            {mission.outro.map((l, i) => (
              <Speech key={i} npc={npcs.get(l.npc)} text={l.text} />
            ))}
            <button type="button" className="btn btn-primary" autoFocus onClick={() => (finish(mistakes), setPhase({ kind: "done" }))}>
              {t("game.claim")}
            </button>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="reward">
            <NpcPortrait npc={npcs.get(mission.npc)} size={88} />
            <div className="stars" aria-label={t("game.stars", { n: starsFor(mistakes) })}>
              {[1, 2, 3].map((i) => (
                <span key={i} className={i <= starsFor(mistakes) ? "on" : ""} style={{ ["--i" as string]: i }}>
                  <Icon name="star" size={34} />
                </span>
              ))}
            </div>
            <h2>{mission.reward.seal}</h2>
            <p>{already ? t("game.replayed") : t("game.reward", { d: mission.reward.dukaten })}</p>
            <div className="realworld">
              <strong>{t("game.realWorld")}</strong>
              <p>{mission.real_world.text}</p>
              {link && (
                <button type="button" className="btn btn-brass btn-sm" onClick={() => go(link)}>
                  {t("game.openStation", { s: t(`station.${link}`) })}
                </button>
              )}
            </div>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t("game.toMap")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
