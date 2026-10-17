export type Engine = 'browser' | 'fetch';
export type Aggregate = 'median' | 'p75' | 'p90';
export type SeriesKind = 'before' | 'after' | 'custom';
export type Action =
  | { type: 'click'; selector: string; timeoutMs: number }
  | { type: 'wait'; durationMs: number }
  | { type: 'scroll'; x: number; y: number };

export interface Thresholds {
  /** Maximum allowed aggregate value in milliseconds. */
  totalMs?: number;
  ttfbMs?: number;
  lcpMs?: number;
  /** Largest allowed increase over reference, in percent. */
  regressionPercent?: number;
}

export interface TestProfile {
  id: string;
  name: string;
  urls: string[];
  engine: Engine;
  runs: number;
  aggregate: Aggregate;
  disableCache: boolean;
  userAgent?: string;
  blockedPatterns: string[];
  actions: Action[];
  network?: { downloadKbps: number; uploadKbps: number; latencyMs: number };
  cpuSlowdown?: number;
  viewport?: { width: number; height: number; deviceScaleFactor: number; mobile: boolean };
  /** Unrecorded attempts used to stabilise a test environment before measured runs. */
  warmupRuns: number;
  /** Pause between completed attempts, in milliseconds. */
  runIntervalMs: number;
  /** Maximum duration of one navigation or HTTP request, in milliseconds. */
  requestTimeoutMs: number;
  thresholds: Thresholds;
  /** Stores a compact CDP diagnostic log with the run; never sent off-device. */
  debugMode?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Metrics {
  totalMs: number;
  ttfbMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  fcpMs?: number;
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  transferBytes?: number;
  status?: number;
}

export interface Artifact {
  kind: 'har' | 'trace' | 'debug';
  filename: string;
  mimeType: string;
  content: string;
}

export interface TestRun {
  id: string;
  url: string;
  index: number;
  startedAt: string;
  durationMs: number;
  metrics?: Metrics;
  error?: string;
  artifacts?: Artifact[];
}

export interface Series {
  id: string;
  profileId: string;
  profileName: string;
  /** Immutable test configuration used to create this series. */
  profileSnapshot: TestProfile;
  kind: SeriesKind;
  label: string;
  createdAt: string;
  runs: TestRun[];
  aggregate: Aggregate;
  summary?: Metrics;
  thresholdFailures: string[];
  referenceSeriesId?: string;
}

