export { test, expect, makeTestId, resolveTrackWhere, type E2ETestFixtures, type E2EWorkerFixtures } from "./fixtures.js";
export {
  defineE2EConfig,
  playwrightConfig,
  browserUse,
  LAYERS,
  type DbConfig,
  type E2EConfig,
  type E2EPlaywrightConfig,
  type E2EWorkerOptions,
  type HostConfig,
  type Layer,
  type ReportConfig,
  type TrackSpec,
  type TrackWhere,
  type WebConfig,
} from "./config.js";
export { BridgeCallError, createBridge, DEFAULT_BRIDGE_GLOBAL, type Bridge, type BridgeErrorShape } from "./bridge.js";
export { launchHost, killTree, probeCdp, HostLaunchError, type HostApp, type LaunchHostOptions } from "./host.js";
export {
  createDb,
  diffRows,
  summarizeDiff,
  normalizeRawResult,
  type CleanupEntry,
  type CleanupFailure,
  type CleanupResult,
  type Db,
  type DbDiff,
  type DbOptions,
  type DbSnapshot,
  type Row,
  type SnapshotSpec,
  type TableDiff,
  type TableSnapshot,
} from "./db/index.js";
export { checkAllowed, describeConnection, isDbClient, oracleServiceName, type ConnectionDescription, type DbClient, type GuardResult } from "./db/guard.js";
export { knexConfigFromEnv, loadEnvFiles, DbEnvError, DEFAULT_ENV_FILES, type KnexLikeConfig } from "./db/env.js";
export { buildReport, type ReportInput, type ReportTestEntry } from "./reporter.js";
