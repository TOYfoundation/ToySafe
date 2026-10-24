import { useEffect, useState } from "react";

export type Route =
  | "bridge"
  | "radar"
  | "shields"
  | "identity"
  | "vault"
  | "comms"
  | "operator"
  | "emergency"
  | "logbook"
  | "crew"
  | "academy"
  | "settings";

export const ROUTES: Route[] = [
  "bridge", "radar", "shields", "identity", "vault", "comms", "operator", "emergency", "logbook", "crew", "academy", "settings",
];

function parse(): { route: Route; arg: string | null } {
  const [r, arg] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { route: (ROUTES as string[]).includes(r) ? (r as Route) : "bridge", arg: arg ? decodeURIComponent(arg) : null };
}

export function useRoute() {
  const [state, setState] = useState(parse);
  useEffect(() => {
    const on = () => setState(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return state;
}

export function go(route: Route, arg?: string) {
  window.location.hash = `/${route}${arg ? `/${encodeURIComponent(arg)}` : ""}`;
}

/** Maps toysafe://station/<id> links from the game content to cockpit routes. */
export function routeFromLink(link: string): Route | null {
  const m = link.match(/^toysafe:\/\/station\/([a-z]+)/);
  if (!m) return null;
  const alias: Record<string, Route> = { bridge: "bridge", logbook: "logbook", crew: "crew" };
  const r = alias[m[1]] ?? m[1];
  return (ROUTES as string[]).includes(r) ? (r as Route) : null;
}

/** Embedded (e.g. as a hosted demo), browsers block printing and downloads, so those buttons hide. */
export const isFramed = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
