export interface EvaluationFixture {
  evaluationId: string;
  snapshotId: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  entryTimestamp: string;
  exitTimestamp: string;
  horizonMinutes: number;
  notionalUsd: number;
  slippageBps: number;
  transactionCostUsd: number;
}

export const evaluationFixture: EvaluationFixture = {
  evaluationId: "evaluation-001",
  snapshotId: "snapshot-001",
  symbol: "INFY",
  entryPrice: 1684.5,
  exitPrice: 1650.12,
  entryTimestamp: "2026-07-18T18:12:27.000Z",
  exitTimestamp: "2026-07-18T18:42:27.000Z",
  horizonMinutes: 30,
  notionalUsd: 1_000,
  slippageBps: 5,
  transactionCostUsd: 1,
};
