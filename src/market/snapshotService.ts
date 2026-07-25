import { randomUUID } from "node:crypto";
import type { MarketSnapshot } from "../domain/market";
import { marketSnapshot } from "../fixtures/marketSnapshot";
import { logInfo } from "../telemetry/logger";
import { withSpan } from "../telemetry/withSpan";
import { researchSnapshotContext } from "./snapshotResearch";
import type {
  CreateSnapshotRequest,
  SnapshotCandidate,
  SnapshotCheck,
  SnapshotExchange,
  SnapshotSource,
} from "./snapshotTypes";
import {
  fetchTwelveDataSnapshot,
  MarketProviderError,
  toProviderSymbol,
} from "./twelveDataClient";

const MARKET_FIELDS = [
  "currentPrice",
  "previousClose",
  "dayOpen",
  "dayHigh",
  "dayLow",
  "volume",
  "averageVolume",
  "indicators.sma20",
  "indicators.ema9",
  "indicators.rsi14",
];

export async function createSnapshotCandidate(
  request: CreateSnapshotRequest,
): Promise<SnapshotCandidate> {
  const symbol = normalizeSymbol(request.symbol);
  const exchange = normalizeExchange(request.exchange);
  const candidateId = randomUUID();
  const snapshotId = `snapshot-${candidateId}`;
  const createdAt = new Date().toISOString();

  return withSpan("snapshot.discover", async (span) => {
    span.setAttributes({
      "snapshot.candidate.id": candidateId,
      "market.symbol": symbol,
      "market.exchange": exchange,
      "snapshot.numeric_authority": "twelve_data",
    });

    const [marketResult, researchResult] = await Promise.all([
      withSpan("market.provider.fetch", async (providerSpan) => {
        providerSpan.setAttributes({
          "market.provider": "twelve_data",
          "market.symbol": symbol,
          "market.exchange": exchange,
          "market.provider_symbol": toProviderSymbol(symbol, exchange),
        });
        return fetchTwelveDataSnapshot(symbol, exchange, snapshotId);
      }).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      researchSnapshotContext(symbol, exchange),
    ]);

    if (!marketResult.ok) {
      const reason =
        marketResult.error instanceof Error
          ? marketResult.error.message
          : "Market data was unavailable.";

      if (symbol === "ACME" && exchange === "US") {
        const fallback = buildFallbackCandidate({
          candidateId,
          createdAt,
          requestedSymbol: symbol,
          reason,
          research: researchResult,
        });
        span.setAttributes({
          "snapshot.status": fallback.status,
          "snapshot.fallback": true,
          "snapshot.can_lock": fallback.canLock,
        });
        return fallback;
      }

      const blocked = buildBlockedCandidate({
        candidateId,
        createdAt,
        symbol,
        exchange,
        reason,
        research: researchResult,
      });
      span.setAttributes({
        "snapshot.status": blocked.status,
        "snapshot.fallback": false,
        "snapshot.can_lock": false,
        "error.type":
          marketResult.error instanceof MarketProviderError
            ? marketResult.error.code
            : "UNKNOWN",
      });
      return blocked;
    }

    const { snapshot, instrument } = marketResult.value;
    const marketSource = marketDataSource(snapshot.observedAt);
    const checks = validateSnapshot(snapshot);
    const stale = checks.some(
      (check) => check.id === "freshness" && check.status === "FAIL",
    );
    const failed = checks.some((check) => check.status === "FAIL");
    const status = stale ? "STALE" : failed ? "BLOCKED" : "READY";
    const candidate: SnapshotCandidate = {
      schemaVersion: 1,
      candidateId,
      createdAt,
      lockedAt: null,
      status,
      canLock: status === "READY",
      canRun: false,
      fallbackReason: null,
      instrument: {
        requestedSymbol: symbol,
        symbol: instrument.symbol,
        exchange,
        providerSymbol: instrument.providerSymbol,
        name: instrument.name,
        currency: instrument.currency,
      },
      snapshot,
      sources: [marketSource, ...researchResult.sources],
      fieldProvenance: buildFieldProvenance(marketSource.id),
      checks: [
        ...checks,
        {
          id: "web-context",
          label: "Web context",
          status: researchResult.research.status === "READY" ? "PASS" : "WARN",
          detail:
            researchResult.research.status === "READY"
              ? `${researchResult.sources.length} cited web source(s) attached.`
              : (researchResult.research.note ??
                "Web context was unavailable."),
        },
      ],
      research: researchResult.research,
    };

    span.setAttributes({
      "market.snapshot.id": snapshot.snapshotId,
      "snapshot.status": candidate.status,
      "snapshot.can_lock": candidate.canLock,
      "snapshot.check_count": candidate.checks.length,
      "snapshot.source_count": candidate.sources.length,
    });
    logInfo("Dynamic snapshot candidate created", {
      "event.name": "snapshot.candidate.created",
      "snapshot.candidate.id": candidateId,
      "market.snapshot.id": snapshot.snapshotId,
      "market.symbol": snapshot.symbol,
      "snapshot.status": candidate.status,
      "snapshot.source_count": candidate.sources.length,
    });
    return candidate;
  });
}

export function validateSnapshot(snapshot: MarketSnapshot): SnapshotCheck[] {
  const values = [
    snapshot.currentPrice,
    snapshot.previousClose,
    snapshot.dayOpen,
    snapshot.dayHigh,
    snapshot.dayLow,
    snapshot.volume,
    snapshot.averageVolume,
    snapshot.indicators.sma20,
    snapshot.indicators.ema9,
    snapshot.indicators.rsi14,
  ];
  const finite = values.every(Number.isFinite);
  const positive = values
    .filter((_, index) => index !== 9)
    .every((value) => value >= 0);
  const ohlc =
    snapshot.dayLow <= snapshot.dayOpen &&
    snapshot.dayOpen <= snapshot.dayHigh &&
    snapshot.dayLow <= snapshot.currentPrice &&
    snapshot.currentPrice <= snapshot.dayHigh;
  const rsi =
    snapshot.indicators.rsi14 >= 0 && snapshot.indicators.rsi14 <= 100;
  const observedAt = new Date(snapshot.observedAt);
  const ageHours = (Date.now() - observedAt.valueOf()) / (60 * 60 * 1000);
  const maxAgeHours = configuredMaxAgeHours();
  const fresh =
    !Number.isNaN(observedAt.valueOf()) &&
    ageHours >= -1 &&
    ageHours <= maxAgeHours;

  return [
    check(
      "finite-values",
      "Finite numeric fields",
      finite && positive,
      finite && positive
        ? "Every numeric market field is finite and non-negative."
        : "At least one numeric market field is invalid.",
    ),
    check(
      "ohlc-order",
      "OHLC consistency",
      ohlc,
      ohlc
        ? "Open and current price fall inside the reported daily range."
        : "Open, current, high, and low values are internally inconsistent.",
    ),
    check(
      "indicator-range",
      "Indicator bounds",
      rsi,
      rsi ? "RSI14 is inside 0-100." : "RSI14 is outside 0-100.",
    ),
    check(
      "freshness",
      "Snapshot freshness",
      fresh,
      fresh
        ? `Provider timestamp is within the ${maxAgeHours}-hour policy.`
        : `Provider timestamp exceeds the ${maxAgeHours}-hour policy.`,
    ),
  ];
}

export function normalizeSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,16}$/.test(symbol)) {
    throw new Error(
      "Symbol must be 1-16 letters, numbers, periods, or hyphens.",
    );
  }
  return symbol;
}

export function normalizeExchange(value: string): SnapshotExchange {
  const exchange = value.trim().toUpperCase();
  if (exchange !== "NSE" && exchange !== "US") {
    throw new Error("Exchange must be NSE or US.");
  }
  return exchange;
}

function buildFallbackCandidate(input: {
  candidateId: string;
  createdAt: string;
  requestedSymbol: string;
  reason: string;
  research: Awaited<ReturnType<typeof researchSnapshotContext>>;
}): SnapshotCandidate {
  const source: SnapshotSource = {
    id: "fixture-acme",
    kind: "MARKET_DATA",
    provider: "TraceRoom Fixture",
    title: "Canonical deterministic ACME replay fixture",
    url: "traceroom://fixtures/snapshot-001",
    observedAt: marketSnapshot.observedAt,
    fields: MARKET_FIELDS,
  };
  return {
    schemaVersion: 1,
    candidateId: input.candidateId,
    createdAt: input.createdAt,
    lockedAt: null,
    status: "FIXTURE_FALLBACK",
    canLock: true,
    canRun: false,
    fallbackReason: input.reason,
    instrument: {
      requestedSymbol: input.requestedSymbol,
      symbol: "ACME",
      exchange: "US",
      providerSymbol: "ACME",
      name: "ACME Replay Corporation",
      currency: "USD",
    },
    snapshot: structuredClone(marketSnapshot),
    sources: [source, ...input.research.sources],
    fieldProvenance: buildFieldProvenance(source.id),
    checks: [
      {
        id: "provider-fallback",
        label: "Deterministic fallback",
        status: "WARN",
        detail:
          "Live provider data was unavailable. The canonical ACME replay fixture is being used and is clearly labeled.",
      },
      ...validateSnapshot(marketSnapshot).map((item) =>
        item.id === "freshness"
          ? {
              ...item,
              status: "WARN" as const,
              detail:
                "Fixture timestamp is historical by design. This path is a deterministic replay.",
            }
          : item,
      ),
    ],
    research: input.research.research,
  };
}

function buildBlockedCandidate(input: {
  candidateId: string;
  createdAt: string;
  symbol: string;
  exchange: SnapshotExchange;
  reason: string;
  research: Awaited<ReturnType<typeof researchSnapshotContext>>;
}): SnapshotCandidate {
  return {
    schemaVersion: 1,
    candidateId: input.candidateId,
    createdAt: input.createdAt,
    lockedAt: null,
    status: "BLOCKED",
    canLock: false,
    canRun: false,
    fallbackReason: null,
    instrument: {
      requestedSymbol: input.symbol,
      symbol: input.symbol,
      exchange: input.exchange,
      providerSymbol: toProviderSymbol(input.symbol, input.exchange),
      name: null,
      currency: null,
    },
    snapshot: null,
    sources: input.research.sources,
    fieldProvenance: {},
    checks: [
      {
        id: "market-provider",
        label: "Authoritative market data",
        status: "FAIL",
        detail: input.reason,
      },
    ],
    research: input.research.research,
  };
}

function marketDataSource(observedAt: string): SnapshotSource {
  return {
    id: "market-twelve-data",
    kind: "MARKET_DATA",
    provider: "Twelve Data",
    title: "Twelve Data quote and daily time series",
    url: "https://twelvedata.com/docs",
    observedAt,
    fields: MARKET_FIELDS,
  };
}

function buildFieldProvenance(sourceId: string): Record<string, string[]> {
  return Object.fromEntries(MARKET_FIELDS.map((field) => [field, [sourceId]]));
}

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
): SnapshotCheck {
  return {
    id,
    label,
    status: passed ? "PASS" : "FAIL",
    detail,
  };
}

function configuredMaxAgeHours(): number {
  const parsed = Number(process.env.SNAPSHOT_MAX_AGE_HOURS ?? 72);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72;
}
