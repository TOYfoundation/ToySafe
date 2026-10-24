import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { estimate } from "../lib/passphrase";
import { looksLikePhrase } from "../lib/scam";
import type { Npc, Step } from "./types";
import { NpcPortrait } from "./NpcPortrait";

export interface StepProps<S extends Step = Step> {
  step: S;
  onSolved: (mistakes: number) => void;
  showHint: boolean; // class bonus: hint is visible from the start
  extraSeconds: number; // class bonus for timed steps
  npcs: Map<string, Npc>;
}

/** Deterministic shuffle so a step looks the same after a re-render, but never in solution order. */
function shuffled<T>(xs: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 0xffffffff);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((x, i) => x === xs[i])) out.push(out.shift()!);
  return out;
}

function Frame({
  prompt,
  hint,
  showHint,
  children,
  explain,
  solved,
  onNext,
  check,
  canCheck = true,
  message,
}: {
  prompt: string;
  hint?: string;
  showHint: boolean;
  children: ReactNode;
  explain?: string;
  solved: boolean;
  onNext: () => void;
  check?: () => void;
  canCheck?: boolean;
  message?: { tone: "bad" | "ok"; text: string } | null;
}) {
  const t = useT();
  const [hintOpen, setHintOpen] = useState(showHint);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (solved) nextRef.current?.focus();
  }, [solved]);
  return (
    <div className={`step ${solved ? "is-solved" : ""}`}>
      <p className="step-prompt">{prompt}</p>
      {children}
      {message && !solved && (
        <p className={`step-msg msg-${message.tone}`} role="status">
          {message.text}
        </p>
      )}
      {hint && !solved && (
        <div className="hint">
          {hintOpen ? (
            <p>
              <Icon name="hint" size={16} />
              {showHint && <strong>{t("game.classHint")} </strong>}
              {hint}
            </p>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHintOpen(true)}>
              <Icon name="hint" size={16} />
              {t("game.hint")}
            </button>
          )}
        </div>
      )}
      {solved ? (
        <div className="step-done" role="status">
          <p className="step-ok">
            <Icon name="check" size={18} />
            {t("game.solved")}
          </p>
          {explain && <p className="explain">{explain}</p>}
          <button ref={nextRef} type="button" className="btn btn-primary" onClick={onNext}>
            {t("game.next")}
          </button>
        </div>
      ) : (
        check && (
          <button type="button" className="btn btn-primary" onClick={check} disabled={!canCheck}>
            {t("game.check")}
          </button>
        )
      )}
    </div>
  );
}

function useSolve(onSolved: (m: number) => void) {
  const [mistakes, setMistakes] = useState(0);
  const [solved, setSolved] = useState(false);
  return {
    mistakes,
    solved,
    miss: () => setMistakes((m) => m + 1),
    win: () => setSolved(true),
    next: () => onSolved(mistakes),
  };
}

export function DialogStep({ step, onSolved, npcs }: StepProps<Extract<Step, { type: "dialog" }>>) {
  const t = useT();
  return (
    <div className="step">
      {step.lines.map((l, i) => (
        <Speech key={i} npc={npcs.get(l.npc)} text={l.text} />
      ))}
      <button type="button" className="btn btn-primary" onClick={() => onSolved(0)}>
        {t("game.next")}
      </button>
    </div>
  );
}

export function Speech({ npc, text }: { npc?: Npc; text: string }) {
  return (
    <div className="speech">
      <NpcPortrait npc={npc} size={48} />
      <div className="speech-bubble">
        {npc && <strong>{npc.name}</strong>}
        <p>{text}</p>
      </div>
    </div>
  );
}

export function ChoiceStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "choice" }>>) {
  const s = useSolve(onSolved);
  const [picked, setPicked] = useState<number[]>([]);
  const last = picked[picked.length - 1];
  const opts = useMemo(() => shuffled(step.options.map((o, i) => ({ ...o, i })), step.prompt), [step]);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      message={last != null && !step.options[last].correct ? { tone: "bad", text: step.options[last].feedback ?? step.options[last].why ?? "" } : null}>
      <ul className="opts">
        {opts.map((o) => {
          const state = picked.includes(o.i) ? (o.correct ? "right" : "wrong") : "";
          return (
            <li key={o.i}>
              <button
                type="button"
                className={`opt ${state}`}
                disabled={s.solved || picked.includes(o.i)}
                onClick={() => {
                  setPicked((p) => [...p, o.i]);
                  if (o.correct) s.win();
                  else s.miss();
                }}
              >
                {o.text}
              </button>
              {state === "right" && o.feedback && <p className="opt-fb">{o.feedback}</p>}
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

export function MultiStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "multi" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState(false);
  const wrong = step.options.map((o, i) => sel.has(i) !== o.correct);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      check={() => {
        setChecked(true);
        if (wrong.some(Boolean)) s.miss();
        else s.win();
      }}
      message={checked && wrong.some(Boolean) ? { tone: "bad", text: t("game.multiWrong", { n: wrong.filter(Boolean).length }) } : null}>
      <ul className="opts">
        {step.options.map((o, i) => (
          <li key={i}>
            <label className={`opt opt-check ${checked && sel.has(i) && !o.correct ? "wrong" : ""} ${s.solved && o.correct ? "right" : ""}`}>
              <input
                type="checkbox"
                checked={sel.has(i)}
                disabled={s.solved}
                onChange={() => {
                  setChecked(false);
                  setSel((x) => {
                    const n = new Set(x);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  });
                }}
              />
              <span className="check-box" aria-hidden="true" />
              <span>{o.text}</span>
            </label>
            {checked && sel.has(i) && !o.correct && o.why && <p className="opt-fb bad">{o.why}</p>}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function ClassifyStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "classify" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [ans, setAns] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const wrong = step.items.map((it, i) => ans[i] !== it.answer);
  const all = Object.keys(ans).length === step.items.length;
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next} canCheck={all}
      check={() => {
        setChecked(true);
        if (wrong.some(Boolean)) s.miss();
        else s.win();
      }}
      message={checked && wrong.some(Boolean) ? { tone: "bad", text: t("game.classifyWrong", { n: wrong.filter(Boolean).length }) } : null}>
      <ul className="classify">
        {step.items.map((it, i) => (
          <li key={i} className={checked && wrong[i] ? "wrong" : s.solved ? "right" : ""}>
            <span className="classify-text">{it.text}</span>
            <div className="seg seg-sm" role="radiogroup" aria-label={it.text}>
              {step.buckets.map((b) => (
                <button key={b.id} type="button" role="radio" aria-checked={ans[i] === b.id} className={ans[i] === b.id ? "is-on" : ""} disabled={s.solved}
                  onClick={() => (setChecked(false), setAns((a) => ({ ...a, [i]: b.id })))}>
                  {b.label}
                </button>
              ))}
            </div>
            {(s.solved || (checked && wrong[i])) && it.why && <p className="opt-fb">{it.why}</p>}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function OrderStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "order" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [order, setOrder] = useState(() => shuffled(step.items.map((_, i) => i), step.prompt));
  const [checked, setChecked] = useState(false);
  const move = (pos: number, d: number) =>
    setOrder((o) => {
      const n = [...o];
      const j = pos + d;
      if (j < 0 || j >= n.length) return o;
      [n[pos], n[j]] = [n[j], n[pos]];
      return n;
    });
  const ok = order.every((v, i) => v === i);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      check={() => {
        setChecked(true);
        if (ok) s.win();
        else s.miss();
      }}
      message={checked && !ok ? { tone: "bad", text: t("game.orderWrong", { n: order.filter((v, i) => v === i).length, total: order.length }) } : null}>
      <ol className="order">
        {order.map((v, pos) => (
          <li key={v} className={s.solved ? "right" : ""}>
            <span className="order-n">{pos + 1}</span>
            <span className="order-text">{step.items[v].text}</span>
            {!s.solved && (
              <span className="order-btns">
                <button type="button" className="icon-btn" aria-label={t("game.up")} disabled={pos === 0} onClick={() => (setChecked(false), move(pos, -1))}>
                  <Icon name="arrow" size={16} className="rot-up" />
                </button>
                <button type="button" className="icon-btn" aria-label={t("game.down")} disabled={pos === order.length - 1} onClick={() => (setChecked(false), move(pos, 1))}>
                  <Icon name="arrow" size={16} className="rot-down" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export function ToggleStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "toggle" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [state, setState] = useState(() => step.items.map((i) => i.initial));
  const [checked, setChecked] = useState(false);
  const wrong = step.items.map((it, i) => state[i] !== it.target);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      check={() => {
        setChecked(true);
        if (wrong.some(Boolean)) s.miss();
        else s.win();
      }}
      message={checked && wrong.some(Boolean) ? { tone: "bad", text: t("game.toggleWrong", { n: wrong.filter(Boolean).length }) } : null}>
      <ul className="toggles">
        {step.items.map((it, i) => (
          <li key={i} className={checked && wrong[i] ? "wrong" : ""}>
            <span>{it.label}</span>
            <button type="button" role="switch" aria-checked={state[i]} className={`switch ${state[i] ? "on" : ""}`} disabled={s.solved}
              onClick={() => (setChecked(false), setState((xs) => xs.map((x, j) => (j === i ? !x : x))))}>
              <span className="switch-knob" aria-hidden="true" />
              <span className="switch-label">{state[i] ? step.on_label : step.off_label}</span>
            </button>
            {(s.solved || (checked && wrong[i])) && it.why && <p className="opt-fb">{it.why}</p>}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function PassphraseStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "passphrase" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [p, setP] = useState("");
  const est = estimate(p);
  const alarm = looksLikePhrase(p);
  const pct = Math.min(100, (est.bits / step.min_bits) * 100);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      canCheck={!alarm && p.length > 0}
      check={() => (est.bits >= step.min_bits && !alarm ? s.win() : s.miss())}
      message={alarm ? { tone: "bad", text: t("identity.phraseAlarmText") } : est.bits < step.min_bits && p ? { tone: "bad", text: t("game.bridgeWeak", { bits: est.bits, need: step.min_bits }) } : null}>
      <p className="warn-line">
        <Icon name="lock" size={16} />
        {t("game.practiceOnly")}
      </p>
      <input className="pass-input" value={p} onChange={(e) => setP(e.target.value)} disabled={s.solved} autoComplete="off" spellCheck={false} aria-label={step.prompt} />
      <div className="bridge-meter" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={pct >= ((i + 1) / 12) * 100 ? "on" : ""} />
        ))}
      </div>
      <p className="muted">{t("game.bits", { bits: est.bits, need: step.min_bits })}</p>
    </Frame>
  );
}

export function FindStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "find" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState(false);
  const ok = step.lines.every((l, i) => sel.has(i) === l.suspicious);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next} canCheck={sel.size === step.need}
      check={() => (setChecked(true), ok ? s.win() : s.miss())}
      message={checked && !ok ? { tone: "bad", text: t("game.findWrong") } : { tone: "ok", text: t("game.findCount", { n: sel.size, need: step.need }) }}>
      <ol className="logscroll">
        {step.lines.map((l, i) => (
          <li key={i}>
            <button type="button" aria-pressed={sel.has(i)} disabled={s.solved}
              className={`logline ${sel.has(i) ? "is-on" : ""} ${s.solved && l.suspicious ? "right" : ""} ${checked && sel.has(i) && !l.suspicious ? "wrong" : ""}`}
              onClick={() => (setChecked(false), setSel((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n; }))}>
              {l.text}
            </button>
            {s.solved && l.suspicious && l.why && <p className="opt-fb">{l.why}</p>}
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export function MatchStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "match" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const right = useMemo(() => shuffled(step.right, step.prompt), [step]);
  const wrong = step.left.filter((l) => ans[l.id] !== step.solution[l.id]).length;
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next} canCheck={Object.keys(ans).length === step.left.length}
      check={() => (setChecked(true), wrong ? s.miss() : s.win())}
      message={checked && wrong ? { tone: "bad", text: t("game.matchWrong", { n: wrong }) } : null}>
      <ul className="match">
        {step.left.map((l) => (
          <li key={l.id} className={checked && ans[l.id] !== step.solution[l.id] ? "wrong" : s.solved ? "right" : ""}>
            <label>
              <span>{l.text}</span>
              <select value={ans[l.id] ?? ""} disabled={s.solved} onChange={(e) => (setChecked(false), setAns((a) => ({ ...a, [l.id]: e.target.value })))}>
                <option value="" disabled>
                  {t("game.choose")}
                </option>
                {right.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function ChatStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "chat" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [turn, setTurn] = useState(0);
  const [log, setLog] = useState<{ me: boolean; text: string }[]>([{ me: false, text: step.turns[0].them }]);
  const [fb, setFb] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [log, typing]);

  const answer = (o: { text: string; correct: boolean; feedback?: string }) => {
    if (!o.correct) {
      setFb(o.feedback ?? "");
      s.miss();
      return;
    }
    setFb(null);
    setLog((l) => [...l, { me: true, text: o.text }]);
    const next = turn + 1;
    if (next >= step.turns.length) {
      s.win();
      return;
    }
    setTyping(true);
    const reduced = document.documentElement.dataset.motion === "reduced";
    setTimeout(() => {
      setTyping(false);
      setTurn(next);
      setLog((l) => [...l, { me: false, text: step.turns[next].them }]);
    }, reduced ? 0 : 900);
  };

  const opts = useMemo(() => shuffled(step.turns[turn].options, `${step.prompt}${turn}`), [step, turn]);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      message={fb ? { tone: "bad", text: fb } : null}>
      <div className="chat" aria-live="polite">
        <div className="chat-head">
          <span className="chat-avatar" aria-hidden="true">{step.contact.name.slice(0, 1)}</span>
          <strong>{step.contact.name}</strong>
          {step.contact.badge && <span className="chat-badge">{step.contact.badge}</span>}
        </div>
        <div className="chat-body">
          {log.map((m, i) => (
            <p key={i} className={`bubble ${m.me ? "me" : "them"}`}>
              {m.text}
            </p>
          ))}
          {typing && <p className="bubble them typing" aria-label={t("game.typing")}><span /><span /><span /></p>}
          <div ref={endRef} />
        </div>
      </div>
      {!s.solved && !typing && (
        <ul className="opts">
          {opts.map((o, i) => (
            <li key={`${turn}-${i}`}>
              <button type="button" className="opt" onClick={() => answer(o)}>
                {o.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

export function TimedStep({ step, onSolved, showHint, extraSeconds }: StepProps<Extract<Step, { type: "timed" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const total = step.seconds + extraSeconds;
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(total);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const items = useMemo(() => shuffled(step.items, step.prompt), [step]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => (l <= 1 ? (clearInterval(id), 0) : l - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && (left === 0 || idx >= items.length)) {
      setRunning(false);
      setOver(true);
      if (score >= step.pass) s.win();
      else s.miss();
    }
  }, [left, idx, running, items.length, score, step.pass, s]);

  const start = () => {
    setLeft(total);
    setIdx(0);
    setScore(0);
    setMisses([]);
    setOver(false);
    setRunning(true);
  };

  const pick = (b: string) => {
    const it = items[idx];
    if (it.answer === b) setScore((x) => x + 1);
    else setMisses((m) => [...m, `${it.text}: ${it.why ?? ""}`]);
    setIdx((i) => i + 1);
  };

  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      message={over && !s.solved ? { tone: "bad", text: t("game.timedFail", { n: score, need: step.pass }) } : null}>
      {!running && !s.solved && (
        <button type="button" className="btn btn-brass" onClick={start}>
          <Icon name="timer" size={18} />
          {over ? t("game.again") : t("game.timedStart", { s: total })}
        </button>
      )}
      {running && idx < items.length && (
        <div className="timed">
          <div className="timed-bar" style={{ ["--p" as string]: `${(left / total) * 100}%` }}>
            <span>{t("game.secondsLeft", { s: left })}</span>
            <span>{t("game.timedScore", { n: score, need: step.pass })}</span>
          </div>
          <p className="timed-card" key={idx}>{items[idx].text}</p>
          <div className="timed-buckets">
            {step.buckets.map((b) => (
              <button key={b.id} type="button" className="btn btn-ghost" onClick={() => pick(b.id)}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {over && misses.length > 0 && (
        <ul className="bullets misses">
          {misses.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

export function ConsensusStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "consensus" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [convinced, setConvinced] = useState<Set<number>>(new Set());
  const [fb, setFb] = useState<Record<number, string>>({});
  const yes = step.members.filter((m, i) => m.stance === "yes" || convinced.has(i)).length;
  const need = Math.ceil(step.members.length * step.threshold - 0.01); // 2/3 of 6 = 4
  const open = yes >= need;
  useEffect(() => {
    if (open && !s.solved) s.win();
  }, [open, s]);

  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}>
      <div className="proposal">
        <Icon name="lock" size={18} />
        <p>{step.proposal}</p>
      </div>
      <div className={`gate ${open ? "is-open" : ""}`} role="status" aria-live="polite">
        <div className="gate-seals">
          {step.members.map((m, i) => (
            <span key={i} className={`seal ${m.stance === "yes" || convinced.has(i) ? "on" : ""}`} title={m.name} />
          ))}
        </div>
        <span>{t("game.gate", { n: yes, need, total: step.members.length })}</span>
      </div>
      <ul className="council">
        {step.members.map((m, i) => {
          const isYes = m.stance === "yes" || convinced.has(i);
          return (
            <li key={i} className={isYes ? "is-yes" : "is-open"}>
              <div className="council-head">
                <strong>{m.name}</strong>
                <small>{m.role}</small>
                <span className={`stance st-${isYes ? "ok" : m.stance === "no" ? "bad" : "warn"}`}>{t(`game.stance.${isYes ? "yes" : m.stance}`)}</span>
              </div>
              {!isYes && m.concern && (
                <>
                  <p className="concern">„{m.concern}“</p>
                  <ul className="opts">
                    {(m.options ?? []).map((o, j) => (
                      <li key={j}>
                        <button type="button" className="opt" disabled={s.solved}
                          onClick={() => {
                            if (o.correct) {
                              setConvinced((c) => new Set(c).add(i));
                              setFb((f) => ({ ...f, [i]: "" }));
                            } else {
                              s.miss();
                              setFb((f) => ({ ...f, [i]: o.feedback ?? "" }));
                            }
                          }}>
                          {o.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {fb[i] && <p className="opt-fb bad">{fb[i]}</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

export function CompareStep({ step, onSolved, showHint }: StepProps<Extract<Step, { type: "compare" }>>) {
  const t = useT();
  const s = useSolve(onSolved);
  const [ans, setAns] = useState<Record<number, boolean>>({});
  const [checked, setChecked] = useState(false);
  const wrong = step.pairs.map((p, i) => ans[i] !== p.same);
  return (
    <Frame prompt={step.prompt} hint={step.hint} showHint={showHint} explain={step.explain} solved={s.solved} onNext={s.next}
      canCheck={Object.keys(ans).length === step.pairs.length}
      check={() => (setChecked(true), wrong.some(Boolean) ? s.miss() : s.win())}
      message={checked && wrong.some(Boolean) ? { tone: "bad", text: t("game.compareWrong", { n: wrong.filter(Boolean).length }) } : null}>
      <ul className="pairs">
        {step.pairs.map((p, i) => (
          <li key={i} className={checked && wrong[i] ? "wrong" : s.solved ? "right" : ""}>
            <div className="pair-lines">
              <span className="pair-label">{step.label_a}</span>
              <code>{s.solved ? <Diff a={p.a} b={p.b} /> : p.a}</code>
              <span className="pair-label">{step.label_b}</span>
              <code>{s.solved ? <Diff a={p.b} b={p.a} /> : p.b}</code>
            </div>
            <div className="seg seg-sm" role="radiogroup" aria-label={t("game.pair", { n: i + 1 })}>
              {[true, false].map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={ans[i] === v} className={ans[i] === v ? "is-on" : ""} disabled={s.solved}
                  onClick={() => (setChecked(false), setAns((a) => ({ ...a, [i]: v })))}>
                  {v ? t("game.same") : t("game.different")}
                </button>
              ))}
            </div>
            {(s.solved || (checked && wrong[i])) && p.why && <p className="opt-fb">{p.why}</p>}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Diff({ a, b }: { a: string; b: string }) {
  return (
    <>
      {[...a].map((c, i) => (
        <span key={i} className={c !== b[i] ? "d" : ""}>
          {c}
        </span>
      ))}
    </>
  );
}

export function StepView(props: StepProps) {
  const { step } = props;
  switch (step.type) {
    case "dialog": return <DialogStep {...props} step={step} />;
    case "choice": return <ChoiceStep {...props} step={step} />;
    case "multi": return <MultiStep {...props} step={step} />;
    case "classify": return <ClassifyStep {...props} step={step} />;
    case "order": return <OrderStep {...props} step={step} />;
    case "toggle": return <ToggleStep {...props} step={step} />;
    case "passphrase": return <PassphraseStep {...props} step={step} />;
    case "find": return <FindStep {...props} step={step} />;
    case "match": return <MatchStep {...props} step={step} />;
    case "chat": return <ChatStep {...props} step={step} />;
    case "timed": return <TimedStep {...props} step={step} />;
    case "consensus": return <ConsensusStep {...props} step={step} />;
    case "compare": return <CompareStep {...props} step={step} />;
  }
}
