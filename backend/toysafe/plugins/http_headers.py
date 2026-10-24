"""Webdienst-Check: Sicherheits-Header, HTTPS-Weiterleitung, Server-Banner.

Ein einziger normaler Seitenabruf, wie ihn jeder Browser macht. Keine
Angriffe, keine Formulare, keine Last. Gedacht für die eigenen Seiten der
ToyVerse-Betreiber (Webseite, ToyScan, TOYPAY-Server).
"""
from __future__ import annotations

from urllib.parse import urlparse

import requests

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

USER_AGENT = "ToySafe-HeaderCheck/0.7 (+defensive self-check)"

# Header -> (Schweregrad wenn fehlt, Erklärung, Empfehlung)
REQUIRED_HEADERS: dict[str, tuple[Severity, str, str]] = {
    "strict-transport-security": (
        Severity.MEDIUM,
        "Ohne HSTS kann ein Angreifer im selben WLAN Besucher auf unverschlüsseltes HTTP umleiten.",
        "Strict-Transport-Security: max-age=31536000; includeSubDomains setzen.",
    ),
    "content-security-policy": (
        Severity.MEDIUM,
        "Ohne CSP können eingeschleuste Skripte (XSS) beliebigen Code im Browser der Besucher ausführen.",
        "Eine Content-Security-Policy setzen, z. B. default-src 'self'; frame-ancestors 'none'.",
    ),
    "x-content-type-options": (
        Severity.LOW,
        "Der Browser könnte Dateien falsch deuten und als Skript ausführen.",
        "X-Content-Type-Options: nosniff setzen.",
    ),
    "referrer-policy": (
        Severity.LOW,
        "Vollständige Adressen (evtl. mit Kennungen) gehen an fremde Seiten.",
        "Referrer-Policy: strict-origin-when-cross-origin oder no-referrer setzen.",
    ),
    "permissions-policy": (
        Severity.INFO,
        "Kamera, Mikrofon und Standort sind nicht ausdrücklich gesperrt.",
        "Permissions-Policy: camera=(), microphone=(), geolocation=() setzen, wenn nicht gebraucht.",
    ),
}


def check_headers(url: str, timeout: int = 15, session: requests.Session | None = None) -> list[dict]:
    """Liefert eine Liste neutraler Prüfergebnisse (auch für den Schnell-Check im Cockpit)."""
    http = session or requests.Session()
    results: list[dict] = []
    response = http.get(url, timeout=timeout, allow_redirects=True, headers={"User-Agent": USER_AGENT})
    headers = {k.lower(): v for k, v in response.headers.items()}
    final = urlparse(response.url)

    if final.scheme != "https":
        results.append({"id": "https", "ok": False, "severity": "high",
                        "title": "Seite wird nicht über HTTPS ausgeliefert",
                        "detail": f"Endadresse: {response.url}",
                        "fix": "HTTPS erzwingen und HTTP dauerhaft (301) auf HTTPS umleiten."})
    else:
        results.append({"id": "https", "ok": True, "severity": "info", "title": "HTTPS aktiv",
                        "detail": response.url, "fix": ""})

    for name, (sev, why, fix) in REQUIRED_HEADERS.items():
        present = name in headers
        if name == "content-security-policy" and not present:
            present = "content-security-policy-report-only" in headers
        frame_ok = "frame-ancestors" in headers.get("content-security-policy", "")
        results.append({
            "id": name, "ok": present, "severity": "info" if present else sev.value,
            "title": f"{name} {'gesetzt' if present else 'fehlt'}",
            "detail": headers.get(name, why), "fix": "" if present else fix,
        })
        if name == "content-security-policy" and not frame_ok and "x-frame-options" not in headers:
            results.append({"id": "clickjacking", "ok": False, "severity": "low",
                            "title": "Schutz gegen Clickjacking fehlt",
                            "detail": "Die Seite kann unsichtbar in fremde Seiten eingebettet werden.",
                            "fix": "CSP frame-ancestors 'none' oder X-Frame-Options: DENY setzen."})

    server = headers.get("server", "")
    powered = headers.get("x-powered-by", "")
    if any(ch.isdigit() for ch in server) or powered:
        results.append({"id": "banner", "ok": False, "severity": "low",
                        "title": "Server verrät Software und Version",
                        "detail": f"Server: {server} {('· X-Powered-By: ' + powered) if powered else ''}".strip(),
                        "fix": "Versionsangaben im Server-Header ausblenden (z. B. server_tokens off bei nginx)."})
    return results


class HTTPHeadersPlugin(Plugin):
    name = "http-headers"
    category = "Web Application Analysis"
    kali_equivalent = "Nikto (Header-Teil) / Mozilla Observatory"
    phase = ScanPhase.EXTERNAL_SURFACE
    station = Station.OPERATOR
    explanation = "ruft die Seite einmal ab und prüft Schutz-Header und HTTPS"

    def __init__(self, session: requests.Session | None = None) -> None:
        self._session = session

    def is_available(self) -> bool:
        return True

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.WEB_SERVICE and bool(asset.url)

    def run(self, asset: Asset) -> list[Finding]:
        findings = []
        for r in check_headers(asset.url or "", session=self._session):
            if r["ok"]:
                continue
            findings.append(self.finding(
                asset, f"Web: {r['title']}", Severity(r["severity"]),
                description=r["detail"], recommendation=r["fix"],
                reference_url="https://developer.mozilla.org/docs/Web/HTTP/Headers",
            ))
        return findings
