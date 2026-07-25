import type { AgentConfig } from "../domain/agent";
import type { MarketSnapshot } from "../domain/market";
import type { ConsensusResult } from "../debate/resolveConsensus";
import type { EvidenceValidationReport } from "../evidence/traceEvidenceValidation";
import type { DecisionEvaluationReport } from "../evaluation/evaluateDecision";
import type { RiskReviewResult } from "../risk/evaluationRisk";
import type { FinalVote } from "../schemas/finalVote";
import type { AgentProposal, Position } from "../schemas/proposal";
import type { AgentRebuttal } from "../schemas/rebuttal";

export type SessionScenario =
  | "healthy"
  | "evidence-fault"
  | "risk-veto"
  | "error"
  | "deadlock";

export type SessionOutcome =
  | RiskReviewResult["status"]
  | "EVIDENCE_BLOCKED"
  | "ERROR";

export type SessionStageStatus = "COMPLETED" | "BLOCKED" | "SKIPPED" | "ERROR";

export interface SessionStageStatuses {
  marketSnapshot: SessionStageStatus;
  proposals: SessionStageStatus;
  evidenceValidation: SessionStageStatus;
  crossExamination: SessionStageStatus;
  finalVote: SessionStageStatus;
  consensus: SessionStageStatus;
  riskReview: SessionStageStatus;
  evaluation: SessionStageStatus;
}

export interface PipelineGate {
  status: "PASSED" | "BLOCKED";
  blockedAt: "EVIDENCE_VALIDATION" | null;
  reasonCode: "EVIDENCE_INTEGRITY" | null;
  message: string;
}

export interface ReplayStep {
  order: number;
  title: string;
  detail: string;
}

export interface VoteOverride {
  agentId: string;
  originalPosition: Position;
  forcedPosition: Position;
  overridden: boolean;
}

export interface ScenarioInjectionRecord {
  injected: boolean;
  type:
    | "none"
    | "evidence-price-deviation"
    | "directional-risk-veto"
    | "workflow-recording-error"
    | "deadlock";
  description: string;
  votesOverridden: boolean;
  voteOverrides: VoteOverride[];
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
}

export interface RecordedSession {
  schemaVersion: 4;
  sessionId: string;
  createdAt: string;
  durationMs: number;
  mode: SessionScenario;
  scenario: SessionScenario;
  scenarioInjection: ScenarioInjectionRecord;
  snapshot: MarketSnapshot;
  agents: AgentConfig[];
  lifecycle: string[];
  stageStatuses: SessionStageStatuses;
  pipelineGate: PipelineGate;
  proposals: AgentProposal[];
  rebuttals: AgentRebuttal[];
  finalVotes: FinalVote[];
  consensus: ConsensusResult | null;
  evidenceValidation: EvidenceValidationReport;
  riskReview: RiskReviewResult | null;
  evaluation: DecisionEvaluationReport | null;
  evaluationNote?: string | null;
  execution: {
    executionAllowed: boolean;
    status: "READY" | "BLOCKED";
    reason: string;
  };
  outcome: SessionOutcome;
  error?: {
    code: string;
    stage: string;
    message: string;
  };
  replay: ReplayStep[];
  signoz: {
    traceId: string;
    traceUrl: string;
    logsHint: string;
    dashboardUrl: string;
  };
}
