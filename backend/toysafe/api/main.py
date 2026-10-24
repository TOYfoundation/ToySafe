"""ToySafe-API: die Schnittstelle zwischen Cockpit (Web/Desktop/Handy) und Engine.

Sicherheit der API selbst:
- Ohne TOYSAFE_API_TOKEN nimmt die API Steuerbefehle nur von diesem Rechner
  (127.0.0.1/::1) an. Mit Token muss jeder Aufruf `Authorization: Bearer <token>`
  mitschicken.
- Jeder Scan braucht eine bestätigte Startfreigabe (Scope), die protokolliert wird.
"""
from __future__ import annotations

import hmac
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from toysafe import __version__
from toysafe.core import content, scope as scope_mod
from toysafe.core.jobs import JobManager
from toysafe.core.models import Asset, AssetType
from toysafe.core.plugin_base import PHASE_LABEL_DE
from toysafe.core.report import ReportGenerator
from toysafe.core.scheduler import UpdateScheduler
from toysafe.core.updater import read_status, run_update_job
from toysafe.plugins import build_default_registry, prepare_registry
from toysafe.plugins.email_dns import check_email_dns
from toysafe.plugins.http_headers import check_headers

logger = logging.getLogger("toysafe.api")

registry = build_default_registry()
jobs = JobManager(registry)
scheduler = UpdateScheduler.from_env()


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="ToySafe API", version=__version__, lifespan=lifespan)

_cors = [o.strip() for o in os.getenv("TOYSAFE_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

LOCAL_CLIENTS = {"127.0.0.1", "::1", "localhost", "testclient"}


def require_auth(request: Request) -> None:
    token = os.getenv("TOYSAFE_API_TOKEN")
    if token:
        sent = request.headers.get("authorization", "")
        if not hmac.compare_digest(sent.encode(), f"Bearer {token}".encode()):
            raise HTTPException(401, "Zugangsschlüssel fehlt oder ist falsch.")
        return
    client = request.client.host if request.client else ""
    if client not in LOCAL_CLIENTS:
        raise HTTPException(403, "Ohne TOYSAFE_API_TOKEN nimmt ToySafe Befehle nur vom eigenen Rechner an.")


# -- Eingabemodelle -------------------------------------------------------------

class ScopeIn(BaseModel):
    operator: str = Field(min_length=1, max_length=120)
    confirmed: bool
    networks: list[str] = Field(default_factory=list, max_length=64)
    allow_public_targets: bool = False
    statement_version: str = scope_mod.STATEMENT_VERSION


class AssetIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    asset_type: AssetType
    ip_address: str = ""
    hostname: Optional[str] = None
    url: Optional[str] = None
    path: Optional[str] = None
    image: Optional[str] = None
    mac_address: Optional[str] = None
    criticality: int = Field(3, ge=1, le=5)
    externally_reachable: bool = False
    is_local: bool = False
    owner: Optional[str] = None

    def to_asset(self) -> Asset:
        return Asset(**self.model_dump())


class ScanRequest(BaseModel):
    scope: ScopeIn
    assets: list[AssetIn] = Field(min_length=1, max_length=256)


class UrlCheck(BaseModel):
    url: str = Field(max_length=2048)


class DomainCheck(BaseModel):
    domain: str = Field(min_length=3, max_length=253)


# -- Endpunkte --------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"name": "ToySafe", "version": __version__, "auth": "token" if os.getenv("TOYSAFE_API_TOKEN") else "local-only",
            "auto_update_hours": scheduler.interval_hours}


@app.get("/api/modules")
def modules():
    return [
        {
            "name": p.name, "category": p.category, "tool": p.kali_equivalent,
            "phase": p.phase.value, "phase_label": PHASE_LABEL_DE[p.phase],
            "station": p.station.value, "explanation": p.explanation,
            "available": _available(p),
        }
        for p in registry.plugins
    ]


def _available(plugin) -> bool:
    try:
        return plugin.is_available()
    except Exception:
        return False


@app.get("/api/scope/statement")
def scope_statement():
    return {"version": scope_mod.STATEMENT_VERSION, "text": scope_mod.STATEMENT_DE, "hash": scope_mod.statement_hash()}


@app.get("/api/scope/log", dependencies=[Depends(require_auth)])
def scope_log(limit: int = 50):
    return scope_mod.read_log(limit=min(limit, 500))


@app.post("/api/scans", dependencies=[Depends(require_auth)], status_code=202)
def start_scan(req: ScanRequest):
    assets = [a.to_asset() for a in req.assets]
    declaration = scope_mod.ScopeDeclaration(**req.scope.model_dump())
    try:
        scope_mod.validate_scope(declaration, assets)
    except scope_mod.ScopeError as err:
        raise HTTPException(422, {"message": "Startfreigabe unvollständig", "problems": err.problems})
    scope_mod.log_confirmation(declaration, assets)
    prepare_registry(registry, assets)
    job = jobs.start(assets, operator=declaration.operator)
    return job.summary()


@app.get("/api/scans", dependencies=[Depends(require_auth)])
def list_scans():
    return [j.summary() for j in jobs.list()]


@app.get("/api/scans/{job_id}", dependencies=[Depends(require_auth)])
def get_scan(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Scan nicht gefunden")
    data = job.summary()
    data["findings"] = job.findings
    data["assets"] = job.assets
    return data


@app.get("/api/scans/{job_id}/report", dependencies=[Depends(require_auth)])
def scan_report(job_id: str, format: Literal["html", "markdown", "pdf"] = "html"):
    job = jobs.get(job_id)
    if not job or job.status != "done":
        raise HTTPException(404, "Kein fertiger Scan mit dieser Kennung")
    gen = ReportGenerator(job.findings, job.assets)
    if format == "markdown":
        return PlainTextResponse(gen.to_markdown(), media_type="text/markdown; charset=utf-8")
    if format == "pdf":
        try:
            return Response(gen.to_pdf(), media_type="application/pdf",
                            headers={"Content-Disposition": f'attachment; filename="toysafe-{job_id}.pdf"'})
        except ImportError:
            raise HTTPException(501, "PDF-Export braucht WeasyPrint: pip install weasyprint")
    return HTMLResponse(gen.to_html())


@app.post("/api/updates/run", dependencies=[Depends(require_auth)])
def updates_run():
    results = run_update_job(signatures_feed_url=os.getenv("SIGNATURES_FEED_URL"))
    return [r.__dict__ for r in results]


@app.get("/api/updates/status")
def updates_status():
    return read_status() or {"at": None, "results": []}


@app.post("/api/checks/headers", dependencies=[Depends(require_auth)])
def quick_headers(body: UrlCheck):
    if urlparse(body.url).scheme not in ("http", "https"):
        raise HTTPException(422, "Nur http- und https-Adressen")
    try:
        return {"url": body.url, "results": check_headers(body.url)}
    except Exception as exc:
        raise HTTPException(502, f"Seite nicht erreichbar: {exc}")


@app.post("/api/checks/email-dns", dependencies=[Depends(require_auth)])
def quick_email_dns(body: DomainCheck):
    try:
        return {"domain": body.domain, "results": check_email_dns(body.domain)}
    except Exception as exc:
        raise HTTPException(502, f"DNS-Abfrage fehlgeschlagen: {exc}")


@app.get("/api/content/{name}")
def get_content(name: str):
    try:
        return content.load(name)
    except (KeyError, FileNotFoundError):
        raise HTTPException(404, "Unbekannter Inhalt")


# -- Cockpit ausliefern (wenn gebaut) ------------------------------------------------

_dist = Path(os.getenv("TOYSAFE_FRONTEND_DIST", Path(__file__).resolve().parents[3] / "frontend" / "dist"))
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="cockpit")
