// Shape of content/level7/missions.json (schema toysafe.level7/1)

export interface Npc {
  id: string;
  name: string;
  role: string;
  explains?: string;
  color?: string;
}
export interface Location {
  id: string;
  name: string;
  toysafe_station: string;
  x?: number;
  y?: number;
}
export interface Line {
  npc: string;
  text: string;
}
export interface Opt {
  text: string;
  correct: boolean;
  feedback?: string;
  why?: string;
}

export type Step =
  | { type: "dialog"; lines: Line[] }
  | { type: "choice"; prompt: string; options: Opt[]; hint?: string; explain?: string }
  | { type: "multi"; prompt: string; options: Opt[]; hint?: string; explain?: string }
  | {
      type: "classify";
      prompt: string;
      buckets: { id: string; label: string }[];
      items: { text: string; answer: string; why?: string }[];
      hint?: string;
      explain?: string;
    }
  | { type: "order"; prompt: string; items: { text: string }[]; hint?: string; explain?: string }
  | {
      type: "toggle";
      prompt: string;
      on_label: string;
      off_label: string;
      items: { label: string; initial: boolean; target: boolean; why?: string }[];
      hint?: string;
      explain?: string;
    }
  | { type: "passphrase"; prompt: string; min_bits: number; hint?: string; explain?: string }
  | {
      type: "find";
      prompt: string;
      need: number;
      lines: { text: string; suspicious: boolean; why?: string }[];
      hint?: string;
      explain?: string;
    }
  | {
      type: "match";
      prompt: string;
      left: { id: string; text: string }[];
      right: { id: string; text: string }[];
      solution: Record<string, string>;
      hint?: string;
      explain?: string;
    }
  | {
      type: "chat";
      prompt: string;
      contact: { name: string; badge?: string };
      turns: { them: string; options: Opt[] }[];
      hint?: string;
      explain?: string;
    }
  | {
      type: "timed";
      prompt: string;
      seconds: number;
      pass: number;
      buckets: { id: string; label: string }[];
      items: { text: string; answer: string; why?: string }[];
      hint?: string;
      explain?: string;
    }
  | {
      type: "consensus";
      prompt: string;
      proposal: string;
      threshold: number; // e.g. 0.6667
      members: {
        name: string;
        role: string;
        stance: "yes" | "no" | "unsure";
        concern?: string;
        options?: Opt[];
      }[];
      hint?: string;
      explain?: string;
    }
  | {
      type: "compare";
      prompt: string;
      label_a: string;
      label_b: string;
      pairs: { a: string; b: string; same: boolean; why?: string }[];
      hint?: string;
      explain?: string;
    };

export interface Mission {
  id: string;
  title: string;
  location: string;
  npc: string;
  rank: string;
  minutes: number;
  players: string;
  class_bonus: string;
  skill: string;
  team?: { rule: string; roles: string[] };
  boss?: boolean;
  intro: Line[];
  steps: Step[];
  outro: Line[];
  real_world: { text: string; link: string };
  reward: { dukaten: number; seal: string };
}

export interface Level {
  schema: string;
  game: string;
  level: number;
  title: string;
  subtitle: string;
  note: string;
  story: string[];
  npcs: Npc[];
  locations: Location[];
  classes: Record<string, string>;
  rewards: { per_mission: string; level: string; rule: string };
  missions: Mission[];
  side_quests: { id: string; title: string; text: string; reward: string }[];
}
