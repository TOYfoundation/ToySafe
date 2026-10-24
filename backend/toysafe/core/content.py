"""Zugriff auf die gemeinsamen Inhalte im Ordner content/ (Level 7,
Notfall-Playbooks, Scam-Regeln, Checklisten). Dieselben Dateien nutzt das
Cockpit und – über die API – das Spiel TOYQUEST.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

CONTENT_DIR = Path(os.getenv("TOYSAFE_CONTENT_DIR", Path(__file__).resolve().parents[3] / "content"))

ALLOWED = {
    "level7": "level7/missions.json",
    "playbooks": "playbooks.json",
    "scam-rules": "scam_rules.json",
    "checklists": "checklists.json",
}


@lru_cache(maxsize=None)
def load(name: str) -> dict:
    if name not in ALLOWED:
        raise KeyError(name)
    return json.loads((CONTENT_DIR / ALLOWED[name]).read_text(encoding="utf-8"))
