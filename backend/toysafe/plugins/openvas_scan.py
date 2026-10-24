"""Vulnerability-Scan-Plugin: kapselt OpenVAS/Greenbone über die offizielle
GMP-API (python-gvm). Nutzt ausschließlich die Standard-Scan-Konfiguration
von OpenVAS - keine eigene Scan-Logik.

Benötigt eine laufende Greenbone-Instanz; Zugangsdaten über
Umgebungsvariablen (GVM_HOST, GVM_USERNAME, GVM_PASSWORD).
"""
from __future__ import annotations

import os
import time
import uuid

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

_SEVERITY_THRESHOLDS = [
    (9.0, Severity.CRITICAL),
    (7.0, Severity.HIGH),
    (4.0, Severity.MEDIUM),
    (0.1, Severity.LOW),
]


def _severity_from_cvss(cvss: float) -> Severity:
    for threshold, severity in _SEVERITY_THRESHOLDS:
        if cvss >= threshold:
            return severity
    return Severity.INFO


class OpenVASScanPlugin(Plugin):
    name = "openvas-scan"
    category = "Vulnerability Analysis"
    kali_equivalent = "OpenVAS / Greenbone"
    phase = ScanPhase.VULNERABILITY_SCAN
    station = Station.SHIELDS
    explanation = "lässt Greenbone mit über 100.000 Tests nach bekannten Lücken suchen"

    def is_available(self) -> bool:
        if not (os.getenv("GVM_HOST") and os.getenv("GVM_USERNAME") and os.getenv("GVM_PASSWORD")):
            return False
        try:
            import gvm  # noqa: F401
        except ImportError:
            return False
        return True

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type in {
            AssetType.NETWORK_DEVICE, AssetType.IOT_DEVICE, AssetType.HOST,
            AssetType.WEB_SERVICE, AssetType.TOYCHAIN_NODE,
        } and bool(asset.target())

    def run(self, asset: Asset) -> list[Finding]:
        from gvm.connections import TLSConnection
        from gvm.protocols.gmp import Gmp
        from gvm.transforms import EtreeCheckCommandTransform

        connection = TLSConnection(hostname=os.environ["GVM_HOST"])
        with Gmp(connection=connection, transform=EtreeCheckCommandTransform()) as gmp:
            gmp.authenticate(os.environ["GVM_USERNAME"], os.environ["GVM_PASSWORD"])

            target = gmp.create_target(name=f"scan-{asset.id}", hosts=[asset.target()])
            target_id = target.get("id")

            task = gmp.create_task(
                name=f"scan-{asset.id}",
                config_id=os.environ.get("GVM_SCAN_CONFIG_ID", "daba56c8-73ec-11df-a475-002264764cea"),
                target_id=target_id,
                scanner_id=os.environ.get("GVM_SCANNER_ID", "08b69003-5fc2-4037-a479-93b440211c73"),
            )
            task_id = task.get("id")
            gmp.start_task(task_id)

            deadline = time.monotonic() + 6 * 3600
            while time.monotonic() < deadline:
                status = gmp.get_task(task_id).find(".//status").text
                if status in ("Done", "Stopped", "Interrupted"):
                    break
                time.sleep(15)

            report_id = gmp.get_task(task_id).find(".//report").get("id")
            report = gmp.get_report(report_id, details=True)

        return self.parse(report, asset)

    def parse(self, report_xml, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        for result in report_xml.findall(".//result"):
            cvss_text = result.findtext("severity") or "0"
            cvss = float(cvss_text) if cvss_text else 0.0
            cve = result.findtext("nvt/cve", default="")

            findings.append(Finding(
                id=str(uuid.uuid4()),
                asset_id=asset.id,
                title=result.findtext("name", default="OpenVAS-Fund"),
                description=result.findtext("description", default=""),
                severity=_severity_from_cvss(cvss),
                source_plugin=self.name,
                cve_ids=[c for c in cve.split(",") if c and c != "NOCVE"],
                cvss_score=cvss,
                recommendation=result.findtext("nvt/solution", default="Siehe NVT-Details in Greenbone."),
            ))

        return findings
