"""Scan-Jobs im Hintergrund, damit das Cockpit den Fortschritt live zeigen kann.

- Jede Änderung an einem Job erhöht `version`. Wer auf Neuigkeiten wartet
  (`wait_for_change`), wird sofort geweckt. Darauf baut der Live-Strom
  (Server-Sent Events) der API auf, statt dass das Cockpit ständig nachfragt.
- Fertige Jobs werden optional als JSON-Datei abgelegt (`store_dir`) und beim
  Start wieder geladen, damit das Logbuch einen Neustart übersteht. Die Dateien
  enthalten Gerätedetails und werden deshalb nur für den eigenen Benutzer
  lesbar gespeichert (Rechte 600).
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station, utcnow
from toysafe.core.priority import sort_findings
from toysafe.core.registry import PluginRegistry, ScanEvent
from toysafe.core.score import shield_strength

logger = logging.getLogger("toysafe.jobs")

MAX_JOBS = 20
FINISHED = ("done", "failed")


@dataclass
class ScanJob:
    id: str
    operator: str
    assets: list[Asset]
    status: str = "queued"          # queued | running | done | failed
    created_at: str = field(default_factory=lambda: utcnow().isoformat())
    finished_at: Optional[str] = None
    phase: Optional[str] = None
    current: Optional[str] = None
    step: int = 0
    total_steps: int = 0
    log: list[dict] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    score: Optional[dict] = None
    error: Optional[str] = None
    version: int = 0                # steigt bei jeder Änderung (für den Live-Strom)

    def summary(self) -> dict:
        data = asdict(self)
        data.pop("findings")
        data.pop("assets")
        data["asset_count"] = len(self.assets)
        data["finding_count"] = len(self.findings)
        return data


# -- Speichern und Laden ----------------------------------------------------------

def _json_default(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"nicht speicherbar: {type(value).__name__}")


def job_to_json(job: ScanJob) -> str:
    return json.dumps(asdict(job), default=_json_default, ensure_ascii=False)


def job_from_dict(data: dict) -> ScanJob:
    assets = [Asset(**{**a, "asset_type": AssetType(a["asset_type"])}) for a in data.get("assets", [])]
    findings = [
        Finding(**{
            **f,
            "severity": Severity(f["severity"]),
            "station": Station(f.get("station", Station.SHIELDS.value)),
            "discovered_at": datetime.fromisoformat(f["discovered_at"]),
        })
        for f in data.get("findings", [])
    ]
    known = {k: v for k, v in data.items() if k in ScanJob.__dataclass_fields__ and k not in ("assets", "findings")}
    return ScanJob(**{**known, "assets": assets, "findings": findings})


class JobStore:
    """Ablage fertiger Scans als je eine JSON-Datei."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def save(self, job: ScanJob) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        target = self.directory / f"{job.id}.json"
        tmp = target.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(job_to_json(job))
        os.replace(tmp, target)

    def delete(self, job_id: str) -> None:
        (self.directory / f"{job_id}.json").unlink(missing_ok=True)

    def load_all(self) -> list[ScanJob]:
        if not self.directory.is_dir():
            return []
        jobs = []
        for path in self.directory.glob("*.json"):
            try:
                jobs.append(job_from_dict(json.loads(path.read_text(encoding="utf-8"))))
            except Exception:  # eine kaputte Datei darf den Start nicht verhindern
                logger.warning("Scan-Datei %s ist nicht lesbar und wird übersprungen", path.name)
        return jobs


class JobManager:
    def __init__(self, registry: PluginRegistry, store_dir: Optional[Path] = None) -> None:
        self._registry = registry
        self._jobs: dict[str, ScanJob] = {}
        self._lock = threading.Lock()
        self._changed = threading.Condition(self._lock)
        self._store = JobStore(store_dir) if store_dir else None
        if self._store:
            for job in sorted(self._store.load_all(), key=lambda j: j.created_at, reverse=True)[:MAX_JOBS]:
                self._jobs[job.id] = job

    def start(self, assets: list[Asset], operator: str, background: bool = True) -> ScanJob:
        job = ScanJob(id=uuid.uuid4().hex[:12], operator=operator, assets=assets)
        with self._lock:
            self._jobs[job.id] = job
            self._trim()
        if background:
            threading.Thread(target=self._run, args=(job,), daemon=True, name=f"scan-{job.id}").start()
        else:
            self._run(job)
        return job

    def get(self, job_id: str) -> Optional[ScanJob]:
        return self._jobs.get(job_id)

    def list(self) -> list[ScanJob]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def wait_for_change(self, job_id: str, since_version: int, timeout: float) -> Optional[ScanJob]:
        """Blockiert, bis sich der Job nach `since_version` geändert hat oder die Zeit abläuft."""
        with self._changed:
            self._changed.wait_for(
                lambda: (j := self._jobs.get(job_id)) is None or j.version > since_version or j.status in FINISHED,
                timeout=timeout,
            )
            return self._jobs.get(job_id)

    def _touch(self, job: ScanJob) -> None:
        with self._changed:
            job.version += 1
            self._changed.notify_all()

    def _trim(self) -> None:
        if len(self._jobs) <= MAX_JOBS:
            return
        finished = [j for j in sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True) if j.status in FINISHED]
        for old in finished[MAX_JOBS // 2:]:
            self._jobs.pop(old.id, None)
            if self._store:
                self._store.delete(old.id)

    def _run(self, job: ScanJob) -> None:
        job.status = "running"
        self._touch(job)

        def on_event(event: ScanEvent) -> None:
            job.step, job.total_steps = event.step, event.total_steps
            if event.phase:
                job.phase = event.phase
            if event.kind == "step":
                job.current = event.message
            job.log.append({"at": utcnow().isoformat(), "kind": event.kind, "message": event.message})
            del job.log[:-200]
            self._touch(job)

        try:
            findings = self._registry.run_scan(job.assets, progress=on_event)
            assets_by_id = {a.id: a for a in job.assets}
            job.findings = sort_findings(findings, assets_by_id)
            job.score = shield_strength(job.findings, job.assets)
            job.status = "done"
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
        finally:
            job.current = None
            job.finished_at = utcnow().isoformat()
            if self._store:
                try:
                    self._store.save(job)
                except OSError:
                    logger.exception("Scan %s konnte nicht gespeichert werden", job.id)
            self._touch(job)
