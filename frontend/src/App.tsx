import { useEffect } from "react";
import { Icon } from "./components/Icon";
import { Academy } from "./game/Academy";
import { useT } from "./i18n";
import { EngineProvider, useEngine } from "./lib/engine";
import { go, useRoute, type Route } from "./lib/router";
import { useStore } from "./lib/store";
import { Bridge } from "./stations/Bridge";
import { Comms } from "./stations/Comms";
import { Crew } from "./stations/Crew";
import { Emergency } from "./stations/Emergency";
import { Identity } from "./stations/Identity";
import { Logbook } from "./stations/Logbook";
import { Operator } from "./stations/Operator";
import { Radar } from "./stations/Radar";
import { Settings } from "./stations/Settings";
import { Shields } from "./stations/Shields";
import { Vault } from "./stations/Vault";

const NAV: { group: string; items: Route[] }[] = [
  { group: "nav.lage", items: ["bridge"] },
  { group: "nav.schutz", items: ["radar", "shields", "identity", "vault", "comms", "operator"] },
  { group: "nav.handeln", items: ["emergency", "logbook", "crew"] },
  { group: "nav.lernen", items: ["academy"] },
];

function useDocumentPrefs() {
  const theme = useStore((s) => s.settings.theme);
  const motion = useStore((s) => s.settings.motion);
  const lang = useStore((s) => s.settings.lang);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
    const reduced = motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.motion = reduced ? "reduced" : "full";
    root.lang = lang;
  }, [theme, motion, lang]);
}

function StatusBar() {
  const t = useT();
  const { live, checking, job, scanning } = useEngine();
  const score = job?.score;
  return (
    <header className="topbar">
      <a href="#/bridge" className="brand" aria-label={t("app.home")}>
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" className="brand-mark">
          <path d="M16 2l3.5 6.2 7-1.4-1.4 7L31 16l-5.9 2.2 1.4 7-7-1.4L16 30l-3.5-6.2-7 1.4 1.4-7L1 16l5.9-2.2-1.4-7 7 1.4z" />
          <circle cx="16" cy="16" r="4.2" />
        </svg>
        <span className="brand-name">ToySafe</span>
      </a>
      <div className="topbar-status">
        {scanning && (
          <span className="pill pill-scan" role="status">
            <span className="pulse" aria-hidden="true" />
            {t("scan.running")}
          </span>
        )}
        {score && (
          <a href="#/bridge" className={`pill pill-score g-${score.grade}`}>
            {t("top.shields", { n: score.score })}
          </a>
        )}
        <a href="#/settings" className={`pill ${live ? "pill-live" : "pill-demo"}`} title={t("top.modeHelp")}>
          {checking ? t("common.checking") : live ? t("top.live") : t("top.demo")}
        </a>
      </div>
    </header>
  );
}

function Nav({ route }: { route: Route }) {
  const t = useT();
  return (
    <nav className="rail" aria-label={t("nav.label")}>
      {NAV.map((g) => (
        <div key={g.group} className="rail-group">
          <span className="rail-group-label">{t(g.group)}</span>
          <ul>
            {g.items.map((r) => (
              <li key={r}>
                <a href={`#/${r}`} className={`rail-item ${route === r ? "is-active" : ""} ${r === "emergency" ? "is-emergency" : ""}`} aria-current={route === r ? "page" : undefined}>
                  <Icon name={r} size={22} />
                  <span>{t(`station.${r}`)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <a href="#/settings" className={`rail-item rail-settings ${route === "settings" ? "is-active" : ""}`} aria-current={route === "settings" ? "page" : undefined}>
        <Icon name="settings" size={22} />
        <span>{t("station.settings")}</span>
      </a>
    </nav>
  );
}

function View({ route, arg }: { route: Route; arg: string | null }) {
  switch (route) {
    case "radar": return <Radar />;
    case "shields": return <Shields arg={arg} />;
    case "identity": return <Identity />;
    case "vault": return <Vault />;
    case "comms": return <Comms />;
    case "operator": return <Operator />;
    case "emergency": return <Emergency arg={arg} />;
    case "logbook": return <Logbook />;
    case "crew": return <Crew />;
    case "academy": return <Academy arg={arg} />;
    case "settings": return <Settings />;
    default: return <Bridge />;
  }
}

export function App() {
  useDocumentPrefs();
  const t = useT();
  const { route, arg } = useRoute();
  useEffect(() => {
    document.title = `${t(`station.${route}`)} | ToySafe`;
    window.scrollTo({ top: 0 });
    const main = document.getElementById("main");
    if (main && document.activeElement?.closest(".rail")) main.focus({ preventScroll: true });
  }, [route, arg, t]);

  return (
    <EngineProvider>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
        {t("app.skip")}
      </a>
      <div className="starfield" aria-hidden="true" />
      <div className="shell">
        <StatusBar />
        <Nav route={route} />
        <main id="main" tabIndex={-1} className={`view view-${route}`}>
          <View route={route} arg={arg} />
        </main>
      </div>
      <button type="button" className="sos" onClick={() => go("emergency")} aria-label={t("app.sos")}>
        <Icon name="emergency" size={20} />
        <span>{t("app.sosShort")}</span>
      </button>
    </EngineProvider>
  );
}
