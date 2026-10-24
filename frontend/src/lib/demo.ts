// Demo fleet: invented example data so the cockpit can be explored without an engine.
// Everything here is marked as an example in the UI. IDs starting with DEMO- are not real CVEs.
import type { Asset, Device, Finding, ModuleInfo, ScanJob, Severity, StationId } from "./types";
import { shieldStrength, sortFindings } from "./score";

export const demoAssets: Asset[] = [
  { id: "net", name: "Heimnetz", asset_type: "network_segment", ip_address: "192.168.178.0/24", criticality: 4, externally_reachable: false },
  { id: "router", name: "Router", asset_type: "network_device", ip_address: "192.168.178.1", criticality: 5, externally_reachable: true },
  { id: "cam", name: "Kamera Flur", asset_type: "iot_device", ip_address: "192.168.178.40", criticality: 2, externally_reachable: false },
  { id: "laptop", name: "Laptop Anna", asset_type: "host", ip_address: "192.168.178.23", criticality: 3, externally_reachable: false, is_local: true },
  { id: "node", name: "ToyChain-Knoten (Pi 5)", asset_type: "toychain_node", ip_address: "192.168.178.50", criticality: 5, externally_reachable: true },
  { id: "web", name: "Gang-Webseite", asset_type: "web_service", ip_address: "", url: "https://gang.example", hostname: "gang.example", criticality: 3, externally_reachable: true },
  { id: "repo", name: "Repository toygang-bot", asset_type: "code_repository", ip_address: "", path: "~/code/toygang-bot", criticality: 3, externally_reachable: false },
];

let n = 0;
function f(
  asset_id: string,
  station: StationId,
  severity: Severity,
  source_plugin: string,
  title: string,
  description: string,
  recommendation: string,
  extra: Partial<Finding> = {},
): Finding {
  n += 1;
  return {
    id: `demo-${n}`,
    asset_id,
    station,
    severity,
    source_plugin,
    title,
    description,
    recommendation,
    cve_ids: [],
    is_actively_exploited: false,
    discovered_at: "2026-10-24T08:00:00Z",
    ...extra,
  };
}

export const demoFindings: Finding[] = sortFindings(
  [
    f("router", "shields", "critical", "nuclei-scan", "Router-Firmware mit aktiv ausgenutzter Lücke",
      "Die Firmware-Version steht auf der Liste aktiv ausgenutzter Lücken. Angreifer suchen gezielt nach solchen Routern.",
      "Firmware im Router-Menü sofort aktualisieren und automatische Updates einschalten. Danach Fernzugriff aus dem Internet prüfen.",
      { cve_ids: ["DEMO-2026-0001"], cvss_score: 9.8, is_actively_exploited: true }),
    f("laptop", "vault", "critical", "unwanted-software-audit", "Fremder Krypto-Miner läuft: xmrig",
      "Prozess „xmrig“ belegt 95 % der Rechenleistung. Erlaubt ist nur der ToyCoin-Miner aus der TOYPAY-Wallet.",
      "Gerät vom Netz trennen, Notfall-Playbook „Fremder Miner“ öffnen, Passwörter von einem sauberen Gerät aus ändern."),
    f("repo", "operator", "critical", "secrets-scan", "Zugangsschlüssel im Git-Verlauf gefunden",
      "In einer alten Version von config.env steht ein API-Schlüssel. Er ist auch nach dem Löschen im Verlauf lesbar.",
      "Schlüssel beim Anbieter sofort widerrufen und neu erzeugen. Erst danach den Verlauf bereinigen. Geheimnisse künftig nur in einem Tresor ablegen."),
    f("node", "operator", "high", "toynode-audit", "RPC-Schnittstelle des Knotens von außen erreichbar",
      "Port 8545 antwortet aus dem Internet. Darüber lassen sich Abfragen fluten und Details des Knotens auslesen.",
      "RPC nur an 127.0.0.1 binden oder hinter einen Reverse-Proxy mit Ratenbegrenzung stellen. Nur den P2P-Port öffnen."),
    f("cam", "shields", "high", "nmap-discovery", "Telnet offen an der Kamera (Port 23)",
      "Telnet überträgt Passwörter im Klartext und ist ein Lieblingsziel von Botnetzen.",
      "Telnet in den Kamera-Einstellungen abschalten, Firmware aktualisieren, Kamera ins Gäste- oder IoT-Netz verschieben."),
    f("laptop", "shields", "high", "unwanted-software-audit", "Fernwartungs-Programm aktiv: AnyDesk",
      "Fernwartung ist praktisch, aber auch das Lieblingswerkzeug falscher Support-Anrufer.",
      "Wenn du es nicht selbst eingerichtet hast: deinstallieren. Sonst nur bei Bedarf starten und unbeaufsichtigten Zugriff abschalten."),
    f("node", "vault", "high", "toynode-audit", "Schlüsseldatei des Validators für alle lesbar",
      "Die Datei validator.key hat die Rechte 644. Jeder Benutzer auf dem Gerät kann sie lesen.",
      "Rechte auf 600 setzen (nur der Knoten-Benutzer). Besser: Schlüssel verschlüsselt ablegen und das Passwort getrennt aufbewahren."),
    f("web", "operator", "medium", "http-headers", "Content-Security-Policy fehlt",
      "Ohne CSP kann eingeschleuster Code auf der Seite fremde Skripte laden.",
      "Eine strenge CSP setzen, z. B. default-src 'self'; frame-ancestors 'none'."),
    f("web", "identity", "medium", "email-dns", "DMARC nur im Beobachtungsmodus (p=none)",
      "Fremde können Mails im Namen der Gang-Domain verschicken, und Empfänger lehnen sie nicht ab.",
      "Nach zwei Wochen Beobachtung auf p=quarantine stellen, später p=reject."),
    f("net", "comms", "medium", "wifi-guard", "WPS am WLAN eingeschaltet",
      "WPS lässt sich mit einer achtstelligen PIN erraten, egal wie lang das WLAN-Passwort ist.",
      "WPS im Router abschalten. Neue Geräte per QR-Code oder Passwort verbinden."),
    f("net", "radar", "medium", "network-inventory", "Neues unbekanntes Gerät: esp-77",
      "Ein Gerät von Espressif ist seit 03:12 Uhr im Netz. Es steht nicht im Inventar.",
      "Familie oder Team fragen. Wenn niemand es kennt: im Router sperren und das Playbook „Unbekanntes Gerät“ öffnen."),
    f("node", "operator", "low", "time-sync", "Uhrzeit des Knotens weicht 1,8 Sekunden ab",
      "Der Knoten liegt noch im Rahmen, aber Zeitstempel müssen für Blöcke stimmen.",
      "Zeitsynchronisation (chrony oder systemd-timesyncd) einschalten und prüfen."),
    f("web", "operator", "low", "tls-audit", "HSTS nicht gesetzt",
      "Beim ersten Aufruf könnte ein Angreifer im WLAN auf unverschlüsseltes HTTP umlenken.",
      "Strict-Transport-Security mit max-age von mindestens 180 Tagen setzen."),
    f("router", "radar", "info", "nmap-discovery", "Offene Dienste am Router: 53, 80, 443",
      "DNS und Weboberfläche im Heimnetz. Von außen ist nur 443 erreichbar.",
      "Prüfen, ob die Weboberfläche von außen wirklich nötig ist."),
  ],
  demoAssets,
);

export const demoScore = shieldStrength(demoFindings, demoAssets);

export const demoDevices: Device[] = [
  { id: "aa:01", name: "Router", vendor: "AVM", ip: "192.168.178.1", kind: "router", known: true, since: "412 Tagen" },
  { id: "aa:02", name: "Laptop Anna", vendor: "Lenovo", ip: "192.168.178.23", kind: "laptop", known: true, since: "300 Tagen" },
  { id: "aa:03", name: "Handy Jonas", vendor: "Samsung", ip: "192.168.178.31", kind: "phone", known: true, since: "120 Tagen" },
  { id: "aa:04", name: "Spielekonsole", vendor: "Sony", ip: "192.168.178.35", kind: "console", known: true, since: "90 Tagen" },
  { id: "aa:05", name: "Kamera Flur", vendor: "Reolink", ip: "192.168.178.40", kind: "camera", known: true, since: "200 Tagen" },
  { id: "aa:06", name: "ToyChain-Knoten", vendor: "Raspberry Pi", ip: "192.168.178.50", kind: "node", known: true, since: "30 Tagen" },
  { id: "aa:07", name: "esp-77", vendor: "Espressif", ip: "192.168.178.77", kind: "iot", known: false, since: "heute 03:12 Uhr", note: "Mikrocontroller, neu in der Nacht" },
  { id: "aa:08", name: "(ohne Namen)", vendor: "unbekannt", ip: "192.168.178.91", kind: "unknown", known: false, since: "gestern", note: "antwortet auf Port 23" },
];

export const demoModules: ModuleInfo[] = [
  ["network-inventory", "Information Gathering", "nmap -sn / netdiscover", "1_discovery", "Erkundung", "radar", "Findet alle Geräte im Netz und vergleicht sie mit dem Inventar."],
  ["nmap-discovery", "Information Gathering", "nmap", "1_discovery", "Erkundung", "radar", "Zeigt offene Türen (Ports) und Dienste jedes Geräts."],
  ["wifi-guard", "Wireless", "Rogue-AP-Erkennung (passiv)", "1_discovery", "Erkundung", "comms", "Sucht nach falschen Zwillings-WLANs und schwacher Verschlüsselung, nur passiv."],
  ["http-headers", "Web Application Analysis", "Nikto (Header-Teil)", "2_external", "Außenhülle", "operator", "Prüft Schutz-Header der eigenen Webseiten."],
  ["tls-audit", "Web Application Analysis", "testssl.sh / sslscan", "2_external", "Außenhülle", "operator", "Prüft Zertifikate und Verschlüsselung."],
  ["email-dns", "Information Gathering", "dig (nur eigene Domain)", "2_external", "Außenhülle", "identity", "Prüft SPF, DKIM und DMARC gegen gefälschte Absender."],
  ["openvas-scan", "Vulnerability Analysis", "OpenVAS / Greenbone", "3_vuln_scan", "Schwachstellen", "shields", "Gleicht Dienste mit bekannten Lücken ab."],
  ["nuclei-scan", "Vulnerability Analysis", "nuclei", "3_vuln_scan", "Schwachstellen", "shields", "Prüft mit täglich aktualisierten Community-Vorlagen."],
  ["lynis-audit", "Hardening", "lynis", "4_config_audit", "Härtung", "shields", "Prüft die Härtung von Linux-Rechnern und Servern."],
  ["toynode-audit", "ToyChain", "ToyChain-spezifisch", "4_config_audit", "Härtung", "operator", "Prüft RPC-Ports, Rechte der Validator-Schlüssel und ob ein Geld-Schlüssel auf dem Validator liegt."],
  ["time-sync", "ToyChain", "chronyc / timedatectl", "4_config_audit", "Härtung", "operator", "Prüft die Uhrzeit, wichtig für Blöcke und Epochen."],
  ["unwanted-software-audit", "Host Audit", "Application Allowlisting", "4_config_audit", "Härtung", "vault", "Findet fremde Miner und Fernwartungs-Tools. Erlaubt ist nur der ToyCoin-Miner."],
  ["secrets-scan", "Code Audit", "gitleaks / trufflehog", "5_deep_dive", "Tiefenprüfung", "operator", "Sucht Passwörter und Schlüssel im eigenen Code."],
  ["dependency-audit", "Code Audit", "osv-scanner / cargo-audit", "5_deep_dive", "Tiefenprüfung", "operator", "Prüft Bibliotheken auf bekannte Lücken."],
  ["container-scan", "Code Audit", "trivy / grype", "5_deep_dive", "Tiefenprüfung", "operator", "Prüft eigene Container-Images."],
].map(([name, category, tool, phase, phase_label, station, explanation]) => ({
  name, category, tool, phase, phase_label, station: station as StationId, explanation, available: false,
}));

/** Scripted demo scan: yields log lines with delays, like the engine's progress events. */
export const demoScanScript: { phase: string; message: string }[] = [
  { phase: "Erkundung", message: "Radar: 8 Geräte im Heimnetz gefunden, 2 davon unbekannt" },
  { phase: "Erkundung", message: "nmap: offene Türen am Router und an der Kamera gelesen" },
  { phase: "Erkundung", message: "WLAN-Wache: kein falscher Zwilling, aber WPS ist an" },
  { phase: "Außenhülle", message: "Webseite: Schutz-Header und Zertifikat geprüft" },
  { phase: "Außenhülle", message: "Mail-Domain: SPF ok, DMARC nur beobachtend" },
  { phase: "Schwachstellen", message: "nuclei: Router-Firmware auf der Liste aktiv ausgenutzter Lücken" },
  { phase: "Härtung", message: "ToyChain-Knoten: RPC von außen offen, Schlüsselrechte zu weit" },
  { phase: "Härtung", message: "Laptop: fremder Miner xmrig entdeckt" },
  { phase: "Tiefenprüfung", message: "Repository: ein Geheimnis im Git-Verlauf" },
  { phase: "Bericht", message: "14 Funde priorisiert, Bericht bereit" },
];

export function demoJob(): ScanJob {
  return {
    id: "demo",
    operator: "Demo",
    status: "done",
    created_at: "2026-10-24T08:00:00Z",
    finished_at: "2026-10-24T08:04:12Z",
    phase: "5_deep_dive",
    step: demoScanScript.length,
    total_steps: demoScanScript.length,
    log: demoScanScript.map((l) => ({ at: "2026-10-24T08:00:00Z", kind: "step", message: l.message })),
    score: demoScore,
    asset_count: demoAssets.length,
    finding_count: demoFindings.length,
    findings: demoFindings,
    assets: demoAssets,
  };
}
