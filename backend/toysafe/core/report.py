"""Report-Generator (Logbuch): übersetzt eine priorisierte Finding-Liste in
einen lesbaren Bericht (Markdown, HTML, optional PDF) mit Erklärung und
Handlungsempfehlung pro Fund. Reine Aufbereitung - keine eigene Scan-Logik.

Alle Texte aus Tool-Ausgaben werden HTML-escaped: Dienst-Banner und
Template-Beschreibungen stammen von fremden Geräten und dürfen im Bericht
keinen Code ausführen.
"""
from __future__ import annotations

from collections import Counter
from html import escape
from urllib.parse import urlparse

from toysafe.core.models import Asset, Finding, Severity, utcnow
from toysafe.core.priority import sort_findings
from toysafe.core.score import shield_strength

_SEVERITY_ORDER = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO]
_SEVERITY_LABEL_DE = {
    Severity.CRITICAL: "Kritisch",
    Severity.HIGH: "Hoch",
    Severity.MEDIUM: "Mittel",
    Severity.LOW: "Niedrig",
    Severity.INFO: "Info",
}
_SEVERITY_ICON = {
    Severity.CRITICAL: "🔴",
    Severity.HIGH: "🟠",
    Severity.MEDIUM: "🟡",
    Severity.LOW: "🔵",
    Severity.INFO: "⚪",
}


def _safe_url(url: str | None) -> str | None:
    if not url:
        return None
    return url if urlparse(url).scheme in ("http", "https") else None


class ReportGenerator:
    def __init__(self, findings: list[Finding], assets: list[Asset]) -> None:
        self._assets = assets
        self._assets_by_id = {a.id: a for a in assets}
        self._findings = sort_findings(findings, self._assets_by_id)
        self._score = shield_strength(self._findings, assets)

    # -- öffentliche API ------------------------------------------------

    def to_markdown(self) -> str:
        lines = [
            "# ToySafe-Logbuch: Sicherheitsbericht",
            f"Erstellt: {utcnow():%Y-%m-%d %H:%M} UTC",
            "",
            f"**Schildstärke: {self._score['score']} / 100** – {self._score['label']}",
            "",
            self._summary_markdown(),
            "",
            "## Priorisierte Findings",
            "",
        ]
        for finding in self._findings:
            lines.append(self._finding_markdown(finding))
        return "\n".join(lines)

    def to_html(self) -> str:
        rows = "\n".join(self._finding_html(f) for f in self._findings) or "<p>Keine Funde. Schilde stabil.</p>"
        counts = Counter(f.severity for f in self._findings)
        badges = "".join(
            f'<span class="badge {s.value}">{_SEVERITY_LABEL_DE[s]}: {counts.get(s, 0)}</span>'
            for s in _SEVERITY_ORDER
        )
        score = self._score
        return f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ToySafe-Logbuch</title>
<style>
  :root {{ --bg:#f4f6fb; --card:#fff; --ink:#0d1330; --mu:#56608a; --line:#d9deef; --acc:#0a8f8a; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg:#060a1c; --card:#0e1530; --ink:#e8ecff; --mu:#9aa4d0; --line:#24305e; --acc:#3ee6d6; }} }}
  body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--ink); margin: 0; padding: 2rem 1rem; }}
  main {{ max-width: 56rem; margin: 0 auto; }}
  h1 {{ margin: 0 0 .25rem; letter-spacing: .02em; }}
  .meta {{ color: var(--mu); margin-bottom: 1.25rem; }}
  .score {{ display:flex; align-items:center; gap:1rem; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:1rem 1.25rem; margin-bottom:1rem; }}
  .score b {{ font-size: 2.4rem; color: var(--acc); font-variant-numeric: tabular-nums; }}
  .badge {{ display:inline-block; padding:.3rem .7rem; border-radius:999px; margin:0 .4rem .4rem 0; font-size:.85rem; border:1px solid var(--line); }}
  .card {{ background:var(--card); border-radius:14px; padding:1.1rem 1.3rem; margin-bottom:1rem; border:1px solid var(--line); border-left:6px solid #9ca3af; }}
  .critical {{ border-left-color:#e5484d; }} .high {{ border-left-color:#f76b15; }}
  .medium {{ border-left-color:#e2a336; }} .low {{ border-left-color:#3e8ef7; }}
  .card h3 {{ margin:0 0 .5rem; font-size:1.05rem; }}
  .tag {{ font-size:.8rem; color:var(--mu); margin-right:1rem; }}
  .kev {{ color:#e5484d; font-weight:700; }}
  .rec {{ background: color-mix(in srgb, var(--acc) 12%, transparent); border-radius:10px; padding:.7rem 1rem; margin-top:.7rem; }}
  a {{ color: var(--acc); }}
</style>
</head>
<body><main>
  <h1>ToySafe-Logbuch</h1>
  <div class="meta">Erstellt: {utcnow():%Y-%m-%d %H:%M} UTC &middot; {len(self._findings)} Funde &middot; {len(self._assets)} Geräte/Dienste</div>
  <div class="score"><b>{score['score']}</b><div><strong>Schildstärke</strong><br>{escape(score['label'])}</div></div>
  <div>{badges}</div>
  <h2>Priorisierte Funde</h2>
  {rows}
</main></body>
</html>"""

    def to_pdf(self) -> bytes:
        """PDF über WeasyPrint (optional installiert: pip install weasyprint)."""
        from weasyprint import HTML  # type: ignore[import-not-found]

        return HTML(string=self.to_html()).write_pdf()

    # -- interne Bausteine -----------------------------------------------

    def _asset_name(self, finding: Finding) -> str:
        asset = self._assets_by_id.get(finding.asset_id)
        return asset.name if asset else finding.asset_id

    def _summary_markdown(self) -> str:
        counts = Counter(f.severity for f in self._findings)
        rows = [f"- {_SEVERITY_ICON[s]} **{_SEVERITY_LABEL_DE[s]}**: {counts.get(s, 0)}" for s in _SEVERITY_ORDER]
        top = self._findings[:5]
        top_lines = [f"  {i + 1}. {t.title} ({self._asset_name(t)})" for i, t in enumerate(top)] or ["  Keine Findings."]
        return "## Zusammenfassung\n" + "\n".join(rows) + "\n\n### Dringendste Funde\n" + "\n".join(top_lines)

    def _finding_markdown(self, finding: Finding) -> str:
        parts = [
            f"### {_SEVERITY_ICON[finding.severity]} {finding.title}",
            f"**Asset:** {self._asset_name(finding)}  ",
            f"**Schweregrad:** {_SEVERITY_LABEL_DE[finding.severity]}  ",
        ]
        if finding.cvss_score is not None:
            parts.append(f"**CVSS:** {finding.cvss_score}  ")
        if finding.cve_ids:
            parts.append(f"**CVE:** {', '.join(finding.cve_ids)}  ")
        if finding.is_actively_exploited:
            parts.append("**⚠️ Wird laut CISA-KEV-Liste aktiv ausgenutzt**  ")
        parts.append(f"**Quelle:** {finding.source_plugin}  ")
        parts.append("")
        parts.append(f"**Was wurde gefunden?**  \n{finding.description or '–'}")
        parts.append("")
        parts.append(f"**Empfehlung:**  \n{finding.recommendation or 'Keine automatische Empfehlung vorhanden.'}")
        if _safe_url(finding.reference_url):
            parts.append(f"\n[Referenz]({finding.reference_url})")
        parts.append("\n---\n")
        return "\n".join(parts)

    def _finding_html(self, finding: Finding) -> str:
        tags = [
            f'<span class="tag">Gerät: {escape(self._asset_name(finding))}</span>',
            f'<span class="tag">Quelle: {escape(finding.source_plugin)}</span>',
        ]
        if finding.cvss_score is not None:
            tags.append(f'<span class="tag">CVSS: {finding.cvss_score}</span>')
        if finding.cve_ids:
            tags.append(f'<span class="tag">CVE: {escape(", ".join(finding.cve_ids))}</span>')
        if finding.is_actively_exploited:
            tags.append('<span class="tag kev">⚠ aktiv ausgenutzt (CISA-KEV)</span>')

        url = _safe_url(finding.reference_url)
        ref = f'<p><a href="{escape(url, quote=True)}" rel="noopener noreferrer">Referenz</a></p>' if url else ""

        return f"""
    <div class="card {finding.severity.value}">
      <h3>{_SEVERITY_ICON[finding.severity]} {escape(finding.title)}</h3>
      <div>{''.join(tags)}</div>
      <p>{escape(finding.description or '–')}</p>
      <div class="rec"><strong>Empfehlung:</strong> {escape(finding.recommendation or 'Keine automatische Empfehlung vorhanden.')}</div>
      {ref}
    </div>"""
