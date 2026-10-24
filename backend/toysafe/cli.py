"""Kommandozeile: Scan mit Startfreigabe, Bericht, Updates und Modulübersicht.

Beispiele:
    python -m toysafe.cli modules
    python -m toysafe.cli scan assets.example.json --operator "Anna" \
        --network 192.168.1.0/24 --yes --format html --out logbuch
    python -m toysafe.cli update
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from toysafe.core import scope as scope_mod
from toysafe.core.models import Asset, AssetType
from toysafe.core.report import ReportGenerator
from toysafe.core.score import shield_strength
from toysafe.core.updater import run_update_job
from toysafe.plugins import build_default_registry, prepare_registry


def load_assets(path: Path) -> list[Asset]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [Asset(**{**a, "asset_type": AssetType(a["asset_type"])}) for a in raw]


def cmd_modules(_: argparse.Namespace) -> int:
    for p in build_default_registry().plugins:
        mark = "✔" if p.is_available() else "·"
        print(f"{mark} {p.phase.value:<15} {p.name:<24} {p.kali_equivalent}")
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    assets = load_assets(args.assets_file)
    print(scope_mod.STATEMENT_DE, "\n")
    confirmed = args.yes or input("Bestätigen? (ja/nein) ").strip().lower() in ("ja", "j", "yes", "y")
    declaration = scope_mod.ScopeDeclaration(
        operator=args.operator, confirmed=confirmed, networks=args.network,
        allow_public_targets=args.allow_public,
    )
    try:
        scope_mod.validate_scope(declaration, assets)
    except scope_mod.ScopeError as err:
        print("Startfreigabe abgelehnt:")
        for p in err.problems:
            print("  -", p)
        return 2
    scope_mod.log_confirmation(declaration, assets)

    registry = prepare_registry(build_default_registry(), assets)
    findings = registry.run_scan(assets, progress=lambda e: print(f"[{e.step}/{e.total_steps}] {e.message}"))
    gen = ReportGenerator(findings, assets)
    score = shield_strength(findings, assets)

    if args.format == "markdown":
        out = args.out.with_suffix(".md")
        out.write_text(gen.to_markdown(), encoding="utf-8")
    elif args.format == "pdf":
        out = args.out.with_suffix(".pdf")
        out.write_bytes(gen.to_pdf())
    else:
        out = args.out.with_suffix(".html")
        out.write_text(gen.to_html(), encoding="utf-8")
    print(f"\nSchildstärke {score['score']}/100 – {score['label']}. Bericht: {out}")
    return 0


def cmd_update(_: argparse.Namespace) -> int:
    import os

    for r in run_update_job(signatures_feed_url=os.getenv("SIGNATURES_FEED_URL")):
        print(f"[{'OK' if r.success else 'FEHLER'}] {r.step}: {r.detail}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="toysafe", description="ToySafe – Sicherheits-Cockpit für das ToyVerse")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("modules", help="Module und installierte Werkzeuge anzeigen").set_defaults(fn=cmd_modules)

    scan = sub.add_parser("scan", help="Scan mit Startfreigabe durchführen und Bericht speichern")
    scan.add_argument("assets_file", type=Path)
    scan.add_argument("--operator", required=True, help="Wer startet den Scan?")
    scan.add_argument("--network", action="append", default=[], help="Freigegebenes Netz/Domain (mehrfach möglich)")
    scan.add_argument("--allow-public", action="store_true", help="Öffentliche Ziele ausdrücklich erlauben")
    scan.add_argument("--yes", action="store_true", help="Erklärung ohne Rückfrage bestätigen")
    scan.add_argument("--format", choices=["markdown", "html", "pdf"], default="html")
    scan.add_argument("--out", type=Path, default=Path("logbuch"))
    scan.set_defaults(fn=cmd_scan)

    sub.add_parser("update", help="Bedrohungsdaten aktualisieren").set_defaults(fn=cmd_update)

    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
