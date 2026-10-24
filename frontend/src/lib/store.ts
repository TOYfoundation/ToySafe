import { useSyncExternalStore } from "react";

/**
 * Tiny persisted store. Everything stays on this device (localStorage).
 * Never store secrets here: no phrases, no keys, no passwords.
 */

export interface Settings {
  theme: "auto" | "dark" | "light";
  motion: "auto" | "reduced";
  lang: "de" | "en";
  mode: "auto" | "demo" | "live";
  apiBase: string;
  apiToken: string; // API access token for the user's own ToySafe engine, kept only in this browser
  operator: string;
  bootSeen: boolean;
}

export interface GameState {
  playerClass: string | null;
  completed: Record<string, { stars: number; at: string }>;
  dukaten: number;
  seals: string[];
  realWorld: string[]; // checklist ids finished in real life ("done" only, no data)
}

export interface State {
  settings: Settings;
  checklist: Record<string, boolean>;
  playbook: Record<string, boolean>;
  knownDevices: Record<string, boolean>;
  resolved: Record<string, boolean>; // findings the user marked as fixed (until the next scan)
  bookmarks: string[];
  game: GameState;
  lastJobId: string | null;
}

const KEY = "toysafe.v1";

const initial: State = {
  settings: {
    theme: "auto",
    motion: "auto",
    lang: "de",
    mode: "auto",
    apiBase: "",
    apiToken: "",
    operator: "",
    bootSeen: false,
  },
  checklist: {},
  playbook: {},
  knownDevices: {},
  resolved: {},
  bookmarks: [],
  game: { playerClass: null, completed: {}, dukaten: 0, seals: [], realWorld: [] },
  lastJobId: null,
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...(parsed.settings ?? {}) },
      game: { ...initial.game, ...(parsed.game ?? {}) },
    };
  } catch {
    return initial;
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode, preview) – keep working in memory */
  }
}

export function getState(): State {
  return state;
}

export function setState(update: (s: State) => State) {
  state = update(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(initial));
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function toggleMap(field: "checklist" | "playbook" | "knownDevices" | "resolved", id: string, value?: boolean) {
  setState((s) => ({ ...s, [field]: { ...s[field], [id]: value ?? !s[field][id] } }));
}

export function resetGame() {
  setState((s) => ({ ...s, game: { ...initial.game, playerClass: s.game.playerClass } }));
}

export function resetAll() {
  state = initial;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
