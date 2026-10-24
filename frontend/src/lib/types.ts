export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export type StationId =
  | "radar"
  | "shields"
  | "identity"
  | "vault"
  | "operator"
  | "comms";
export const RING_STATIONS: StationId[] = ["radar", "shields", "identity", "vault", "operator", "comms"];

export type AssetType =
  | "network_device"
  | "iot_device"
  | "host"
  | "web_service"
  | "network_segment"
  | "toychain_node"
  | "code_repository"
  | "container_image";

export const ASSET_TYPES: AssetType[] = [
  "network_segment",
  "network_device",
  "iot_device",
  "host",
  "web_service",
  "toychain_node",
  "code_repository",
  "container_image",
];

export interface Asset {
  id: string;
  name: string;
  asset_type: AssetType;
  ip_address: string;
  hostname?: string | null;
  url?: string | null;
  path?: string | null;
  image?: string | null;
  mac_address?: string | null;
  criticality: number;
  externally_reachable: boolean;
  is_local?: boolean;
  owner?: string | null;
}

export interface Finding {
  id: string;
  asset_id: string;
  title: string;
  description: string;
  severity: Severity;
  source_plugin: string;
  cve_ids: string[];
  cvss_score?: number | null;
  is_actively_exploited: boolean;
  recommendation: string;
  reference_url?: string | null;
  station: StationId;
  discovered_at: string;
}

export interface Score {
  score: number;
  grade: "stabil" | "gut" | "angeschlagen" | "schwach" | "kritisch";
  label: string;
  counts: Record<Severity, number>;
  kev: number;
  stations: Record<StationId, number>;
}

export interface ScanLogEntry {
  at: string;
  kind: string;
  message: string;
}

export interface ScanJob {
  id: string;
  operator: string;
  status: "queued" | "running" | "done" | "failed";
  created_at: string;
  finished_at?: string | null;
  phase?: string | null;
  current?: string | null;
  step: number;
  total_steps: number;
  log: ScanLogEntry[];
  score?: Score | null;
  error?: string | null;
  asset_count: number;
  finding_count: number;
  findings?: Finding[];
  assets?: Asset[];
}

export interface ModuleInfo {
  name: string;
  category: string;
  tool: string;
  phase: string;
  phase_label: string;
  station: StationId;
  explanation: string;
  available: boolean;
}

export interface Device {
  id: string;
  name: string;
  vendor: string;
  ip: string;
  kind: "router" | "laptop" | "phone" | "console" | "camera" | "iot" | "node" | "unknown";
  known: boolean;
  since: string;
  note?: string;
}
