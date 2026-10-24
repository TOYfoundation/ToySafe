from pathlib import Path

import pytest

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.priority import priority_score, sort_findings
from toysafe.core.registry import PluginRegistry
from toysafe.core.plugin_base import Plugin, ScanPhase
from toysafe.core.report import ReportGenerator
from toysafe.core.score import shield_strength
from toysafe.core.scope import ScopeDeclaration, ScopeError, log_confirmation, read_log, validate_scope
from toysafe.core.updater import KEVCatalog


def asset(id="a", **kw):
    base = dict(id=id, name=id.upper(), asset_type=AssetType.HOST, ip_address="192.168.1.10")
    base.update(kw)
    return Asset(**base)


def finding(sev=Severity.MEDIUM, asset_id="a", **kw):
    kw.setdefault("description", "")
    return Finding(id=f"f-{sev.value}-{asset_id}", asset_id=asset_id, title=f"t {sev.value}",
                   severity=sev, source_plugin="test", **kw)


# -- Priorisierung -----------------------------------------------------------------

def test_kev_beats_everything():
    a = asset()
    kev = finding(Severity.LOW, cvss_score=3.0, is_actively_exploited=True)
    crit = finding(Severity.CRITICAL, cvss_score=10.0)
    assert sort_findings([crit, kev], {"a": a})[0] is kev


def test_severity_fallback_when_no_cvss():
    a = asset()
    assert priority_score(finding(Severity.HIGH), a) > priority_score(finding(Severity.LOW), a)


def test_external_asset_ranks_higher():
    inside, outside = asset("in"), asset("out", externally_reachable=True)
    f_in, f_out = finding(asset_id="in"), finding(asset_id="out")
    assert sort_findings([f_in, f_out], {"in": inside, "out": outside})[0] is f_out


def test_unknown_asset_does_not_crash():
    assert sort_findings([finding(asset_id="ghost")], {})


# -- Schildstärke ---------------------------------------------------------------------

def test_score_perfect_without_findings():
    s = shield_strength([], [asset()])
    assert s["score"] == 100 and s["grade"] == "stabil"


def test_score_drops_and_stays_positive():
    many = [finding(Severity.CRITICAL) for _ in range(30)]
    s = shield_strength(many, [asset()])
    assert 0 <= s["score"] < 5 and s["grade"] == "kritisch"


def test_info_findings_do_not_lower_score():
    assert shield_strength([finding(Severity.INFO)] * 20, [asset()])["score"] == 100


def test_station_scores_present():
    s = shield_strength([finding(Severity.HIGH, station=Station.VAULT)], [asset()])
    assert s["stations"]["vault"] < 100 and s["stations"]["radar"] == 100


# -- Startfreigabe ------------------------------------------------------------------

def scope(**kw):
    base = dict(operator="Anna", confirmed=True, networks=["192.168.1.0/24"])
    base.update(kw)
    return ScopeDeclaration(**base)


def test_scope_ok_for_private_network():
    validate_scope(scope(), [asset(), asset("seg", asset_type=AssetType.NETWORK_SEGMENT, ip_address="192.168.1.0/25")])


def test_scope_requires_confirmation():
    with pytest.raises(ScopeError) as e:
        validate_scope(scope(confirmed=False), [asset()])
    assert any("bestätigt" in p for p in e.value.problems)


def test_scope_rejects_target_outside_network():
    with pytest.raises(ScopeError):
        validate_scope(scope(), [asset(ip_address="10.0.0.5")])


def test_scope_rejects_wider_segment():
    with pytest.raises(ScopeError):
        validate_scope(scope(), [asset(asset_type=AssetType.NETWORK_SEGMENT, ip_address="192.168.0.0/16")])


def test_scope_public_ip_needs_explicit_flag():
    s = scope(networks=["203.0.113.0/24", "8.8.8.0/24"])
    with pytest.raises(ScopeError):
        validate_scope(s, [asset(ip_address="8.8.8.8")])
    validate_scope(scope(networks=["8.8.8.0/24"], allow_public_targets=True), [asset(ip_address="8.8.8.8")])


def test_scope_domains():
    web = asset("web", asset_type=AssetType.WEB_SERVICE, ip_address="", url="https://www.toyverse.example/")
    with pytest.raises(ScopeError):
        validate_scope(scope(), [web])
    validate_scope(scope(networks=["toyverse.example"], allow_public_targets=True), [web])
    with pytest.raises(ScopeError):  # fremde Domain, die nur ähnlich aussieht
        evil = asset("evil", asset_type=AssetType.WEB_SERVICE, ip_address="", url="https://toyverse.example.evil.test")
        validate_scope(scope(networks=["toyverse.example"], allow_public_targets=True), [evil])


def test_scope_local_repo_needs_no_network():
    repo = asset("repo", asset_type=AssetType.CODE_REPOSITORY, ip_address="", path=".")
    validate_scope(scope(networks=[]), [repo])


def test_scope_log_roundtrip(tmp_path: Path):
    log = tmp_path / "log.jsonl"
    log_confirmation(scope(), [asset()], log_path=log)
    entries = read_log(log_path=log)
    assert entries[0]["operator"] == "Anna" and entries[0]["asset_ids"] == ["a"]


# -- Registry ---------------------------------------------------------------------------

class FakePlugin(Plugin):
    category = "Test"
    kali_equivalent = "fake"

    def __init__(self, name, phase, available=True, boom=False, only=None):
        self.name, self.phase, self._available, self._boom, self._only = name, phase, available, boom, only

    def is_available(self):
        return self._available

    def applies_to(self, a):
        return self._only is None or a.asset_type == self._only

    def run(self, a):
        if self._boom:
            raise RuntimeError("kaputt")
        return [self.finding(a, f"{self.name} fand etwas", Severity.LOW, cve_ids=["CVE-2024-0001"])]


def test_registry_order_skip_error_and_kev(tmp_path):
    kev_file = tmp_path / "kev.json"
    kev_file.write_text('{"cve_ids": ["CVE-2024-0001"]}')
    reg = PluginRegistry(kev_catalog=KEVCatalog(cache_path=kev_file))
    reg.register(FakePlugin("late", ScanPhase.DEEP_DIVE))
    reg.register(FakePlugin("early", ScanPhase.DISCOVERY))
    reg.register(FakePlugin("missing", ScanPhase.VULNERABILITY_SCAN, available=False))
    reg.register(FakePlugin("broken", ScanPhase.CONFIG_AUDIT, boom=True))
    reg.register(FakePlugin("netonly", ScanPhase.DISCOVERY, only=AssetType.NETWORK_DEVICE))
    events = []
    findings = reg.run_scan([asset()], progress=events.append)

    steps = [e.plugin for e in events if e.kind == "step"]
    assert steps == ["early", "broken", "late"]
    assert any(e.kind == "skip" and e.plugin == "missing" for e in events)
    assert any(e.kind == "error" and e.plugin == "broken" for e in events)
    assert events[-1].kind == "done"
    assert all(f.is_actively_exploited for f in findings if f.cve_ids)
    assert any("unvollständig" in f.title for f in findings)


# -- Bericht -------------------------------------------------------------------------------

def test_report_escapes_tool_output():
    evil = finding(Severity.HIGH, description='<script>alert(1)</script>', reference_url="javascript:alert(1)")
    evil.title = '<img src=x onerror=alert(1)>'
    html = ReportGenerator([evil], [asset()]).to_html()
    assert "<script>alert" not in html and "<img src=x" not in html
    assert "javascript:" not in html
    assert "Schildstärke" in html


def test_report_markdown_has_score_and_top():
    md = ReportGenerator([finding(Severity.CRITICAL)], [asset()]).to_markdown()
    assert "Schildstärke" in md and "Dringendste Funde" in md


def test_finished_scans_survive_restart(tmp_path: Path):
    from toysafe.core.jobs import JobManager
    from toysafe.core.plugin_base import ScanPhase
    from toysafe.core.registry import PluginRegistry
    from toysafe.core.updater import KEVCatalog
    from toysafe.core.models import Asset, AssetType

    reg = PluginRegistry(kev_catalog=KEVCatalog(cache_path=tmp_path / "kev.json"))
    reg.register(FakePlugin("fake", ScanPhase.DISCOVERY))
    store = tmp_path / "scans"
    first = JobManager(reg, store_dir=store)
    job = first.start([Asset("r", "Router", AssetType.NETWORK_DEVICE, "192.168.1.1")], operator="Anna", background=False)
    saved = store / f"{job.id}.json"
    assert saved.exists() and (saved.stat().st_mode & 0o777) == 0o600

    second = JobManager(reg, store_dir=store)  # simulates a restart
    again = second.get(job.id)
    assert again is not None and again.status == "done"
    assert again.findings[0].title == job.findings[0].title
    assert again.findings[0].severity == job.findings[0].severity and again.score == job.score
    (store / "kaputt.json").write_text("{nicht json", encoding="utf-8")
    assert JobManager(reg, store_dir=store).get(job.id) is not None  # broken files are skipped


def test_wait_for_change_wakes_on_progress(tmp_path: Path):
    from toysafe.core.jobs import JobManager
    from toysafe.core.registry import PluginRegistry
    from toysafe.core.updater import KEVCatalog
    from toysafe.core.models import Asset, AssetType

    reg = PluginRegistry(kev_catalog=KEVCatalog(cache_path=tmp_path / "kev.json"))
    mgr = JobManager(reg)
    job = mgr.start([Asset("r", "Router", AssetType.NETWORK_DEVICE, "192.168.1.1")], operator="Anna", background=False)
    assert mgr.wait_for_change(job.id, since_version=0, timeout=0.1).status == "done"
    assert mgr.wait_for_change("fehlt", since_version=0, timeout=0.1) is None
