export type SessionScenario =
  | "healthy"
  | "evidence-fault"
  | "risk-veto"
  | "error"
  | "deadlock";

export type StageStatus = "COMPLETED" | "BLOCKED" | "SKIPPED" | "ERROR";

export interface CheckedEvidence {
  sourceId: string;
  claimType: string;
  statement: string;
  citedValue: number;
  referenceValue: number;
  deviationPct: number;
  validationStatus: string;
}

export interface MarketSnapshot {
  snapshotId: string;
  symbol: string;
  observedAt: string;
  decisionHorizonMinutes: number;
  currentPrice: number;
  previousClose: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  averageVolume: number;
  indicators: {
    sma20: number;
    ema9: number;
    rsi14: number;
  };
}

export interface RecordedSession {
  schemaVersion: 4;
  sessionId: string;
  createdAt: string;
  durationMs?: number;
  mode: SessionScenario;
  scenario: SessionScenario;
  scenarioInjection: {
    injected: boolean;
    type:
      | "none"
      | "evidence-price-deviation"
      | "directional-risk-veto"
      | "workflow-recording-error"
      | "deadlock";
    description: string;
    votesOverridden: boolean;
    voteOverrides: Array<{
      agentId: string;
      originalPosition: string;
      forcedPosition: string;
      overridden: boolean;
    }>;
    evidenceOverride?: {
      agentId: string;
      claimIndex: number;
      originalValue: number;
      forcedValue: number;
    };
    riskPolicyOverride?: {
      ruleId: "MAX_PRICE_MOVE";
      originalThreshold: number;
      scenarioThreshold: number;
    };
  };
  snapshot: MarketSnapshot;
  agents: Array<{
    agentId: string;
    displayName: string;
    persona: string;
    riskAppetite: string;
  }>;
  lifecycle: string[];
  stageStatuses: {
    marketSnapshot: StageStatus;
    proposals: StageStatus;
    evidenceValidation: StageStatus;
    crossExamination: StageStatus;
    finalVote: StageStatus;
    consensus: StageStatus;
    riskReview: StageStatus;
    evaluation: StageStatus;
  };
  pipelineGate: {
    status: "PASSED" | "BLOCKED";
    blockedAt: "EVIDENCE_VALIDATION" | null;
    reasonCode: "EVIDENCE_INTEGRITY" | null;
    message: string;
  };
  proposals: Array<{
    agentId: string;
    position: string;
    confidence: number;
    thesis: string;
    evidence: Array<{
      sourceId: string;
      claimType: string;
      citedValue: number;
      statement: string;
    }>;
    risks: string[];
  }>;
  rebuttals: Array<{
    agentId: string;
    snapshotId: string;
    critiques: Array<{
      targetAgentId: string;
      strongestAgreement: string;
      strongestObjection: string;
      evidenceConflicts: string[];
    }>;
    overallAssessment: string;
  }>;
  finalVotes: Array<{
    agentId: string;
    position: string;
    confidence: number;
    rationale: string;
    initialPosition: string;
    changedFromInitial: boolean;
  }>;
  consensus: {
    status: string;
    position: string | null;
    unanimous: boolean;
    voteCounts: Record<string, number>;
    supportingAgentIds: string[];
    changedAgentIds: string[];
    dissentingAgentIds?: string[];
  } | null;
  evidenceValidation: {
    checkedCount: number;
    validCount: number;
    invalidCount: number;
    invalidAgentCount: number;
    validationStatus: string;
    blocked: boolean;
    agents: Array<{
      agentId: string;
      validationStatus: string;
      checkedCount: number;
      validCount: number;
      invalidCount: number;
      tolerancePct: number;
      checkedEvidence: CheckedEvidence[];
    }>;
  };
  riskReview: {
    status: "APPROVED" | "VETOED" | "DEADLOCKED";
    tradeAllowed: boolean;
    triggeredRuleIds: string[];
    rules: Array<{
      ruleId: string;
      outcome: "PASSED" | "TRIGGERED" | "NOT_APPLICABLE";
      message: string;
      observedValue?: number;
      thresholdValue?: number;
    }>;
  } | null;
  evaluationNote?: string | null;
  execution: {
    executionAllowed: boolean;
    status: "READY" | "BLOCKED";
    reason: string;
  };
  outcome: "APPROVED" | "EVIDENCE_BLOCKED" | "VETOED" | "DEADLOCKED" | "ERROR";
  error?: {
    code: string;
    stage: string;
    message: string;
  };
  replay: Array<{
    order: number;
    title: string;
    detail: string;
  }>;
  signoz: {
    traceId: string;
    traceUrl: string;
    logsHint: string;
    dashboardUrl: string;
    alertUrls?: string[];
  };
}

export interface DemoReadiness {
  ready: boolean;
  checkedAt: string;
  api: "READY" | "UNAVAILABLE";
  llm: "READY" | "UNAVAILABLE";
  signozUi: "READY" | "UNAVAILABLE";
  signozMcp: "READY" | "UNAUTHORIZED" | "UNAVAILABLE";
  dashboard: "VERIFIED" | "UNVERIFIED";
  alerts: "VERIFIED" | "UNVERIFIED";
  canonicalFixture: "VERIFIED" | "INVALID";
}

export interface SessionTelemetryVerification {
  checkedAt: string;
  traceVerified: boolean;
  logCorrelated: boolean;
  dashboardUpdated: boolean;
  alertFiring: boolean;
  mcpVerified: boolean;
}

export interface TelemetryQuestionAnswer {
  answer: string;
  evidence: Array<{ label: string; value: string }>;
  traceId: string;
  signozLinks: RecordedSession["signoz"];
  source: "signoz_mcp" | "session_fallback";
}
