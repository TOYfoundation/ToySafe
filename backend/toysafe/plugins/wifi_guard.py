"""WLAN-Wächter: passive Übersicht über Funknetze in der Umgebung.

Liest nur die Liste sichtbarer WLANs, die das Betriebssystem ohnehin kennt
(`nmcli dev wifi list`). Kein Monitor-Modus, keine Deauth-Pakete, kein
Mitschneiden fremder Daten.

Erkennt:
- eigene Netze mit schwacher Verschlüsselung (offen, WEP, WPA1)
- "Böse Zwillinge": ein Netz mit dem Namen des eigenen WLANs, aber
  unbekannter Hardware-Adresse (BSSID) oder schwächerer Verschlüsselung
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import yaml

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

OVERRIDES_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "local_overrides.yaml"

_STRENGTH = {"open": 0, "wep": 1, "wpa1": 2, "wpa2": 3, "wpa3": 4}


def security_level(security: str) -> str:
    s = security.upper()
    if not s or s in ("--", "NONE"):
        return "open"
    if "WPA3" in s or "SAE" in s:
        return "wpa3"
    if "WPA2" in s or "RSN" in s:
        return "wpa2"
    if "WPA" in s:
        return "wpa1"
    if "WEP" in s:
        return "wep"
    return "open"


def parse_nmcli(output: str) -> list[dict]:
    """Parst `nmcli -t -e yes -f SSID,BSSID,SECURITY,CHAN,SIGNAL dev wifi list`."""
    networks = []
    for line in output.splitlines():
        if not line.strip():
            continue
        # nmcli escaped ':' in Feldern als '\:'
        fields, cur, esc = [], "", False
        for ch in line:
            if esc:
                cur += ch
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == ":":
                fields.append(cur)
                cur = ""
            else:
                cur += ch
        fields.append(cur)
        if len(fields) < 5:
            continue
        ssid, bssid, security, chan, signal = fields[:5]
        networks.append({
            "ssid": ssid, "bssid": bssid.lower(), "security": security,
            "level": security_level(security), "channel": chan,
            "signal": int(signal) if signal.isdigit() else None,
        })
    return networks


class WifiGuardPlugin(Plugin):
    name = "wifi-guard"
    category = "Wireless Attacks (nur passiv)"
    kali_equivalent = "Rogue-AP-Erkennung (passiv, statt Aircrack-ng/Wifite)"
    phase = ScanPhase.DISCOVERY
    station = Station.COMMS
    explanation = "schaut sich die WLANs ringsum an und sucht falsche Zwillinge deines Netzes"

    def __init__(self, overrides_path: Path = OVERRIDES_PATH) -> None:
        self._overrides_path = overrides_path

    def is_available(self) -> bool:
        return self.tool_installed("nmcli")

    def applies_to(self, asset: Asset) -> bool:
        return asset.is_local and asset.asset_type == AssetType.HOST

    def _known_networks(self) -> list[dict]:
        if not self._overrides_path.exists():
            return []
        data = yaml.safe_load(self._overrides_path.read_text(encoding="utf-8")) or {}
        return data.get("known_wifi_networks", []) or []

    def run(self, asset: Asset) -> list[Finding]:
        result = subprocess.run(
            ["nmcli", "-t", "-e", "yes", "-f", "SSID,BSSID,SECURITY,CHAN,SIGNAL", "dev", "wifi", "list"],
            capture_output=True, text=True, timeout=60,
        )
        return self.evaluate(parse_nmcli(result.stdout), asset)

    def evaluate(self, networks: list[dict], asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        known = {k["ssid"]: k for k in self._known_networks() if k.get("ssid")}

        for ssid, cfg in known.items():
            seen = [n for n in networks if n["ssid"] == ssid]
            expected_level = security_level(cfg.get("security", "WPA2"))
            known_bssids = {b.lower() for b in cfg.get("bssids", [])}
            for n in seen:
                weaker = _STRENGTH[n["level"]] < _STRENGTH[expected_level]
                unknown_hw = bool(known_bssids) and n["bssid"] not in known_bssids
                if weaker or unknown_hw:
                    findings.append(self.finding(
                        asset, f"Möglicher böser Zwilling: „{ssid}“ ({n['bssid']})",
                        Severity.HIGH if weaker else Severity.MEDIUM,
                        description=(
                            f"Ein Netz mit dem Namen deines WLANs sendet mit {n['security'] or 'ohne Verschlüsselung'}"
                            f"{' und unbekannter Hardware-Adresse' if unknown_hw else ''} (Kanal {n['channel']})."
                        ),
                        recommendation=(
                            "Nicht mit diesem Netz verbinden. Auf allen Geräten 'automatisch verbinden' nur für das "
                            "echte Netz erlauben. Wenn ein neuer Repeater/Router dazukam: BSSID ins Inventar eintragen."
                        ),
                    ))
                elif _STRENGTH[n["level"]] < _STRENGTH["wpa2"]:
                    findings.append(self.finding(
                        asset, f"Eigenes WLAN „{ssid}“ schwach verschlüsselt ({n['security'] or 'offen'})",
                        Severity.HIGH,
                        description="Offene, WEP- oder WPA1-Netze lassen sich mitlesen oder schnell knacken.",
                        recommendation="Im Router WPA3 (oder WPA2/WPA3-Mischmodus) mit langem Passwort einstellen.",
                    ))

        open_nets = [n for n in networks if n["level"] == "open" and n["ssid"] not in known]
        if open_nets:
            findings.append(self.finding(
                asset, f"{len(open_nets)} offene WLANs in der Nähe", Severity.INFO,
                description=", ".join(sorted({n['ssid'] or '(versteckt)' for n in open_nets}))[:300],
                recommendation="Offene Netze nur mit VPN nutzen und automatisches Verbinden ausschalten.",
            ))
        return findings
