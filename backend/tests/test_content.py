"""Prüft die gemeinsamen Inhalte, damit Cockpit und Spiel sich darauf verlassen können."""
import json
import math
import re
from pathlib import Path

CONTENT = Path(__file__).resolve().parents[2] / "content"
TYPES = {"dialog", "choice", "multi", "classify", "order", "toggle", "passphrase", "find", "match",
         "chat", "timed", "consensus", "compare"}


def load(name):
    return json.loads((CONTENT / name).read_text(encoding="utf-8"))


def test_level7_structure():
    lvl = load("level7/missions.json")
    assert lvl["level"] == 7
    npcs = {n["id"] for n in lvl["npcs"]}
    locs = {loc["id"] for loc in lvl["locations"]}
    ids = set()
    for m in lvl["missions"]:
        assert m["id"] not in ids
        ids.add(m["id"])
        assert m["npc"] in npcs and m["location"] in locs
        for line in m["intro"] + m["outro"]:
            assert line["npc"] in npcs
        assert m["steps"]
        for s in m["steps"]:
            assert s["type"] in TYPES, s
            if s["type"] == "choice":
                assert sum(o["correct"] for o in s["options"]) == 1
            if s["type"] == "multi":
                assert any(o["correct"] for o in s["options"]) and not all(o["correct"] for o in s["options"])
            if s["type"] == "classify":
                buckets = {b["id"] for b in s["buckets"]}
                assert all(i["answer"] in buckets for i in s["items"])
            if s["type"] == "find":
                assert sum(line["suspicious"] for line in s["lines"]) == s["need"]
            if s["type"] == "match":
                assert set(s["solution"]) == {x["id"] for x in s["left"]}
                assert set(s["solution"].values()) == {x["id"] for x in s["right"]}
            if s["type"] == "toggle":
                assert any(i["initial"] != i["target"] for i in s["items"])
            if s["type"] == "chat":
                for turn in s["turns"]:
                    assert sum(o["correct"] for o in turn["options"]) == 1
            if s["type"] == "timed":
                buckets = {b["id"] for b in s["buckets"]}
                assert all(i["answer"] in buckets for i in s["items"])
                assert 0 < s["pass"] <= len(s["items"]) and s["seconds"] >= 20
            if s["type"] == "consensus":
                n = len(s["members"])
                need = math.ceil(n * s["threshold"] - 0.01)
                yes = sum(m["stance"] == "yes" for m in s["members"])
                persuadable = [m for m in s["members"] if m["stance"] != "yes"]
                assert yes < need <= n, "gate must start closed and be openable"
                for m in persuadable:
                    assert sum(o["correct"] for o in m["options"]) == 1
            if s["type"] == "compare":
                for pair in s["pairs"]:
                    assert (pair["a"] == pair["b"]) == pair["same"]
    assert any(m.get("boss") for m in lvl["missions"])
    assert any("team" in m for m in lvl["missions"])
    assert lvl["missions"][-1].get("boss"), "boss mission comes last"
    for loc in lvl["locations"]:
        assert 0 <= loc["x"] <= 100 and 0 <= loc["y"] <= 100


def test_level7_never_asks_for_real_secrets():
    text = (CONTENT / "level7/missions.json").read_text(encoding="utf-8").lower()
    assert "übungs" in text  # Passphrase-Aufgaben sind als Übung gekennzeichnet
    lvl = load("level7/missions.json")
    for m in lvl["missions"]:
        for s in m["steps"]:
            if s["type"] == "passphrase":
                assert "übungs" in s["prompt"].lower()


def test_scam_rules_compile():
    rules = load("scam_rules.json")
    for r in rules["rules"]:
        assert 0 < r["weight"] <= 100 and r["fact"]
        for p in r["patterns"]:
            re.compile(p, re.I)


def test_playbooks_and_checklists():
    pb = load("playbooks.json")
    phases = {p["id"] for p in pb["phases"]}
    for p in pb["playbooks"]:
        assert {s["phase"] for s in p["steps"]} <= phases
    cl = load("checklists.json")
    seen = set()
    for c in cl["checklists"]:
        for i in c["items"]:
            assert i["id"] not in seen and i["level"] in cl["levels"]
            seen.add(i["id"])
