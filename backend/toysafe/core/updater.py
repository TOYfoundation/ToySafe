"""Update-Job: hält die Bedrohungsdaten der App aktuell.

Deckt ab:
- CISA Known Exploited Vulnerabilities (KEV) - Grundlage für das
  'is_actively_exploited'-Flag, das die Priorisierungs-Engine am stärksten
  gewichtet
- Nuclei-Templates (über die offizielle '-update-templates'-Funktion von
  ProjectDiscovery - keine eigene Template-Logik)
- Basis-Signaturliste für unerwünschte Software (software_signatures.yaml)

Lokale Anpassungen (z.B. die ToyCoin-Allowlist) liegen bewusst in einer
separaten Datei (config/local_overrides.yaml) und werden von diesem Job
NIE überschrieben, siehe unwanted_software.py.

Gedacht als eigenständiger, regelmäßig laufender Job (Cron/systemd-Timer),
unabhängig vom eigentlichen Scan. Jeder Schritt ist defensiv: ein
fehlgeschlagenes Update darf nie einen laufenden Scan blockieren.
"""
from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests
import yaml

from toysafe.core.models import Finding

logger = logging.getLogger("toysafe.updater")

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"
KEV_CACHE_PATH = DATA_DIR / "kev_catalog.json"
BASE_SIGNATURES_PATH = CONFIG_DIR / "software_signatures.yaml"

CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"


@dataclass
class UpdateResult:
    step: str
    success: bool
    detail: str


class KEVCatalog:
    """Cache der CISA Known-Exploited-Vulnerabilities-Liste."""

    def __init__(self, cache_path: Path = KEV_CACHE_PATH) -> None:
        self._cache_path = cache_path
        self._cve_ids: set[str] = self._load_cache()

    def _load_cache(self) -> set[str]:
        if not self._cache_path.exists():
            return set()
        data = json.loads(self._cache_path.read_text(encoding="utf-8"))
        return set(data.get("cve_ids", []))

    def refresh(self, timeout: int = 30) -> UpdateResult:
        try:
            response = requests.get(CISA_KEV_URL, timeout=timeout)
            response.raise_for_status()
            vulnerabilities = response.json().get("vulnerabilities", [])
            cve_ids = {v["cveID"] for v in vulnerabilities if v.get("cveID")}
        except Exception as exc:  # ein Update-Fehler darf den Scan nie blockieren
            return UpdateResult("cisa-kev", False, f"Abruf fehlgeschlagen: {exc}")

        self._cve_ids = cve_ids
        self._cache_path.parent.mkdir(parents=True, exist_ok=True)
        self._cache_path.write_text(json.dumps({"cve_ids": sorted(cve_ids)}), encoding="utf-8")
        return UpdateResult("cisa-kev", True, f"{len(cve_ids)} aktiv ausgenutzte CVEs geladen")

    def is_actively_exploited(self, cve_id: str) -> bool:
        return cve_id.upper() in self._cve_ids

    def enrich(self, findings: list[Finding]) -> list[Finding]:
        """Setzt is_actively_exploited anhand der KEV-Liste für jedes Finding mit CVE-ID."""
        for finding in findings:
            if any(self.is_actively_exploited(cve) for cve in finding.cve_ids):
                finding.is_actively_exploited = True
        return findings


class SignatureFeedUpdater:
    """Zieht die BASIS-Signaturliste für unerwünschte Software von einer
    gepflegten Quelle. Rührt niemals local_overrides.yaml an - dort liegen
    die ToyCoin-Allowlist und sonstige lokale Anpassungen.
    """

    def __init__(self, feed_url: Optional[str], target_path: Path = BASE_SIGNATURES_PATH) -> None:
        self._feed_url = feed_url
        self._target_path = target_path

    def refresh(self, timeout: int = 30) -> UpdateResult:
        if not self._feed_url:
            return UpdateResult("signatures-feed", False, "Keine SIGNATURES_FEED_URL konfiguriert - übersprungen")

        try:
            response = requests.get(self._feed_url, timeout=timeout)
            response.raise_for_status()
            new_content = response.text
            yaml.safe_load(new_content)  # Validierung vor dem Schreiben
        except Exception as exc:
            return UpdateResult("signatures-feed", False, f"Abruf/Validierung fehlgeschlagen: {exc}")

        self._target_path.write_text(new_content, encoding="utf-8")
        return UpdateResult("signatures-feed", True, f"Basis-Signaturen aktualisiert ({self._target_path.name})")


class NucleiTemplateUpdater:
    """Dünner Wrapper um 'nuclei -update-templates' - nutzt nur die
    offizielle Update-Funktion von ProjectDiscovery, keine eigene Logik.
    """

    def refresh(self, timeout: int = 300) -> UpdateResult:
        try:
            result = subprocess.run(
                ["nuclei", "-update-templates"], capture_output=True, text=True, timeout=timeout,
            )
        except FileNotFoundError:
            return UpdateResult("nuclei-templates", False, "nuclei ist nicht installiert")
        except subprocess.TimeoutExpired:
            return UpdateResult("nuclei-templates", False, "Zeitüberschreitung beim Update")

        success = result.returncode == 0
        return UpdateResult("nuclei-templates", success, (result.stdout or result.stderr).strip())


def run_update_job(signatures_feed_url: Optional[str] = None) -> list[UpdateResult]:
    """Führt alle Update-Schritte aus und liefert pro Schritt Erfolg + Erklärung."""
    results: list[UpdateResult] = [
        KEVCatalog().refresh(),
        NucleiTemplateUpdater().refresh(),
        SignatureFeedUpdater(signatures_feed_url).refresh(),
    ]

    for r in results:
        (logger.info if r.success else logger.warning)("[%s] %s", r.step, r.detail)

    _write_status(results)
    return results


UPDATE_STATUS_PATH = DATA_DIR / "update_status.json"


def _write_status(results: list[UpdateResult]) -> None:
    from toysafe.core.models import utcnow

    status = {
        "at": utcnow().isoformat(),
        "results": [{"step": r.step, "success": r.success, "detail": r.detail[:500]} for r in results],
    }
    try:
        UPDATE_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        UPDATE_STATUS_PATH.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
    except OSError:
        logger.warning("Update-Status konnte nicht gespeichert werden")


def read_status() -> Optional[dict]:
    if not UPDATE_STATUS_PATH.exists():
        return None
    return json.loads(UPDATE_STATUS_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    import os

    for result in run_update_job(signatures_feed_url=os.getenv("SIGNATURES_FEED_URL")):
        status = "OK" if result.success else "FEHLER"
        print(f"[{status}] {result.step}: {result.detail}")
