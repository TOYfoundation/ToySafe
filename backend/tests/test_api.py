import time

from fastapi.testclient import TestClient

from toysafe.api import main
from toysafe.core import scope as scope_mod
from toysafe.core.registry import PluginRegistry
from toysafe.core.jobs import JobManager
from toysafe.core.updater import KEVCatalog
from tests.test_core import FakePlugin
from toysafe.core.plugin_base import ScanPhase

client = TestClient(main.app)

BODY = {
    "scope": {"operator": "Anna", "confirmed": True, "networks": ["192.168.1.0/24"]},
    "assets": [{"id": "r", "name": "Router", "asset_type": "network_device", "ip_address": "192.168.1.1"}],
}


def setup_module(_):
    reg = PluginRegistry(kev_catalog=KEVCatalog(cache_path=scope_mod.DATA_DIR / "does-not-exist.json"))
    reg.register(FakePlugin("fake", ScanPhase.DISCOVERY))
    main.registry = reg
    main.jobs = JobManager(reg)


def test_health_and_modules():
    assert client.get("/api/health").json()["name"] == "ToySafe"
    assert isinstance(client.get("/api/modules").json(), list)


def test_statement():
    s = client.get("/api/scope/statement").json()
    assert s["version"] == scope_mod.STATEMENT_VERSION and "Eigentümer" in s["text"]


def test_scan_requires_confirmed_scope(monkeypatch, tmp_path):
    monkeypatch.setattr(scope_mod, "SCOPE_LOG_PATH", tmp_path / "log.jsonl")
    bad = {**BODY, "scope": {**BODY["scope"], "confirmed": False}}
    r = client.post("/api/scans", json=bad)
    assert r.status_code == 422 and r.json()["detail"]["problems"]


def test_scan_rejects_out_of_scope_target():
    bad = {**BODY, "assets": [{**BODY["assets"][0], "ip_address": "10.1.1.1"}]}
    assert client.post("/api/scans", json=bad).status_code == 422


def test_scan_flow_and_report(monkeypatch, tmp_path):
    monkeypatch.setattr(scope_mod, "SCOPE_LOG_PATH", tmp_path / "log.jsonl")
    r = client.post("/api/scans", json=BODY)
    assert r.status_code == 202
    job_id = r.json()["id"]
    for _ in range(50):
        data = client.get(f"/api/scans/{job_id}").json()
        if data["status"] == "done":
            break
        time.sleep(0.05)
    assert data["status"] == "done" and data["score"]["score"] < 100
    assert data["findings"][0]["title"] == "fake fand etwas"
    html = client.get(f"/api/scans/{job_id}/report").text
    assert "ToySafe-Logbuch" in html
    md = client.get(f"/api/scans/{job_id}/report?format=markdown").text
    assert md.startswith("# ToySafe-Logbuch")


def test_token_required_when_configured(monkeypatch):
    monkeypatch.setenv("TOYSAFE_API_TOKEN", "geheim")
    assert client.post("/api/scans", json=BODY).status_code == 401
    ok = client.get("/api/scans", headers={"Authorization": "Bearer geheim"})
    assert ok.status_code == 200


def test_remote_client_blocked_without_token(monkeypatch):
    monkeypatch.delenv("TOYSAFE_API_TOKEN", raising=False)
    remote = TestClient(main.app, client=("192.168.1.50", 5000))
    assert remote.get("/api/scans").status_code == 403


def test_headers_check_rejects_non_http():
    assert client.post("/api/checks/headers", json={"url": "file:///etc/passwd"}).status_code == 422


def test_content_endpoints():
    lvl = client.get("/api/content/level7").json()
    assert lvl["level"] == 7 and len(lvl["missions"]) >= 10
    assert client.get("/api/content/../../etc").status_code == 404
    assert client.get("/api/content/geheim").status_code == 404


def test_live_events_stream_until_done(monkeypatch, tmp_path):
    monkeypatch.setattr(scope_mod, "SCOPE_LOG_PATH", tmp_path / "log.jsonl")
    job_id = client.post("/api/scans", json=BODY).json()["id"]
    events = []
    with client.stream("GET", f"/api/scans/{job_id}/events") as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        for line in r.iter_lines():
            if line.startswith("event: "):
                events.append(line[7:])
            if events and events[-1] == "done" and line.startswith("data: "):
                final = __import__("json").loads(line[6:])
                break
    assert events[-1] == "done" and final["status"] == "done" and final["finding_count"] == 1
    assert client.get("/api/scans/unbekannt/events").status_code == 404
