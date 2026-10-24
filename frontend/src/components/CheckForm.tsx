import { useState } from "react";
import { useT } from "../i18n";
import type { CheckResult } from "../lib/api";
import { useEngine } from "../lib/engine";
import { go } from "../lib/router";
import { Icon } from "./Icon";

/** Small form for live engine quick checks (headers, mail DNS). Needs the user's own engine. */
export function CheckForm({
  label,
  placeholder,
  run,
}: {
  label: string;
  placeholder: string;
  run: (value: string) => Promise<{ results: CheckResult[] }>;
}) {
  const t = useT();
  const { live } = useEngine();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!live)
    return (
      <div className="needs-engine">
        <p className="muted">{t("engine.needed")}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("settings")}>
          {t("engine.connect")}
        </button>
      </div>
    );

  return (
    <form
      className="check-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          setResults((await run(value.trim())).results);
        } catch (err) {
          setError((err as Error).message);
          setResults(null);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>{label}</span>
        <div className="input-row">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required />
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? t("common.checking") : t("common.check")}
          </button>
        </div>
        <small>{t("engine.ownOnly")}</small>
      </label>
      {error && <p className="problems" role="alert">{error}</p>}
      {results && (
        <ul className="result-list">
          {results.map((r, i) => (
            <li key={`${r.id}-${i}`} className={r.ok ? "ok" : `bad sev-${r.severity}`}>
              <Icon name={r.ok ? "check" : "emergency"} size={16} />
              <div>
                <strong>{r.title}</strong>
                {r.detail && <p className="muted">{r.detail}</p>}
                {r.fix && <p>{r.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
