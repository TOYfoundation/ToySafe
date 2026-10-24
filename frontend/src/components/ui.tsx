import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Asset, Finding, Severity } from "../lib/types";
import { useT } from "../i18n";
import { useEngine } from "../lib/engine";
import { toggleMap } from "../lib/store";
import { Icon } from "./Icon";

export function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
  tone,
}: {
  title?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "brass" | "alert" | "shield";
}) {
  const id = useId();
  return (
    <section className={`panel ${tone ? `panel-${tone}` : ""} ${className}`} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <header className="panel-head">
          {title && (
            <h2 id={id} className="panel-title">
              {icon && <Icon name={icon} size={18} />}
              {title}
            </h2>
          )}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StationHeader({ icon, title, lead, children }: { icon: string; title: string; lead: string; children?: ReactNode }) {
  return (
    <header className="station-head">
      <div className="station-glyph" aria-hidden="true">
        <Icon name={icon} size={30} />
      </div>
      <div className="station-titles">
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      {children && <div className="station-head-actions">{children}</div>}
    </header>
  );
}

export function SevBadge({ severity }: { severity: Severity }) {
  const t = useT();
  return <span className={`sev sev-${severity}`}>{t(`sev.${severity}`)}</span>;
}

export function FindingItem({ finding, asset, defaultOpen = false }: { finding: Finding; asset?: Asset; defaultOpen?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const { rawJob } = useEngine();
  return (
    <li className={`finding sevline-${finding.severity} ${open ? "is-open" : ""}`}>
      <button type="button" className="finding-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <SevBadge severity={finding.severity} />
        <span className="finding-title">{finding.title}</span>
        {finding.is_actively_exploited && <span className="kev">{t("finding.kev")}</span>}
        <span className="finding-asset">{asset?.name ?? finding.asset_id}</span>
      </button>
      <div id={bodyId} className="finding-body" hidden={!open}>
        <p>{finding.description}</p>
        {finding.recommendation && (
          <div className="finding-fix">
            <strong>{t("finding.fix")}</strong>
            <p>{finding.recommendation}</p>
          </div>
        )}
        <dl className="finding-meta">
          <div>
            <dt>{t("finding.source")}</dt>
            <dd>{finding.source_plugin}</dd>
          </div>
          {finding.cvss_score != null && (
            <div>
              <dt>CVSS</dt>
              <dd>{finding.cvss_score.toFixed(1)}</dd>
            </div>
          )}
          {finding.cve_ids.length > 0 && (
            <div>
              <dt>{t("finding.ids")}</dt>
              <dd>{finding.cve_ids.join(", ")}</dd>
            </div>
          )}
          {asset?.externally_reachable && (
            <div>
              <dt>{t("finding.exposure")}</dt>
              <dd>{t("finding.external")}</dd>
            </div>
          )}
        </dl>
        <div className="btn-row">
          {finding.reference_url && (
            <a href={finding.reference_url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost btn-sm">
              {t("finding.more")}
            </a>
          )}
          {rawJob?.status === "done" && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => toggleMap("resolved", `${rawJob.id}:${finding.id}`, true)}>
              <Icon name="check" size={16} />
              {t("finding.resolve")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function Empty({ icon = "star", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function Meter({ value, max = 100, label, tone }: { value: number; max?: number; label: string; tone?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`meter ${tone ? `meter-${tone}` : ""}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} onCancel={(e) => (e.preventDefault(), onClose())} aria-label={title}>
      <header className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={16} />
      {done ? t("common.copied") : (label ?? t("common.copy"))}
    </button>
  );
}

export function DemoNote() {
  const t = useT();
  return <p className="demo-note">{t("common.demoNote")}</p>;
}
