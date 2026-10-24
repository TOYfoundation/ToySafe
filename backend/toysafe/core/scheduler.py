"""Einfacher Hintergrund-Takt für den Update-Job (KEV, Nuclei-Templates, Signaturen).

Aktiv, wenn TOYSAFE_AUTO_UPDATE_HOURS > 0 gesetzt ist (Standard: 24).
Für Server ohne dauerhaft laufende API gibt es zusätzlich einen
systemd-Timer unter deploy/systemd/.
"""
from __future__ import annotations

import logging
import os
import threading

from toysafe.core.updater import run_update_job

logger = logging.getLogger("toysafe.scheduler")


class UpdateScheduler:
    def __init__(self, interval_hours: float) -> None:
        self.interval_hours = interval_hours
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @classmethod
    def from_env(cls) -> "UpdateScheduler":
        return cls(float(os.getenv("TOYSAFE_AUTO_UPDATE_HOURS", "24")))

    @property
    def enabled(self) -> bool:
        return self.interval_hours > 0

    def start(self) -> None:
        if not self.enabled or self._thread:
            return
        self._thread = threading.Thread(target=self._loop, daemon=True, name="toysafe-updater")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        # Erster Lauf kurz nach dem Start, danach im eingestellten Takt.
        delay = 30.0
        while not self._stop.wait(delay):
            try:
                run_update_job(signatures_feed_url=os.getenv("SIGNATURES_FEED_URL"))
            except Exception:
                logger.exception("Update-Job fehlgeschlagen")
            delay = self.interval_hours * 3600
