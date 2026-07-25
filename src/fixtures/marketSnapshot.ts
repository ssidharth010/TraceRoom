import { configuredSnapshots } from "../config/snapshots";
import type { MarketSnapshot } from "../domain/market";

export const marketSnapshot: MarketSnapshot = structuredClone(
  configuredSnapshots[0],
);
