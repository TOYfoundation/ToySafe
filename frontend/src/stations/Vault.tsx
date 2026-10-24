import { useState } from "react";
import { Checklist } from "../components/Checklist";
import { Icon } from "../components/Icon";
import { Empty, FindingItem, Panel, StationHeader } from "../components/ui";
import { useT } from "../i18n";
import { checksumState, compareAddresses, toChecksum } from "../lib/address";
import { useEngine } from "../lib/engine";
import { normalizeHash, sha256File } from "../lib/hash";

function AddressCheck() {
  const t = useT();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const stA = a.trim() ? checksumState(a) : null;
  const cmp = a.trim() && b.trim() ? compareAddresses(a, b) : null;
  const body = a.trim().replace(/^0x/i, "");

  return (
    <Panel title={t("vault.addr")} icon="key" tone="shield">
      <p>{t("vault.addrLead")}</p>
      <label className="field">
        <span>{t("vault.addrA")}</span>
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder="0x…" spellCheck={false} className="mono-input" />
      </label>
      {stA && (
        <p className={`state-line st-${stA === "valid" ? "ok" : stA === "lowercase" ? "warn" : "bad"}`}>
          <Icon name={stA === "valid" ? "check" : "emergency"} size={16} />
          {t(`vault.cs.${stA}`)}
          {stA === "lowercase" && <code className="addr">{toChecksum(a.trim())}</code>}
        </p>
      )}
      <label className="field">
        <span>{t("vault.addrB")}</span>
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="0x…" spellCheck={false} className="mono-input" />
      </label>
      {cmp && (
        <div className={`compare ${cmp.same ? "is-same" : "is-diff"}`} role="status">
          <p className="addr-diff" aria-label={t("vault.diffAria")}>
            0x
            {[...body.toLowerCase()].map((c, i) => (
              <span key={i} className={cmp.diffs[i] ? "d" : ""}>
                {c}
              </span>
            ))}
          </p>
          <p>
            <strong>{cmp.same ? t("vault.same") : t("vault.diff", { n: cmp.diffs.filter(Boolean).length })}</strong>
          </p>
          {cmp.poisoning && <p className="alarm-inline">{t("vault.poisoning", { p: cmp.prefixMatch, s: cmp.suffixMatch })}</p>}
        </div>
      )}
      {a.trim() && b.trim() && !cmp && <p className="muted">{t("vault.needTwo")}</p>}
      <p className="fineprint">{t("vault.addrTip")}</p>
    </Panel>
  );
}

function DownloadCheck() {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);
  const exp = normalizeHash(expected);

  const pick = async (f: File | null) => {
    setFile(f);
    setHash("");
    if (!f) return;
    setBusy(true);
    try {
      setHash(await sha256File(f));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t("vault.dl")} icon="file" tone="brass">
      <p>{t("vault.dlLead")}</p>
      <label
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0] ?? null);
        }}
      >
        <input type="file" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <Icon name="file" size={26} />
        <span>{file ? file.name : t("vault.dlPick")}</span>
        <small>{t("vault.dlLocal")}</small>
      </label>
      {busy && <p className="muted">{t("common.checking")}</p>}
      {hash && (
        <p className="hash-out">
          <span>SHA-256</span>
          <code>{hash}</code>
        </p>
      )}
      <label className="field">
        <span>{t("vault.dlExpected")}</span>
        <input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder={t("vault.dlExpectedPh")} spellCheck={false} className="mono-input" />
      </label>
      {hash && exp && (
        <p className={`state-line st-${hash === exp ? "ok" : "bad"}`} role="status">
          <Icon name={hash === exp ? "check" : "emergency"} size={18} />
          <strong>{hash === exp ? t("vault.dlMatch") : t("vault.dlMismatch")}</strong>
        </p>
      )}
    </Panel>
  );
}

const FACTS = ["vault.fact.phrase", "vault.fact.onlyToy", "vault.fact.oldToken", "vault.fact.testnet", "vault.fact.fair", "vault.fact.accounts", "vault.fact.poker"];

export function Vault() {
  const t = useT();
  const { job } = useEngine();
  const findings = (job?.findings ?? []).filter((f) => f.station === "vault");
  const assets = new Map((job?.assets ?? []).map((a) => [a.id, a]));
  return (
    <div className="station">
      <StationHeader icon="vault" title={t("station.vault")} lead={t("vault.lead")} />
      <div className="two-col">
        <AddressCheck />
        <DownloadCheck />
      </div>
      <div className="two-col">
        <Panel title={t("vault.facts")} icon="shields">
          <ul className="facts">
            {FACTS.map((k) => (
              <li key={k}>
                <Icon name="check" size={16} />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t("vault.miner")} icon="operator">
          <p>{t("vault.minerText")}</p>
          {findings.length ? (
            <ul className="findings">
              {findings.map((f) => (
                <FindingItem key={f.id} finding={f} asset={assets.get(f.asset_id)} />
              ))}
            </ul>
          ) : (
            <Empty icon="vault" title={t("vault.noFindings")} />
          )}
        </Panel>
      </div>
      <Checklist id="wallet" />
    </div>
  );
}
