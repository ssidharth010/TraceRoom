import type { MarketSnapshot } from "../domain/market";

export const configuredSnapshots: readonly MarketSnapshot[] = [
  {
    snapshotId: "snapshot-001",
    symbol: "INFY",
    observedAt: "2026-07-15T09:45:00.000Z",
    decisionHorizonMinutes: 30,
    currentPrice: 1684.5,
    previousClose: 1600,
    dayOpen: 1620,
    dayHigh: 1695,
    dayLow: 1595,
    volume: 1_800_000,
    averageVolume: 1_000_000,
    indicators: {
      sma20: 1618,
      ema9: 1660,
      rsi14: 68.5,
    },
  },
  {
    snapshotId: "snapshot-002",
    symbol: "NOVA",
    observedAt: "2026-07-22T18:35:00.000Z",
    decisionHorizonMinutes: 30,
    currentPrice: 74.4,
    previousClose: 70.8,
    dayOpen: 71.2,
    dayHigh: 74.9,
    dayLow: 70.5,
    volume: 2_450_000,
    averageVolume: 1_520_000,
    indicators: {
      sma20: 71.6,
      ema9: 72.9,
      rsi14: 64.2,
    },
  },
  {
    snapshotId: "snapshot-003",
    symbol: "ORBT",
    observedAt: "2026-07-22T18:40:00.000Z",
    decisionHorizonMinutes: 30,
    currentPrice: 242.9,
    previousClose: 256,
    dayOpen: 254.2,
    dayHigh: 255.8,
    dayLow: 241.7,
    volume: 920_000,
    averageVolume: 760_000,
    indicators: {
      sma20: 249.8,
      ema9: 246.7,
      rsi14: 34.8,
    },
  },
  {
    snapshotId: "snapshot-004",
    symbol: "VELA",
    observedAt: "2026-07-22T18:45:00.000Z",
    decisionHorizonMinutes: 30,
    currentPrice: 45.6,
    previousClose: 43.6,
    dayOpen: 44,
    dayHigh: 45.9,
    dayLow: 43.4,
    volume: 3_100_000,
    averageVolume: 2_200_000,
    indicators: {
      sma20: 44.1,
      ema9: 44.8,
      rsi14: 57.4,
    },
  },
];

export function getConfiguredSnapshot(
  snapshotId: string,
): MarketSnapshot | null {
  const snapshot = configuredSnapshots.find(
    (candidate) => candidate.snapshotId === snapshotId,
  );
  return snapshot ? structuredClone(snapshot) : null;
}
