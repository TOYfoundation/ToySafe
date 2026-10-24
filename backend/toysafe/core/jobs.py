"""Scan-Jobs im Hintergrund, damit das Cockpit den Fortschritt live zeigen kann."""
from __future__ import annotations

import threading
import uuid
from dataclasses import asdict, dataclass, field
from typing import Optional

from toysafe.core.models import Asset, Finding, utcnow
from toysafe.core.priority import sort_findings
from toysafe.core.registry import PluginRegistry, ScanEvent
from toysafe.core.score import shield_strength

MAX_JOBS = 20


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

    def summary(self) -> dict:
        data = asdict(self)
        data.pop("findings")
        data.pop("assets")
        data["asset_count"] = len(self.assets)
        data["finding_count"] = len(self.findings)
        return data


class JobManager:
    def __init__(self, registry: PluginRegistry) -> None:
        self._registry = registry
        self._jobs: dict[str, ScanJob] = {}
        self._lock = threading.Lock()

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

    def _trim(self) -> None:
        if len(self._jobs) <= MAX_JOBS:
            return
        finished = [j for j in self.list() if j.status in ("done", "failed")]
        for old in finished[MAX_JOBS // 2:]:
            self._jobs.pop(old.id, None)

    def _run(self, job: ScanJob) -> None:
        job.status = "running"

        def on_event(event: ScanEvent) -> None:
            job.step, job.total_steps = event.step, event.total_steps
            if event.phase:
                job.phase = event.phase
            if event.kind == "step":
                job.current = event.message
            job.log.append({"at": utcnow().isoformat(), "kind": event.kind, "message": event.message})
            del job.log[:-200]

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
