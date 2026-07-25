import assert from "node:assert/strict";
import { marketSnapshot } from "../fixtures/marketSnapshot";
import { SnapshotStore } from "../persistence/snapshotStore";
import { applyControlledEvidenceFault } from "../scenarios/applyControlledEvidenceFault";
import type { AgentProposal } from "../schemas/proposal";
import {
  createSnapshotCandidate,
  normalizeSymbol,
  validateSnapshot,
} from "./snapshotService";
import type { SnapshotCandidate } from "./snapshotTypes";
import { mapTwelveDataSnapshot, MarketProviderError } from "./twelveDataClient";

const bars = Array.from({ length: 25 }, (_, index) => ({
  datetime: `2026-07-${String(index + 1).padStart(2, "0")}`,
  close: String(100 + index),
  volume: String(1_000 + index * 10),
}));

const mapped = mapTwelveDataSnapshot(
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    currency: "USD",
    timestamp: Math.floor(Date.now() / 1000),
    open: "122",
    high: "126",
    low: "121",
    close: "124",
    previous_close: "123",
    volume: "1500",
  },
  { values: bars },
  "AAPL",
  "US",
  "snapshot-dynamic-test",
);

assert.equal(mapped.snapshot.symbol, "AAPL");
assert.equal(mapped.snapshot.currentPrice, 124);
assert.equal(mapped.snapshot.previousClose, 123);
assert.equal(mapped.snapshot.indicators.sma20, 114.5);
assert.ok(mapped.snapshot.indicators.ema9 > 0);
assert.ok(mapped.snapshot.indicators.rsi14 >= 0);
assert.equal(
  validateSnapshot(mapped.snapshot).every((check) => check.status === "PASS"),
  true,
);

assert.throws(
  () =>
    mapTwelveDataSnapshot(
      { status: "error", message: "symbol not found" },
      { values: [] },
      "INVALID",
      "US",
      "snapshot-invalid",
    ),
  (error: unknown) =>
    error instanceof MarketProviderError && error.code === "NOT_FOUND",
);

assert.throws(() => normalizeSymbol("AAPL;DROP"), /Symbol must be/);

assert.throws(
  () =>
    mapTwelveDataSnapshot(
      { status: "error", message: "API credits limit reached" },
      { values: [] },
      "AAPL",
      "US",
      "snapshot-rate-limit",
    ),
  (error: unknown) =>
    error instanceof MarketProviderError && error.code === "RATE_LIMITED",
);

assert.throws(
  () =>
    mapTwelveDataSnapshot(
      {
        symbol: "AAPL",
        timestamp: Math.floor(Date.now() / 1000),
        open: "122",
        high: "126",
        low: "121",
        close: "124",
      },
      { values: bars.slice(0, 4) },
      "AAPL",
      "US",
      "snapshot-malformed",
    ),
  (error: unknown) =>
    error instanceof MarketProviderError && error.code === "MALFORMED",
);

const staleSnapshot = {
  ...mapped.snapshot,
  observedAt: "2025-01-01T00:00:00.000Z",
};
assert.equal(
  validateSnapshot(staleSnapshot).find((check) => check.id === "freshness")
    ?.status,
  "FAIL",
);

delete process.env.TWELVE_DATA_API_KEY;
delete process.env.OPENAI_API_KEY;

const fallback = await createSnapshotCandidate({
  symbol: "INFY",
  exchange: "NSE",
});
assert.equal(fallback.status, "FIXTURE_FALLBACK");
assert.equal(fallback.snapshot?.snapshotId, "snapshot-001");
assert.equal(fallback.snapshot?.currentPrice, 1684.5);
assert.equal(fallback.canLock, true);

const blocked = await createSnapshotCandidate({
  symbol: "AAPL",
  exchange: "US",
});
assert.equal(blocked.status, "BLOCKED");
assert.equal(blocked.snapshot, null);
assert.equal(blocked.canLock, false);

const store = new SnapshotStore(":memory:");
store.save(fallback);
const locked = await store.lock(fallback.candidateId);
assert.equal(locked.status, "LOCKED");
assert.equal(locked.canRun, true);
assert.throws(() => store.save({ ...locked, status: "READY" }));
store.close();

const customProposal: AgentProposal = {
  agentId: "agent-test",
  snapshotId: mapped.snapshot.snapshotId,
  position: "LONG",
  confidence: 0.8,
  thesis: "A snapshot-grounded test proposal.",
  evidence: [
    {
      sourceId: "market.quote:AAPL",
      claimType: "CURRENT_PRICE",
      citedValue: mapped.snapshot.currentPrice,
      statement: "AAPL current price matches the authoritative snapshot.",
    },
  ],
  risks: ["Fixture-only unit test"],
};
const dynamicFault = applyControlledEvidenceFault(
  [customProposal],
  "evidence-price-deviation",
  mapped.snapshot,
);
assert.equal(dynamicFault.faultInjected, true);
if (dynamicFault.faultInjected) {
  assert.equal(dynamicFault.tamperedValue, 133.92);
  assert.equal(
    dynamicFault.proposals[0].evidence[0].sourceId,
    "market.quote:AAPL",
  );
}

const canonicalFault = applyControlledEvidenceFault(
  [{ ...customProposal, snapshotId: marketSnapshot.snapshotId }],
  "evidence-price-deviation",
  marketSnapshot,
);
assert.equal(canonicalFault.faultInjected, true);
if (canonicalFault.faultInjected) {
  assert.equal(canonicalFault.tamperedValue, 1819.26);
}

const numericSnapshotBeforeResearch = JSON.stringify(mapped.snapshot);
const researchOnlyCandidate: SnapshotCandidate = {
  ...fallback,
  snapshot: mapped.snapshot,
  research: {
    status: "READY",
    summary: "Research may contain prose but has no numeric authority.",
    catalysts: ["Context only"],
    risks: ["Context only"],
    responseId: "response-test",
    model: "test-model",
    note: null,
  },
};
assert.equal(
  JSON.stringify(researchOnlyCandidate.snapshot),
  numericSnapshotBeforeResearch,
);

console.log("TraceRoom dynamic snapshot tests passed");
