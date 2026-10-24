"""Mail-Identität: SPF, DMARC und MX der eigenen Domains.

Betrüger verschicken gern Mails "im Namen" bekannter Projekte. SPF und
DMARC sagen fremden Mailservern, welche Absender echt sind und dass
gefälschte Mails abgewiesen werden sollen. Reine DNS-Abfragen öffentlicher
Einträge.
"""
from __future__ import annotations

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase


def _txt_records(name: str, resolver) -> list[str]:
    import dns.exception
    import dns.resolver

    try:
        answers = resolver.resolve(name, "TXT")
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, dns.exception.Timeout):
        return []
    return [b"".join(r.strings).decode("utf-8", "ignore") for r in answers]


def check_email_dns(domain: str, resolver=None) -> list[dict]:
    import dns.resolver

    resolver = resolver or dns.resolver.Resolver()
    domain = domain.strip().lower().rstrip(".")
    results: list[dict] = []

    spf = [t for t in _txt_records(domain, resolver) if t.lower().startswith("v=spf1")]
    if not spf:
        results.append({"id": "spf", "ok": False, "severity": "high", "title": "Kein SPF-Eintrag",
                        "detail": "Jeder Server kann Mails mit dieser Domain als Absender verschicken.",
                        "fix": f'TXT-Eintrag für {domain}: "v=spf1 include:<dein-mailanbieter> -all" (oder "v=spf1 -all", wenn die Domain keine Mails verschickt).'})
    elif len(spf) > 1:
        results.append({"id": "spf", "ok": False, "severity": "medium", "title": "Mehrere SPF-Einträge",
                        "detail": " | ".join(spf), "fix": "Zu genau einem SPF-Eintrag zusammenfassen."})
    elif spf[0].rstrip().endswith(("+all", "?all")):
        results.append({"id": "spf", "ok": False, "severity": "high", "title": "SPF erlaubt jeden Absender",
                        "detail": spf[0], "fix": "Am Ende -all (oder mindestens ~all) verwenden."})
    else:
        results.append({"id": "spf", "ok": True, "severity": "info", "title": "SPF vorhanden", "detail": spf[0], "fix": ""})

    dmarc = [t for t in _txt_records(f"_dmarc.{domain}", resolver) if t.lower().startswith("v=dmarc1")]
    if not dmarc:
        results.append({"id": "dmarc", "ok": False, "severity": "high", "title": "Kein DMARC-Eintrag",
                        "detail": "Empfänger wissen nicht, was mit gefälschten Mails passieren soll.",
                        "fix": f'TXT-Eintrag für _dmarc.{domain}: "v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}", später p=reject.'})
    else:
        policy = next((p.split("=", 1)[1].strip().lower() for p in dmarc[0].split(";") if p.strip().lower().startswith("p=")), "none")
        if policy == "none":
            results.append({"id": "dmarc", "ok": False, "severity": "medium", "title": "DMARC nur im Beobachtungsmodus (p=none)",
                            "detail": dmarc[0], "fix": "Nach Prüfung der Berichte auf p=quarantine und dann p=reject umstellen."})
        else:
            results.append({"id": "dmarc", "ok": True, "severity": "info", "title": f"DMARC aktiv (p={policy})",
                            "detail": dmarc[0], "fix": ""})
    return results


class EmailDNSPlugin(Plugin):
    name = "email-dns"
    category = "Information Gathering"
    kali_equivalent = "dig / dnsenum (nur eigene Domain)"
    phase = ScanPhase.EXTERNAL_SURFACE
    station = Station.IDENTITY
    explanation = "prüft, ob Fälscher Mails im Namen deiner Domain verschicken können"

    def __init__(self, resolver=None) -> None:
        self._resolver = resolver

    def is_available(self) -> bool:
        try:
            import dns.resolver  # noqa: F401
        except ImportError:
            return False
        return True

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.WEB_SERVICE and bool(asset.hostname)

    def run(self, asset: Asset) -> list[Finding]:
        domain = asset.hostname or ""
        if domain.startswith("www."):
            domain = domain[4:]
        return [
            self.finding(asset, f"Mail-Identität {domain}: {r['title']}", Severity(r["severity"]),
                         description=r["detail"], recommendation=r["fix"],
                         reference_url="https://www.bsi.bund.de/dok/TR-03182")
            for r in check_email_dns(domain, self._resolver) if not r["ok"]
        ]
