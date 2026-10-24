"""Plugin-Registry und Scan-Ablauf.

Sorgt dafür, dass Plugins in sinnvoller Reihenfolge laufen: erst Erkundung,
dann extern erreichbare Dienste, dann Schwachstellen-Scan, dann
Konfigurationsaudit, zuletzt gezielte Tiefenprüfung je Asset. Jeder Schritt
wird als Ereignis gemeldet, damit das Cockpit live zeigen kann, was gerade
passiert und warum.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Optional

from toysafe.core.models import Asset, Finding, Severity
from toysafe.core.plugin_base import PHASE_LABEL_DE, Plugin, ScanPhase
from toysafe.core.updater import KEVCatalog

logger = logging.getLogger("toysafe.registry")


@dataclass
class ScanEvent:
    kind: str            # "phase", "step", "skip", "error", "done"
    message: str
    phase: Optional[str] = None
    plugin: Optional[str] = None
    asset_id: Optional[str] = None
    step: int = 0
    total_steps: int = 0


ProgressCallback = Callable[[ScanEvent], None]


class PluginRegistry:
    def __init__(self, kev_catalog: Optional[KEVCatalog] = None) -> None:
        self._plugins: list[Plugin] = []
        # Nutzt den zuletzt vom Update-Job gecachten KEV-Stand -
        # kein Netzwerkaufruf während des eigentlichen Scans.
        self._kev_catalog = kev_catalog or KEVCatalog()

    @property
    def plugins(self) -> list[Plugin]:
        return list(self._plugins)

    def register(self, plugin: Plugin) -> None:
        self._plugins.append(plugin)

    def plugins_for_phase(self, phase: ScanPhase) -> list[Plugin]:
        return [p for p in self._plugins if p.phase == phase]

    def plan(self, assets: list[Asset]) -> list[tuple[ScanPhase, Plugin, Asset]]:
        """Alle geplanten Schritte in Ausführungsreihenfolge (ohne Verfügbarkeitsprüfung)."""
        steps = []
        for phase in ScanPhase:
            for plugin in self.plugins_for_phase(phase):
                for asset in assets:
                    if plugin.applies_to(asset):
                        steps.append((phase, plugin, asset))
        return steps

    def run_scan(self, assets: list[Asset], progress: Optional[ProgressCallback] = None) -> list[Finding]:
        """Arbeitet alle Phasen der Reihe nach ab und meldet, was läuft."""
        emit = progress or (lambda e: logger.info(e.message))
        all_findings: list[Finding] = []
        steps = self.plan(assets)
        total = len(steps)
        availability: dict[str, bool] = {}
        current_phase: Optional[ScanPhase] = None

        for index, (phase, plugin, asset) in enumerate(steps, start=1):
            if phase != current_phase:
                current_phase = phase
                emit(ScanEvent("phase", f"Phase {PHASE_LABEL_DE[phase]}", phase=phase.value,
                               step=index - 1, total_steps=total))

            if plugin.name not in availability:
                availability[plugin.name] = _safe_available(plugin)
            if not availability[plugin.name]:
                emit(ScanEvent("skip", f"{plugin.name} ({plugin.kali_equivalent}) nicht installiert – übersprungen",
                               phase=phase.value, plugin=plugin.name, asset_id=asset.id, step=index, total_steps=total))
                continue

            emit(ScanEvent("step", f"{plugin.name} prüft {asset.name} – {plugin.explanation or plugin.kali_equivalent}",
                           phase=phase.value, plugin=plugin.name, asset_id=asset.id, step=index, total_steps=total))
            try:
                all_findings.extend(plugin.run(asset))
            except Exception as exc:  # ein Plugin-Fehler darf den Scan nie abbrechen
                logger.exception("Plugin %s fehlgeschlagen", plugin.name)
                emit(ScanEvent("error", f"{plugin.name} bei {asset.name} fehlgeschlagen: {exc}",
                               phase=phase.value, plugin=plugin.name, asset_id=asset.id, step=index, total_steps=total))
                all_findings.append(plugin.finding(
                    asset, f"Prüfung unvollständig: {plugin.name}", Severity.INFO,
                    description=f"Das Werkzeug meldete einen Fehler: {exc}",
                    recommendation="Werkzeug-Installation und Rechte prüfen, dann erneut scannen.",
                ))

        enriched = self._kev_catalog.enrich(all_findings)
        emit(ScanEvent("done", f"Scan abgeschlossen: {len(enriched)} Funde", step=total, total_steps=total))
        return enriched


def _safe_available(plugin: Plugin) -> bool:
    try:
        return plugin.is_available()
    except Exception:
        return False
