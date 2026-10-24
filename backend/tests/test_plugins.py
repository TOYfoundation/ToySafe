import json
from collections import namedtuple
from pathlib import Path

import psutil

from toysafe.core.models import Asset, AssetType, Severity
from toysafe.plugins.code_audit import ContainerScanPlugin, DependencyAuditPlugin, SecretsScanPlugin
from toysafe.plugins.email_dns import check_email_dns
from toysafe.plugins.http_headers import HTTPHeadersPlugin
from toysafe.plugins.lynis_audit import LynisAuditPlugin
from toysafe.plugins.network_inventory import NetworkInventoryPlugin
from toysafe.plugins.nuclei_scan import NucleiScanPlugin
from toysafe.plugins.recon_nmap import NmapDiscoveryPlugin
from toysafe.plugins.tls_audit import TLSAuditPlugin
from toysafe.plugins.toynode_audit import TimeSyncPlugin, ToyNodeAuditPlugin, parse_chrony
from toysafe.plugins.unwanted_software import UnwantedSoftwarePlugin
from toysafe.plugins.wifi_guard import WifiGuardPlugin, parse_nmcli

CONFIG = Path(__file__).resolve().parents[1] / "config"


def host(**kw):
    base = dict(id="h", name="Host", asset_type=AssetType.HOST, ip_address="192.168.1.10")
    base.update(kw)
    return Asset(**base)


NMAP_XML = """<?xml version="1.0"?><nmaprun><host><ports>
<port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="9.6"/></port>
<port protocol="tcp" portid="23"><state state="open"/><service name="telnet"/></port>
<port protocol="tcp" portid="80"><state state="closed"/><service name="http"/></port>
</ports></host></nmaprun>"""


def test_nmap_flags_risky_services_harder_when_external():
    inside = NmapDiscoveryPlugin().parse(NMAP_XML, host())
    outside = NmapDiscoveryPlugin().parse(NMAP_XML, host(externally_reachable=True))
    assert len(inside) == 2
    telnet_in = next(f for f in inside if "Telnet" in f.title)
    telnet_out = next(f for f in outside if "Telnet" in f.title)
    assert telnet_in.severity == Severity.HIGH and telnet_out.severity == Severity.CRITICAL
    assert next(f for f in inside if "22" in f.title).severity == Severity.INFO


def test_nmap_garbage_is_ignored():
    assert NmapDiscoveryPlugin().parse("kein xml", host()) == []


PING_XML = """<nmaprun>
<host><status state="up"/><address addr="192.168.1.1" addrtype="ipv4"/><address addr="AA:BB:CC:00:00:01" addrtype="mac" vendor="AVM"/></host>
<host><status state="up"/><address addr="192.168.1.77" addrtype="ipv4"/><address addr="DE:AD:BE:EF:00:01" addrtype="mac" vendor="Espressif"/>
<hostnames><hostname name="esp-77"/></hostnames></host>
<host><status state="down"/><address addr="192.168.1.99" addrtype="ipv4"/></host>
</nmaprun>"""


def test_radar_reports_unknown_devices(tmp_path):
    inv = tmp_path / "inventory.yaml"
    inv.write_text("devices:\n  - {name: Router, mac: 'aa:bb:cc:00:00:01'}\n")
    seg = host(id="seg", asset_type=AssetType.NETWORK_SEGMENT, ip_address="192.168.1.0/24")
    plugin = NetworkInventoryPlugin(inventory_path=inv)
    hosts = plugin.parse_hosts(PING_XML)
    assert [h["ip"] for h in hosts] == ["192.168.1.1", "192.168.1.77"]
    findings = plugin.compare(hosts, seg)
    unknown = [f for f in findings if "Unbekanntes" in f.title]
    assert len(unknown) == 1 and "esp-77" in unknown[0].title


def test_nuclei_parse():
    line = json.dumps({"template-id": "x", "info": {"name": "Alte Firmware", "severity": "high",
                       "classification": {"cve-id": ["CVE-2023-1234"], "cvss-score": 8.1}, "reference": ["https://a"]}})
    f = NucleiScanPlugin().parse(line + "\nkaputt\n", host())
    assert f[0].severity == Severity.HIGH and f[0].cve_ids == ["CVE-2023-1234"] and f[0].cvss_score == 8.1


def test_lynis_parse():
    f = LynisAuditPlugin().parse("warning[]=AUTH-9286|Configure minimum password age|-|-|\nfoo=bar", host())
    assert len(f) == 1 and "AUTH-9286" in f[0].recommendation


def test_testssl_parse():
    data = json.dumps([
        {"id": "SSLv3", "severity": "HIGH", "finding": "offered"},
        {"id": "TLS1_3", "severity": "OK", "finding": "offered"},
        {"id": "heartbleed", "severity": "CRITICAL", "finding": "VULNERABLE", "cve": "CVE-2014-0160"},
    ])
    web = host(asset_type=AssetType.WEB_SERVICE, url="https://x.example")
    f = TLSAuditPlugin().parse(data, web)
    assert len(f) == 2 and f[1].cve_ids == ["CVE-2014-0160"]


class FakeResponse:
    def __init__(self, url, headers):
        self.url, self.headers = url, headers


class FakeSession:
    def __init__(self, resp):
        self.resp = resp

    def get(self, *a, **kw):
        return self.resp


def test_header_check_finds_missing_headers():
    resp = FakeResponse("http://x.example/", {"Server": "nginx/1.18.0"})
    web = host(asset_type=AssetType.WEB_SERVICE, url="http://x.example")
    titles = [f.title for f in HTTPHeadersPlugin(session=FakeSession(resp)).run(web)]
    assert any("HTTPS" in t for t in titles)
    assert any("content-security-policy fehlt" in t for t in titles)
    assert any("verrät Software" in t for t in titles)


def test_header_check_good_site_is_clean():
    resp = FakeResponse("https://x.example/", {
        "Strict-Transport-Security": "max-age=31536000", "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=()",
    })
    web = host(asset_type=AssetType.WEB_SERVICE, url="https://x.example")
    assert HTTPHeadersPlugin(session=FakeSession(resp)).run(web) == []


class FakeTxt:
    def __init__(self, s):
        self.strings = [s.encode()]


class FakeResolver:
    def __init__(self, records):
        self.records = records

    def resolve(self, name, kind):
        import dns.resolver
        if name not in self.records:
            raise dns.resolver.NXDOMAIN()
        return [FakeTxt(r) for r in self.records[name]]


def test_email_dns_missing_and_weak():
    r = {x["id"]: x for x in check_email_dns("toyverse.example", FakeResolver({}))}
    assert not r["spf"]["ok"] and not r["dmarc"]["ok"] and r["spf"]["severity"] == "high"
    r = {x["id"]: x for x in check_email_dns("toyverse.example", FakeResolver({
        "toyverse.example": ["v=spf1 include:mail.example -all"],
        "_dmarc.toyverse.example": ["v=DMARC1; p=none"],
    }))}
    assert r["spf"]["ok"] and not r["dmarc"]["ok"] and r["dmarc"]["severity"] == "medium"


def test_wifi_parse_and_evil_twin(tmp_path):
    out = "Zuhause:AA\\:BB\\:CC\\:DD\\:EE\\:01:WPA3:6:80\nZuhause:66\\:77\\:88\\:99\\:00\\:11::1:90\nCafe:11\\:22\\:33\\:44\\:55\\:66::11:40\n"
    nets = parse_nmcli(out)
    assert nets[0]["bssid"] == "aa:bb:cc:dd:ee:01" and nets[0]["level"] == "wpa3" and nets[1]["level"] == "open"
    cfg = tmp_path / "o.yaml"
    cfg.write_text("known_wifi_networks:\n  - {ssid: Zuhause, security: WPA3, bssids: ['aa:bb:cc:dd:ee:01']}\n")
    f = WifiGuardPlugin(overrides_path=cfg).evaluate(nets, host(is_local=True))
    twins = [x for x in f if "Zwilling" in x.title]
    assert len(twins) == 1 and twins[0].severity == Severity.HIGH
    assert any("offene WLANs" in x.title for x in f)


def test_gitleaks_parse_redacted_and_critical_for_keys():
    data = json.dumps([
        {"RuleID": "generic-api-key", "File": "a.env", "StartLine": 3, "Secret": "REDACTED", "Commit": "abc"},
        {"RuleID": "private-key", "File": "id_rsa", "StartLine": 1, "Secret": "REDACTED"},
    ])
    repo = host(asset_type=AssetType.CODE_REPOSITORY, path=".")
    f = SecretsScanPlugin().parse(data, repo)
    assert [x.severity for x in f] == [Severity.HIGH, Severity.CRITICAL]
    assert all("REDACTED" not in x.description for x in f)


def test_osv_parse():
    data = json.dumps({"results": [{"source": {"path": "requirements.txt"}, "packages": [{
        "package": {"name": "requests", "version": "2.0.0"},
        "groups": [{"ids": ["GHSA-x"], "max_severity": "7.5"}],
        "vulnerabilities": [{"id": "GHSA-x", "aliases": ["CVE-2024-35195"], "summary": "Leak"}],
    }]}]})
    f = DependencyAuditPlugin().parse(data, host(asset_type=AssetType.CODE_REPOSITORY, path="."))
    assert f[0].severity == Severity.HIGH and f[0].cve_ids == ["CVE-2024-35195"] and f[0].cvss_score == 7.5


def test_trivy_parse():
    data = json.dumps({"Results": [{"Vulnerabilities": [{
        "VulnerabilityID": "CVE-2024-1", "PkgName": "openssl", "InstalledVersion": "3.0.1", "FixedVersion": "3.0.14",
        "Severity": "CRITICAL", "Title": "Bug", "CVSS": {"nvd": {"V3Score": 9.8}},
    }]}]})
    f = ContainerScanPlugin().parse(data, host(asset_type=AssetType.CONTAINER_IMAGE, image="x:1"))
    assert f[0].severity == Severity.CRITICAL and f[0].cvss_score == 9.8 and "3.0.14" in f[0].recommendation


def test_time_sync():
    assert parse_chrony("System time     : 7.123 seconds slow of NTP time") == 7.123
    node = host(asset_type=AssetType.TOYCHAIN_NODE, is_local=True)
    assert TimeSyncPlugin().evaluate(7.1, True, node)[0].severity == Severity.HIGH
    assert TimeSyncPlugin().evaluate(0.01, True, node) == []
    assert TimeSyncPlugin().evaluate(None, False, host(is_local=True))[0].severity == Severity.MEDIUM


Addr = namedtuple("Addr", "ip port")
Conn = namedtuple("Conn", "status laddr")


def test_toynode_rpc_exposed_and_key_perms(tmp_path):
    key = tmp_path / "bls.key"
    key.write_text("x")
    key.chmod(0o644)
    wallet = tmp_path / "wallet.json"
    wallet.write_text("{}")
    cfg = tmp_path / "toynode.yaml"
    cfg.write_text(f"process_names: [toy-node]\nrpc_ports: [8545]\nvalidator_key_files: ['{key}']\nmoney_key_indicators: ['{wallet}']\n")
    plugin = ToyNodeAuditPlugin(config_path=cfg)
    node = host(asset_type=AssetType.TOYCHAIN_NODE, is_local=True)
    conns = [Conn(psutil.CONN_LISTEN, Addr("0.0.0.0", 8545)), Conn(psutil.CONN_LISTEN, Addr("127.0.0.1", 8546))]
    assert len(plugin.check_listening(conns, node)) == 1
    keys = plugin.check_key_files(node)
    assert {f.severity for f in keys} == {Severity.CRITICAL, Severity.HIGH}
    key.chmod(0o600)
    assert len(plugin.check_key_files(node)) == 1


def test_toycoin_allowlist_survives_base_update(tmp_path):
    """Kernvorgabe: nur der offizielle ToyCoin-Miner ist erlaubt, auch nach einem Feed-Update."""
    base = tmp_path / "base.yaml"
    base.write_text("cryptominers:\n  severity: critical\n  patterns: [xmrig, toycoinminer]\nallowlist: []\n")
    plugin = UnwantedSoftwarePlugin(signatures_path=base, overrides_path=CONFIG / "local_overrides.yaml")
    assert plugin._is_allowlisted("/usr/bin/toycoinminer --wallet toypay")
    assert not plugin._is_allowlisted("/tmp/xmrig -o pool")
