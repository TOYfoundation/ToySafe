# ToySafe – Stand

Stand 24.10.2026 · Version 0.8.0

## Fertig

**Engine (backend/)**

- FastAPI mit Startfreigabe (Scope-Erklärung, Prüfung der Ziele, Protokoll), Hintergrund-Scans mit Fortschritt, Berichte als Markdown, HTML und PDF.
- 15 Prüfmodule in 5 Phasen: Netz-Inventar, nmap, WLAN-Wache, Header-Check, TLS-Check, Mail-DNS, OpenVAS, Nuclei, Lynis, Knoten-Wache, Zeit-Sync, unerwünschte Software (ToyCoin-Ausnahme), Geheimnisse im Code, Abhängigkeiten, Container.
- Priorisierung (KEV > CVSS > Wichtigkeit > Sichtbarkeit) und Schildstärke 0–100, je Station mit steilerer Kurve.
- Automatischer Update-Plan (KEV-Liste, Nuclei-Vorlagen, Signaturen), Zugangsschlüssel oder nur lokal.

**Cockpit (frontend/)**

- 12 Stationen mit Raumschiff-Oberfläche, Schildring, Radar, Scan-Konsole, Notfall-Taste.
- Lokale Werkzeuge: Betrugs-Detektor, Link-Prüfer, Adress-Wache (EIP-55, Adress-Vergiftung), Download-Prüfer (SHA-256), Passphrasen-Labor und -Würfel.
- Demo-Modus mit Beispiel-Flotte und simuliertem Scan, Live-Modus mit eigener Engine.
- „Als behoben markieren“ mit sofort neu berechneter Schildstärke.
- Deutsch und Englisch (458 Schlüssel), Hell- und Dunkelmodus, reduzierte Bewegung, Tastatur, Handy ab 390 px, keine Inhalte von Dritten.

**Level 7 „Die Sternenwacht“ (content/level7/)**

- 21 Missionen (7 neu), 12 NPCs (2 neu), 17 Orte (4 neu), 8 Klassen, 5 Nebenaufgaben.
- 13 Aufgaben-Typen, davon 4 neu: Chat-Simulation, Zeitdruck, Team-Abstimmung, Unterschiede finden.
- Sternenkarte mit geflogenem Kurs, Sterne, Dukaten, Siegel, Echt-Welt-Siegel.

**Auslieferung:** Dockerfile und systemd-Dienst (`deploy/`).

**Neu in 0.8.0**

- Live-Fortschritt per Server-Sent Events (`/api/scans/{id}/events`), Rückfall auf Abfragen.
- Fertige Scans werden gespeichert und nach einem Neustart wieder geladen.
- Ziel-Inventar im Cockpit, Import und Export als `assets.json` (wie die Kommandozeile).
- Installierbare Web-App: Manifest, Symbole, Service Worker, Start ohne Netz. Engine-Daten werden nie zwischengespeichert.

## Messwerte

| Prüfung | Ergebnis |
|---|---|
| `pytest` (Engine und Inhalte) | 51 bestanden |
| `npm run check` (TypeScript, Übersetzungen) | ohne Fehler, 464 Schlüssel in de und en |
| `npm run build` | JavaScript 475 KB (154 KB gzip) |
| `npm run e2e` (alle Missionen im Browser) | 21 von 21 mit 3 Sternen |
| Live-Test gegen laufende Engine | Scan über das Cockpit: ein Ereignis-Strom statt Abfragen, Ergebnis nach Neustart noch im Logbuch, Ziele beim nächsten Scan vorausgefüllt |
| Installierbarkeit | Service Worker aktiv, Manifest gültig, Cockpit startet offline, 0 API-Antworten im Zwischenspeicher |
| Browser-Check 1440 px, 1280 px, 390 px, hell und dunkel | kein waagrechtes Scrollen, keine Skriptfehler (nur der erwartete Hinweis, dass im Demo-Modus keine Engine antwortet) |

## Offen

- Level 6 von TOYQUEST ist in toycoin nicht beschrieben (Level 7 wie gewünscht angelegt).
- Offizielle Domains für den Link-Prüfer (`content/scam_rules.json`).
- Ports und Pfade des ToyChain-Knotens (`backend/config/toynode.yaml`), sobald M6/M7 fertig sind. Prüfung des Speicherbudgets (256 MB) ergänzen.
- Übersetzung der Inhalte (Missionen, Playbooks, Checklisten) in die 45 Sprachen des ToyVerse.
- Einbau von Level 7 in TOYQUEST 3D (Godot) aus `missions.json`.
- Apps für Desktop und Handy (Tauri, Capacitor). Bis dahin lässt sich das Cockpit als Web-App installieren.
