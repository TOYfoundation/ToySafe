# ToySafe – Konzept

Stand 24.10.2026 · Teil des ToyVerse (ToyChain, TOY, TOYPAY, ToyScan, ToyCash, TOYQUEST, ToyPost) · Lizenz MIT

ToySafe ist das Sicherheits-Cockpit des ToyVerse. Es schützt die Menschen, die das ToyVerse nutzen und betreiben, und macht sie fähig, sich selbst, ihre Geräte und Netze und andere zu schützen. Dieselben Inhalte gibt es als spielbares Level 7 „Die Sternenwacht“ in TOYQUEST (`02-level7-sternenwacht.md`).

Fachlich maßgeblich für alles rund um TOY bleiben `docs/01-spezifikation.md` und `docs/02-entscheidungen.md` im Repository `Safehaigit/toycoin`. Bei Widersprüchen gilt toycoin.

## 1. Ziel in drei Sätzen

1. **Schützen:** Geräte, Netze, Konten, Wallets und Dienste im ToyVerse prüfen, Funde verständlich erklären und in der richtigen Reihenfolge beheben.
2. **Befähigen:** Jede Funktion erklärt, warum sie wichtig ist, und lässt sich ohne Risiko üben (Demo-Modus, Level 7).
3. **Weitergeben:** Wer geschützt ist, schützt andere: Familie, Gang, Community, Betreiber.

## 2. Für wen

| Gruppe | Typische Gefahr | Was ToySafe bietet |
|---|---|---|
| Spieler und Wallet-Nutzer | falscher Support, Phrasen-Diebstahl, Adress-Vergiftung, gefälschte Downloads, „Token-Tausch“-Betrug | Funk (Betrugs-Detektor, Link-Prüfer), Tresor (Adress-Wache, Download-Prüfer, Grundregeln), Identität |
| Familien, Kinder, Großeltern | Geheimhaltungs-Tricks, Geschenke gegen Passwort, Fernwartungs-Betrug am Telefon | Crew (Schutzkarten zum Drucken, Familien-Checkliste), Level-7-Mission „Turm der Geschichten“ |
| Heimnetz-Besitzer | offene Ports, alte Firmware, unbekannte Geräte, fremde Miner | Radar, Schilde, Scan mit Startfreigabe, priorisierte Funde |
| Betreiber (Knoten, Validatoren, Webseiten, Bots) | offenes RPC, Schlüsselrechte, Geheimnisse im Code, DDoS, Lieferkette | Betreiber-Station, Schutz in Schichten, Header-/TLS-/Mail-Checks, Code- und Container-Prüfung |
| Moderation und Community | Betrugswellen im Kanal, Erpressung, Bloßstellung von Opfern | Moderations-Ablauf, Schutzkarte „Moderation“, Notfall-Playbooks |

## 3. Leitplanken

Übernommen aus der Projekt-Dokumentation der Pentester-App und den festen Regeln des ToyVerse:

- **Nur prüfen, was einem gehört.** Jeder Scan braucht eine bestätigte Startfreigabe, die protokolliert wird (`backend/toysafe/core/scope.py`). Ziele außerhalb des erklärten Bereichs lehnt die Engine ab.
- **Kein Angriffscode.** Jedes Modul orchestriert ein etabliertes, defensives Werkzeug und übersetzt dessen Ergebnis. Keine Exploits, kein Social-Engineering-Werkzeug, kein Post-Exploitation-Tooling.
- **Nie nach Phrase oder Schlüsseln fragen, nie Transaktionen senden.** Eingabefelder, die versehentlich eine Phrase erhalten, schlagen Alarm und raten zum Löschen.
- **Lokal zuerst.** Betrugs-Detektor, Link-Prüfer, Adress-Wache, Download-Prüfer und Passphrasen-Labor laufen komplett im Browser. Das Cockpit lädt nichts von Dritten (Schriften liegen bei, keine Tracker).
- **ToyCoin bleibt der einzige erlaubte Miner** (`config/local_overrides.yaml`, nie automatisch überschrieben).
- **Regeln des ToyVerse:** keine Renditeversprechen, Testnet-TOY ohne Wert, kein Tausch alter Polygon-Token, auf der ToyChain nur TOY, Spiele mit Einsatz nur mit Dukaten, Konten gehen nie verloren, Sperren entziehen nur Rechte, nie Guthaben.

## 4. Das Cockpit: Stationen

Das Cockpit ist eine Web-App (React, statisch gebaut), die nur mit der eigenen ToySafe-Engine spricht. Ohne Engine läuft sie im **Demo-Modus** mit einer Beispiel-Flotte und einem simulierten Scan.

| Station | Aufgabe | Methoden und Werkzeuge |
|---|---|---|
| **Brücke** | Lage auf einen Blick | Schildring mit sechs Segmenten (Radar, Schilde, Identität, Tresor, Betreiber, Funk), Schildstärke 0–100, „Jetzt zuerst“, Lagebild der Bedrohungs-Updates |
| **Radar** | Wer ist im Netz? | Inventar-Abgleich (nmap -sn), unbekannte Geräte blinken bis zur Bestätigung, WLAN-Wache (passiv) |
| **Schilde** | Lücken und Härtung | priorisierte Funde (KEV > CVSS > Wichtigkeit > Sichtbarkeit), Scan-Konsole mit fünf Phasen, „Als behoben markieren“, Checklisten Router und Geräte |
| **Identität** | Konten schützen | Passphrasen-Labor, Passphrasen-Würfel, Zwei-Faktor-Reihenfolge, Mail-Domain-Check (SPF, DKIM, DMARC) |
| **Tresor** | TOYPAY und TOY | Adress-Wache (EIP-55-Prüfsumme, Zeichenvergleich, Adress-Vergiftung), Download-Prüfer (SHA-256), Grundregeln, Miner-Wache |
| **Funk** | Nachrichten und Funk | Betrugs-Detektor (15 Regeln aus `content/scam_rules.json`), Link-Prüfer (Homoglyphen, Punycode, Verkürzer, verdächtige Endungen), eigene sichere Domains, WLAN-Tipps |
| **Betreiber** | Knoten, Web, Code | Schutz in Schichten für ToyChain-Knoten, Header- und TLS-Check, Modulübersicht, Checklisten Knoten und Webdienste |
| **Notfall** | Etwas ist passiert | 9 Playbooks in fünf Phasen (Erkennen, Eindämmen, Beseitigen, Wiederherstellen, Lernen), Kontakte, Drucken. Die Notfall-Taste ist auf jeder Seite erreichbar. |
| **Logbuch** | Nachvollziehen | Scan-Verlauf, Berichte als Markdown, HTML und PDF |
| **Crew** | Andere schützen | Schutzkarten (Kinder, Großeltern, Gang, Moderation), Moderations-Ablauf, Familien-Checkliste, Fortschritt aller Checklisten |
| **Level 7** | Üben im Spiel | 21 Missionen, 12 NPCs, 8 Klassen, Echt-Welt-Siegel |

## 5. Was in dieser Runde dazugekommen ist

Zusätzlich zu den Modulen der Pentester-App (nmap, OpenVAS, Nuclei, Lynis, unerwünschte Software, KEV-Abgleich, Bericht) und den Erweiterungen der Engine (Netz-Inventar, WLAN-Wache, Header-, TLS- und Mail-DNS-Prüfung, Knoten-Wache mit Zeit-Sync, Geheimnis-, Abhängigkeits- und Container-Prüfung, Startfreigabe mit Protokoll, automatischer Update-Plan, PDF) hat ToySafe jetzt:

1. **Ein Cockpit für alle Geräte** mit Raumschiff-Oberfläche, Hell- und Dunkelmodus, reduzierter Bewegung auf Wunsch, Bedienung per Tastatur und Handy-Ansicht ab 390 px.
2. **Schildring und Sofort-Rückmeldung:** Wer einen Fund als behoben markiert, sieht den Ring heller werden. Der nächste Scan bestätigt es. Gerechnet wird mit derselben Formel wie in der Engine (`score.py`).
3. **Betrugs-Detektor und Link-Prüfer** lokal im Browser. Die Regeln kennen die ToyVerse-Maschen: Phrasen-Abfrage, Token-Tausch, Presale, Rendite, Item-Shop, ToyChain-Token, Testnet-Verkauf, Poker um TOY, falscher Support, Fernwartung, Zeitdruck, Geheimhaltung, Geschenke, Zahlungsdruck, Erpressung.
4. **Adress-Wache:** EIP-55-Prüfsumme mit Keccak-256 (Bibliothek `@noble/hashes`, MIT), Vergleich Zeichen für Zeichen, Warnung bei gleichem Anfang und Ende (Adress-Vergiftung).
5. **Download-Prüfer:** SHA-256 der Datei mit WebCrypto, Vergleich mit dem veröffentlichten Fingerabdruck. Schützt vor gefälschten TOYPAY-, Knoten- und ToySafe-Downloads.
6. **Passphrasen-Labor und -Würfel:** Stärke-Schätzung, Phrasen-Alarm, Passphrasen aus 557 Wörtern mit dem Zufallsgenerator des Geräts.
7. **Radar mit Inventar:** Geräte als bekannt bestätigen (nur lokal gespeichert).
8. **Notfall interaktiv:** Häkchen je Schritt, Fortschritt, Drucken, Notfall-Taste überall.
9. **Crew-Station:** Schutzkarten zum Ausdrucken und ein fester Ablauf für Moderation.
10. **Echt-Welt-Siegel:** Wer eine Checkliste wirklich erledigt, kann ein Kosmetik-Siegel für Level 7 holen. Übertragen wird nur „erledigt“, nie Funde oder Gerätedaten.
11. **Level 7 im Cockpit spielbar,** mit 13 Aufgaben-Typen und einem automatischen Durchspiel-Test.
12. **Auslieferung:** Dockerfile und systemd-Dienst in `deploy/`, die Engine liefert das Cockpit selbst aus.

## 6. Verknüpfung im ToyVerse

ToySafe hält keine Schlüssel und braucht keine neue Transaktionsart. Alle Verbindungen sind lesend oder liefern Inhalte. Die Schnittstellen unten sind **Vorschläge**, bis sie in toycoin entschieden sind.

| Teil | Was ToySafe beiträgt | Vorschlag für die Schnittstelle |
|---|---|---|
| **ToyChain-Knoten** | Knoten-Wache: RPC nur lokal, Schlüsselrechte 600, Geld-Schlüssel nicht auf dem Validator, Uhrzeit (Speicherbudget von 256 MB als nächste Prüfung) | Ports und Pfade in `backend/config/toynode.yaml`, sobald M6/M7 feststehen |
| **TOYPAY** | Adress-Wache und Phrasen-Alarm als gemeinsame Logik, Download-Prüfer für Releases, Hinweis auf Konto-Schutz (Spezifikation 7.3) im Playbook | Prüfsummen der Releases maschinenlesbar veröffentlichen (`SHA256SUMS`, signiert) |
| **ToyScan** | Lagebild: Ampel A1–A9 als Eingang für die Brücke, Warnungen zu Adressen | ToyScan-API lesend; große rote Lampe auf der Brücke spiegeln |
| **ToyPost** | gleiche Betrugsregeln für Post und Funk | `content/scam_rules.json` als gemeinsame Quelle, ToyPost übernimmt sie per Skript wie die Begriffsliste |
| **TOYQUEST** | Level 7 „Die Sternenwacht“, Echt-Welt-Siegel | `content/level7/missions.json` (Schema `toysafe.level7/1`) als Datenquelle für TOYQUEST 3D |
| **ToyCash** | später: Gutschein- und Offline-Betrug in Funk-Regeln aufnehmen | sobald ToyCash entschieden ist |
| **Webseite** | Simulation „Betrugs-Detektor“ und „Adress-Wache“ als Beispiel | Logik aus `frontend/src/lib/` wiederverwenden, ohne Daten zu senden |

## 7. Kali-Abdeckung (aktualisiert)

| Bereich | Status | Umsetzung |
|---|---|---|
| Information Gathering | integriert | nmap, nmap -sn (Inventar), dig für eigene Mail-Domain |
| Vulnerability Analysis | integriert | OpenVAS, Nuclei, KEV-Abgleich |
| Web Application Analysis | integriert, nur prüfend | Header-Check, testssl.sh/sslscan |
| Password Audits | als Training | Passphrasen-Labor und -Würfel, kein Knacken fremder Hashes |
| Wireless | nur passiv | WLAN-Wache (falsche Zwillinge, WPS, schwache Verschlüsselung) |
| Code und Lieferkette | integriert | gitleaks/trufflehog, osv-scanner/cargo-audit, trivy/grype, Download-Prüfer |
| Forensik und Notfall | als Ablauf | Playbooks, Logbuch, Spuren-Mission im Spiel |
| Social Engineering | nicht integriert | nur Erkennen und Abwehren (Betrugs-Detektor, Schutzkarten) |
| Exploitation, Post Exploitation | nicht integriert | außerhalb des Zwecks |

## 8. Ideen für später

- **Signierter Regel-Feed** für Signaturen und Betrugsregeln (zum Beispiel mit minisign), damit Updates nicht gefälscht werden können.
- **Köder-Dateien (Honeytokens)** im eigenen Repository oder Server, die Alarm geben, wenn jemand sie benutzt.
- **Übungsabende (Tabletop)** für Betreiber: ein Notfall-Playbook gemeinsam durchspielen, mit Stoppuhr.
- **Passkey-Assistent** mit Anleitungen je Dienst.
- **Datenleck-Prüfung** nur mit k-Anonymität und ausdrücklicher Zustimmung (dritter Dienst, daher nicht standardmäßig).
- **Apps** für Desktop und Handy mit derselben Oberfläche (Tauri und Capacitor).
- **45 Sprachen** nach `i18n/sprachen.tsv` aus toycoin. Die Oberfläche ist schon über Schlüssel gebaut (Deutsch und Englisch), die Inhalte sind noch deutsch.

## 9. Offene Fragen

1. **Level 6 von TOYQUEST:** In toycoin sind fünf Level beschrieben (Zeitreise). ToySafe ist wie gewünscht Level 7. Was ist Level 6?
2. **Offizielle Domains** des ToyVerse für den Link-Prüfer (`content/scam_rules.json`, Feld `official_domains`) sind noch nicht festgelegt.
3. **Ports und Pfade des Knotens** stehen erst mit M6/M7 fest (`backend/config/toynode.yaml`, Platzhalter).
4. **Eintrag in toycoin:** Soll Level 7 in `toypay/docs/08_LERNWELT_ZEITREISE.md` und im Entscheidungsprotokoll aufgenommen werden?
5. **Rechtliche Prüfung** der Notfall-Kontakte und Texte für andere Länder als Deutschland.
