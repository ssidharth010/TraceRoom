import { randomUUID } from "node:crypto";
import type { SpanContext } from "@opentelemetry/api";
import { agentConfigs } from "../config/agents";
import type { MarketSnapshot } from "../domain/market";
import { runFinalVoteStage } from "../debate/runFinalVoteStage";
import { runProposalStage } from "../debate/runProposalStage";
import { runRebuttalStage } from "../debate/runRebuttalStage";
import { resolveConsensus } from "../debate/resolveConsensus";
import { traceEvidenceValidation } from "../evidence/traceEvidenceValidation";
import { runEvaluationTrace } from "../evaluation/runEvaluationTrace";
import { evaluationFixture } from "../fixtures/evaluationFixture";
import { marketSnapshot } from "../fixtures/marketSnapshot";
import { traceMarketSnapshot } from "../market/traceMarketSnapshot";
import { traceRiskReview } from "../risk/traceRiskreview";
import {
  applyControlledEvidenceFault,
  type ControlledEvidenceScenario,
} from "../scenarios/applyControlledEvidenceFault";
import {
  applyControlledVoteScenario,
  type ControlledVoteScenario,
} from "../scenarios/applyControlledVoteScenario";
import {
  getRiskReviewScenario,
  type RiskReviewScenario,
} from "../scenarios/getRiskReviewScenario";
import { scenarioEnvironmentValue } from "../scenarios/runScenario";
import type { Position } from "../schemas/proposal";
import { logError, logInfo } from "../telemetry/logger";
import {
  createSessionLlmUsage,
  finalizeSessionLlmUsage,
  withSessionLlmUsage,
} from "../telemetry/sessionLlmUsage";
import { withSpan } from "../telemetry/withSpan";
import type { RecordedSession, ReplayStep, SessionScenario } from "./types";

interface DebateResult {
  sourceSpanContext: SpanContext;
  scenario: SessionScenario;
  proposals: RecordedSession["proposals"];
  rebuttals: RecordedSession["rebuttals"];
  finalVotes: RecordedSession["finalVotes"];
  consensus: RecordedSession["consensus"];
  evidenceValidation: RecordedSession["evidenceValidation"];
  riskReview: RecordedSession["riskReview"];
  evidenceScenario: ControlledEvidenceScenario;
  voteScenario: ControlledVoteScenario;
  riskScenario: RiskReviewScenario;
}

class ControlledWorkflowError extends Error {
  readonly code = "CONTROLLED_WORKFLOW_ERROR";
  readonly stage = "SESSION_RECORDING";
}

class ControlledEvidenceBlock extends Error {
  readonly code = "EVIDENCE_INTEGRITY";
  readonly stage = "EVIDENCE_VALIDATION";
}

export async function runDebateSession(
  scenario: SessionScenario,
  snapshot: MarketSnapshot = marketSnapshot,
): Promise<RecordedSession> {
  const sessionId = randomUUID();
  const startedAt = Date.now();
  const createdAt = new Date(startedAt).toISOString();
  let completedResult: DebateResult | undefined;
  let controlledError: ControlledWorkflowError | undefined;
  const sessionLlmUsage = createSessionLlmUsage();

  let debateResult: DebateResult;

  try {
    debateResult = await withSessionLlmUsage(sessionLlmUsage, () =>
      withSpan("debate.session", async (sessionSpan) => {
        sessionSpan.setAttributes({
          "traceroom.session.id": sessionId,
          "traceroom.session.mode": "historical_replay",
          "traceroom.scenario": scenario,
          "scenario.injected": scenario !== "healthy",
          "scenario.type": scenario,
          "market.snapshot.id": snapshot.snapshotId,
          "market.symbol": snapshot.symbol,
          "decision.horizon_minutes": snapshot.decisionHorizonMinutes,
          "debate.agent_count": agentConfigs.length,
          "debate.max_rounds": 3,
        });

        await traceMarketSnapshot(snapshot);

        const generatedProposals = await withSpan(
          "debate.round.proposal",
          async (span) => {
            span.setAttributes({
              "debate.round.number": 1,
              "debate.stage": "PROPOSAL",
              "debate.agent_count": agentConfigs.length,
            });

            const results = await runProposalStage(agentConfigs, snapshot);

            span.setAttributes({
              "proposal.long_count": results.filter(
                (proposal) => proposal.position === "LONG",
              ).length,
              "proposal.short_count": results.filter(
                (proposal) => proposal.position === "SHORT",
              ).length,
              "proposal.no_trade_count": results.filter(
                (proposal) => proposal.position === "NO_TRADE",
              ).length,
            });
            span.addEvent("proposal.stage.completed", {
              "proposal.count": results.length,
            });

            return results;
          },
        );

        const controlledScenario = applyControlledEvidenceFault(
          generatedProposals,
          scenarioEnvironmentValue(scenario),
          snapshot,
        );
        const proposals = controlledScenario.proposals;

        if (controlledScenario.faultInjected) {
          sessionSpan.setAttributes({
            "scenario.injected": true,
            "scenario.type": controlledScenario.scenario,
            "scenario.evidence_overridden": true,
            "fault.injected": true,
            "fault.type": "evidence-price-deviation",
            "fault.agent_id": controlledScenario.agentId,
            "fault.claim_index": controlledScenario.claimIndex,
            "fault.original_value": controlledScenario.originalValue,
            "fault.tampered_value": controlledScenario.tamperedValue,
          });
          sessionSpan.addEvent("controlled_fault.injected", {
            "fault.type": "evidence-price-deviation",
            "agent.id": controlledScenario.agentId,
            "evidence.claim_index": controlledScenario.claimIndex,
            "evidence.original_value": controlledScenario.originalValue,
            "evidence.tampered_value": controlledScenario.tamperedValue,
          });
        }

        const evidenceValidation = await traceEvidenceValidation(
          snapshot,
          proposals,
        );

        sessionSpan.setAttributes({
          "evidence.checked_count": evidenceValidation.checkedCount,
          "evidence.valid_count": evidenceValidation.validCount,
          "evidence.invalid_count": evidenceValidation.invalidCount,
          "evidence.invalid_agent_count": evidenceValidation.invalidAgentCount,
          "evidence.validation.status": evidenceValidation.validationStatus,
          "evidence.blocked": evidenceValidation.blocked,
        });
        sessionSpan.addEvent("evidence.validation.completed", {
          "evidence.checked_count": evidenceValidation.checkedCount,
          "evidence.valid_count": evidenceValidation.validCount,
          "evidence.invalid_count": evidenceValidation.invalidCount,
          "evidence.validation.status": evidenceValidation.validationStatus,
          "evidence.blocked": evidenceValidation.blocked,
        });

        if (evidenceValidation.blocked) {
          sessionSpan.setAttributes({
            "pipeline.gate.status": "BLOCKED",
            "pipeline.blocked_at": "EVIDENCE_VALIDATION",
            "pipeline.block_reason": "EVIDENCE_INTEGRITY",
            "pipeline.short_circuited": true,
            "pipeline.skipped_stage_count": 5,
            "decision.outcome": "EVIDENCE_BLOCKED",
          });
          sessionSpan.addEvent("execution.blocked_early", {
            "execution.block_reason": "evidence_integrity",
            "evidence.invalid_count": evidenceValidation.invalidCount,
          });
          sessionSpan.addEvent("pipeline.short_circuited", {
            "pipeline.blocked_at": "EVIDENCE_VALIDATION",
            "pipeline.block_reason": "EVIDENCE_INTEGRITY",
            "pipeline.skipped_stages": [
              "CROSS_EXAMINATION",
              "FINAL_VOTE",
              "CONSENSUS",
              "RISK_REVIEW",
              "EVALUATION",
            ],
          });

          const blockedResult = {
            sourceSpanContext: sessionSpan.spanContext(),
            scenario,
            proposals,
            rebuttals: [],
            finalVotes: [],
            consensus: null,
            evidenceValidation,
            riskReview: null,
            evidenceScenario: controlledScenario,
            voteScenario: applyControlledVoteScenario([], scenario),
            riskScenario: getRiskReviewScenario("normal"),
          } satisfies DebateResult;

          completedResult = blockedResult;
          logError("Evidence integrity gate blocked the debate pipeline", {
            "event.name": "pipeline.evidence_integrity.blocked",
            "traceroom.session.id": sessionId,
            "snapshot.id": snapshot.snapshotId,
            "pipeline.blocked_at": "EVIDENCE_VALIDATION",
            "pipeline.block_reason": "EVIDENCE_INTEGRITY",
            "pipeline.short_circuited": true,
            "evidence.invalid_count": evidenceValidation.invalidCount,
            "evidence.invalid_agent_count":
              evidenceValidation.invalidAgentCount,
          });
          finalizeSessionLlmUsage(
            sessionSpan,
            sessionLlmUsage,
            scenario,
            "EVIDENCE_BLOCKED",
          );
          throw new ControlledEvidenceBlock(
            `${evidenceValidation.invalidCount} evidence claim(s) failed validation; downstream stages were not run`,
          );
        }

        const rebuttals = await withSpan(
          "debate.round.cross_examination",
          async (span) => {
            span.setAttributes({
              "debate.round.number": 2,
              "debate.stage": "CROSS_EXAMINATION",
              "debate.agent_count": agentConfigs.length,
            });

            const results = await runRebuttalStage(
              agentConfigs,
              snapshot,
              proposals,
            );
            const critiqueCount = results.reduce(
              (total, rebuttal) => total + rebuttal.critiques.length,
              0,
            );

            span.setAttributes({
              "rebuttal.count": results.length,
              "critique.count": critiqueCount,
            });
            span.addEvent("cross_examination.stage.completed", {
              "rebuttal.count": results.length,
              "critique.count": critiqueCount,
            });

            return results;
          },
        );

        const finalVoteStage = await withSpan(
          "debate.round.final_vote",
          async (span) => {
            span.setAttributes({
              "debate.round.number": 3,
              "debate.stage": "FINAL_VOTE",
              "debate.agent_count": agentConfigs.length,
            });

            const generatedResults = await runFinalVoteStage(
              agentConfigs,
              snapshot,
              proposals,
              rebuttals,
            );
            const voteScenario = applyControlledVoteScenario(
              generatedResults,
              scenario,
            );
            const results = voteScenario.finalVotes;

            if (voteScenario.applied) {
              const overriddenCount = voteScenario.voteOverrides.filter(
                (vote) => vote.overridden,
              ).length;

              span.setAttributes({
                "scenario.injected": true,
                "scenario.type": voteScenario.type,
                "scenario.votes_overridden": voteScenario.votesOverridden,
                "scenario.vote_override_count": overriddenCount,
              });
              span.addEvent("controlled_vote_scenario.applied", {
                "scenario.type": voteScenario.type,
                "scenario.votes_overridden": voteScenario.votesOverridden,
                "scenario.vote_override_count": overriddenCount,
                "final_vote.long_count": results.filter(
                  (vote) => vote.position === "LONG",
                ).length,
                "final_vote.short_count": results.filter(
                  (vote) => vote.position === "SHORT",
                ).length,
                "final_vote.no_trade_count": results.filter(
                  (vote) => vote.position === "NO_TRADE",
                ).length,
              });

              for (const voteOverride of voteScenario.voteOverrides) {
                const attributes = {
                  "agent.id": voteOverride.agentId,
                  "vote.original_position": voteOverride.originalPosition,
                  "vote.forced_position": voteOverride.forcedPosition,
                  "vote.overridden": voteOverride.overridden,
                };
                span.addEvent("scenario.vote_override", attributes);
                logInfo("Controlled vote scenario mapping recorded", {
                  "event.name": "scenario.vote_override",
                  "traceroom.session.id": sessionId,
                  "scenario.type": voteScenario.type,
                  ...attributes,
                });
              }

              sessionSpan.setAttributes({
                "scenario.injected": true,
                "scenario.type": voteScenario.type,
                "scenario.votes_overridden": voteScenario.votesOverridden,
                "scenario.vote_override_count": overriddenCount,
                "fault.injected": true,
                "fault.type": voteScenario.type,
              });
            }

            span.setAttributes({
              "final_vote.long_count": results.filter(
                (vote) => vote.position === "LONG",
              ).length,
              "final_vote.short_count": results.filter(
                (vote) => vote.position === "SHORT",
              ).length,
              "final_vote.no_trade_count": results.filter(
                (vote) => vote.position === "NO_TRADE",
              ).length,
              "final_vote.changed_count": results.filter(
                (vote) => vote.changedFromInitial,
              ).length,
            });
            span.addEvent("final_vote.stage.completed", {
              "final_vote.count": results.length,
            });

            return {
              finalVotes: results,
              voteScenario,
            };
          },
        );
        const { finalVotes, voteScenario } = finalVoteStage;

        const consensus = await withSpan("consensus.resolve", async (span) => {
          const result = resolveConsensus(finalVotes);

          span.setAttributes({
            "consensus.status": result.status,
            "consensus.position": result.position ?? "NONE",
            "consensus.unanimous": result.unanimous,
            "consensus.supporting_agent_ids": [...result.supportingAgentIds],
            "consensus.dissenting_agent_ids": [
              ...(result.dissentingAgentIds ?? []),
            ],
          });

          return result;
        });

        sessionSpan.setAttributes({
          "consensus.status": consensus.status,
          "consensus.position": consensus.position ?? "NONE",
          "consensus.unanimous": consensus.unanimous,
          "consensus.changed_agent_count": consensus.changedAgentIds.length,
          "consensus.dissenting_agent_count":
            consensus.dissentingAgentIds?.length,
          "consensus.supporting_agent_ids": [...consensus.supportingAgentIds],
          "consensus.dissenting_agent_ids": [
            ...(consensus.dissentingAgentIds ?? []),
          ],
        });
        sessionSpan.addEvent("consensus.resolved", {
          status: consensus.status,
          position: consensus.position ?? "NONE",
          unanimous: consensus.unanimous,
        });

        logInfo("Consensus resolved", {
          "event.name": "debate.consensus.resolved",
          "traceroom.session.id": sessionId,
          "snapshot.id": snapshot.snapshotId,
          "consensus.status": consensus.status,
          "consensus.position": consensus.position ?? "none",
          "consensus.unanimous": consensus.unanimous,
          "consensus.supporting_agent_ids": consensus.supportingAgentIds,
          "consensus.dissenting_agent_ids": consensus.dissentingAgentIds,
          "consensus.changed_agent_ids": consensus.changedAgentIds,
          "consensus.long_count": consensus.voteCounts.LONG,
          "consensus.short_count": consensus.voteCounts.SHORT,
          "consensus.no_trade_count": consensus.voteCounts.NO_TRADE,
        });

        const riskScenario = getRiskReviewScenario(
          scenarioEnvironmentValue(scenario),
        );

        if (riskScenario.policyOverridden) {
          sessionSpan.setAttributes({
            "scenario.injected": true,
            "scenario.risk_policy_overridden": true,
            "scenario.risk_policy.rule_id":
              riskScenario.overriddenRuleId ?? "MAX_PRICE_MOVE",
            "scenario.risk_policy.original_threshold":
              riskScenario.originalThreshold ?? 0,
            "scenario.risk_policy.forced_threshold":
              riskScenario.scenarioThreshold ?? 0,
          });
          sessionSpan.addEvent("scenario.risk_policy_override", {
            "risk.rule.id": riskScenario.overriddenRuleId ?? "MAX_PRICE_MOVE",
            "risk.threshold.original": riskScenario.originalThreshold ?? 0,
            "risk.threshold.forced": riskScenario.scenarioThreshold ?? 0,
          });
        }

        const riskReview = await traceRiskReview(
          consensus,
          snapshot,
          riskScenario.policy,
          evidenceValidation.blocked,
        );

        sessionSpan.setAttributes({
          "risk.review.status": riskReview.status,
          "risk.position": riskReview.position ?? "NONE",
          "risk.trade_allowed": riskReview.tradeAllowed,
          "risk.triggered_rule_count": riskReview.triggeredRuleIds.length,
          "risk.triggered_rule_ids": [...riskReview.triggeredRuleIds],
          "decision.outcome": evidenceValidation.blocked
            ? "EVIDENCE_BLOCKED"
            : riskReview.status,
        });
        sessionSpan.addEvent("risk.review.completed", {
          "risk.review.status": riskReview.status,
          "risk.position": riskReview.position ?? "NONE",
          "risk.trade_allowed": riskReview.tradeAllowed,
          "risk.triggered_rule_count": riskReview.triggeredRuleIds.length,
        });

        const result = {
          sourceSpanContext: sessionSpan.spanContext(),
          scenario,
          proposals,
          rebuttals,
          finalVotes,
          consensus,
          evidenceValidation,
          riskReview,
          evidenceScenario: controlledScenario,
          voteScenario,
          riskScenario,
        } satisfies DebateResult;

        completedResult = result;

        if (scenario === "error") {
          finalizeSessionLlmUsage(
            sessionSpan,
            sessionLlmUsage,
            scenario,
            "ERROR",
          );
          await withSpan("workflow.recording", async (span) => {
            sessionSpan.setAttribute("decision.outcome", "ERROR");
            sessionSpan.setAttributes({
              "scenario.injected": true,
              "scenario.type": "workflow-recording-error",
            });
            span.setAttributes({
              "traceroom.session.id": sessionId,
              "error.injected": true,
              "error.stage": "SESSION_RECORDING",
              "error.type": "controlled-validation-error",
            });
            span.addEvent("controlled_error.injected", {
              "error.code": "CONTROLLED_WORKFLOW_ERROR",
              "error.message":
                "Decision record failed controlled post-stage validation.",
            });
            throw new ControlledWorkflowError(
              "Controlled replay error: decision record failed post-stage validation",
            );
          });
        }

        finalizeSessionLlmUsage(
          sessionSpan,
          sessionLlmUsage,
          scenario,
          evidenceValidation.blocked ? "EVIDENCE_BLOCKED" : riskReview.status,
        );
        return result;
      }),
    );
  } catch (error) {
    if (error instanceof ControlledEvidenceBlock && completedResult) {
      debateResult = completedResult;
    } else if (error instanceof ControlledWorkflowError && completedResult) {
      controlledError = error;
      debateResult = completedResult;
      logError("Controlled workflow error recorded", {
        "event.name": "workflow.recording.failed",
        "traceroom.session.id": sessionId,
        "error.code": error.code,
        "error.stage": error.stage,
        "error.message": error.message,
      });
    } else {
      throw error;
    }
  }

  const evaluation =
    controlledError || !debateResult.consensus
      ? null
      : await evaluateConsensus(sessionId, debateResult, snapshot);
  const executionAllowed =
    !controlledError && (debateResult.riskReview?.tradeAllowed ?? false);
  const outcome = controlledError
    ? "ERROR"
    : debateResult.evidenceValidation.blocked
      ? "EVIDENCE_BLOCKED"
      : (debateResult.riskReview?.status ?? "ERROR");

  return {
    schemaVersion: 4,
    sessionId,
    createdAt,
    durationMs: Date.now() - startedAt,
    mode: scenario,
    scenario,
    scenarioInjection: buildScenarioInjection(debateResult, controlledError),
    snapshot,
    agents: [...agentConfigs],
    lifecycle: buildLifecycle(debateResult, controlledError),
    stageStatuses: buildStageStatuses(
      debateResult,
      controlledError,
      evaluation !== null,
    ),
    pipelineGate: buildPipelineGate(debateResult),
    proposals: debateResult.proposals,
    rebuttals: debateResult.rebuttals,
    finalVotes: debateResult.finalVotes,
    consensus: debateResult.consensus,
    evidenceValidation: debateResult.evidenceValidation,
    riskReview: debateResult.riskReview,
    evaluation,
    evaluationNote:
      evaluation !== null
        ? "Historical outcome evaluation completed."
        : snapshot.snapshotId !== evaluationFixture.snapshotId
          ? "Historical outcome evaluation skipped because this dynamic snapshot has no matching outcome fixture."
          : null,
    execution: {
      executionAllowed,
      status: executionAllowed ? "READY" : "BLOCKED",
      reason: controlledError
        ? "A controlled workflow error stopped session finalization. No trade was placed."
        : debateResult.evidenceValidation.blocked
          ? "Evidence integrity failed, so TraceRoom stopped the pipeline before cross-examination. No downstream decision stages or trade were run."
          : executionAllowed
            ? "Risk review approved the replay decision. No trade was placed."
            : "Risk review blocked execution. No trade was placed.",
    },
    outcome,
    ...(controlledError
      ? {
          error: {
            code: controlledError.code,
            stage: controlledError.stage,
            message: controlledError.message,
          },
        }
      : {}),
    replay: buildReplay(debateResult, snapshot, controlledError),
    signoz: {
      traceId: debateResult.sourceSpanContext.traceId,
      traceUrl: `${signozBaseUrl()}/trace/${debateResult.sourceSpanContext.traceId}`,
      logsHint: `Search logs for traceroom.session.id="${sessionId}"`,
      dashboardUrl: `${signozBaseUrl()}/dashboard`,
    },
  };
}

async function evaluateConsensus(
  sessionId: string,
  debateResult: DebateResult,
  snapshot: MarketSnapshot,
): Promise<RecordedSession["evaluation"]> {
  const consensus = debateResult.consensus;

  if (!consensus || consensus.status !== "CONSENSUS" || !consensus.position) {
    return null;
  }

  if (evaluationFixture.snapshotId !== snapshot.snapshotId) return null;

  const dissentingPositions: Position[] = debateResult.finalVotes
    .filter((vote) => consensus.dissentingAgentIds?.includes(vote.agentId))
    .map((vote) => vote.position);

  return runEvaluationTrace({
    sessionId,
    sourceSpanContext: debateResult.sourceSpanContext,
    fixture: evaluationFixture,
    selectedPosition: consensus.position,
    dissentingPositions,
  });
}

function buildLifecycle(
  debateResult: DebateResult,
  controlledError?: ControlledWorkflowError,
): string[] {
  if (debateResult.evidenceValidation.blocked) {
    return [
      "SESSION_CREATED",
      "MARKET_SNAPSHOT_READY",
      "INDEPENDENT_PROPOSALS",
      "EVIDENCE_BLOCKED",
      "PIPELINE_STOPPED",
    ];
  }

  return [
    "SESSION_CREATED",
    "MARKET_SNAPSHOT_READY",
    "INDEPENDENT_PROPOSALS",
    "EVIDENCE_VALIDATED",
    "CROSS_EXAMINATION",
    "FINAL_VOTES",
    "CONSENSUS_RESOLUTION",
    "RISK_REVIEW",
    debateResult.riskReview?.status ?? "RISK_NOT_RUN",
    ...(controlledError ? ["ERROR"] : []),
    controlledError || !debateResult.riskReview?.tradeAllowed
      ? "BLOCKED"
      : "EXECUTION_READY",
    ...(!controlledError && debateResult.consensus?.status === "CONSENSUS"
      ? ["EVALUATED"]
      : []),
  ];
}

function buildStageStatuses(
  debateResult: DebateResult,
  controlledError: ControlledWorkflowError | undefined,
  evaluationCompleted: boolean,
): RecordedSession["stageStatuses"] {
  if (debateResult.evidenceValidation.blocked) {
    return {
      marketSnapshot: "COMPLETED",
      proposals: "COMPLETED",
      evidenceValidation: "BLOCKED",
      crossExamination: "SKIPPED",
      finalVote: "SKIPPED",
      consensus: "SKIPPED",
      riskReview: "SKIPPED",
      evaluation: "SKIPPED",
    };
  }

  return {
    marketSnapshot: "COMPLETED",
    proposals: "COMPLETED",
    evidenceValidation: "COMPLETED",
    crossExamination: "COMPLETED",
    finalVote: "COMPLETED",
    consensus: "COMPLETED",
    riskReview: "COMPLETED",
    evaluation: controlledError
      ? "SKIPPED"
      : evaluationCompleted
        ? "COMPLETED"
        : "SKIPPED",
  };
}

function buildPipelineGate(
  debateResult: DebateResult,
): RecordedSession["pipelineGate"] {
  if (debateResult.evidenceValidation.blocked) {
    return {
      status: "BLOCKED",
      blockedAt: "EVIDENCE_VALIDATION",
      reasonCode: "EVIDENCE_INTEGRITY",
      message:
        "Evidence validation failed. Cross-examination, final voting, consensus, risk review, and evaluation were not run.",
    };
  }

  return {
    status: "PASSED",
    blockedAt: null,
    reasonCode: null,
    message:
      "Evidence passed validation and the downstream pipeline continued.",
  };
}

function buildScenarioInjection(
  debateResult: DebateResult,
  controlledError?: ControlledWorkflowError,
): RecordedSession["scenarioInjection"] {
  const voteOverrides = debateResult.voteScenario.voteOverrides;

  switch (debateResult.scenario) {
    case "evidence-fault": {
      const evidenceScenario = debateResult.evidenceScenario;
      return {
        injected: true,
        type: "evidence-price-deviation",
        description:
          "Controlled fault injection changed one generated evidence value before deterministic validation.",
        votesOverridden: false,
        voteOverrides: [],
        ...(evidenceScenario.faultInjected
          ? {
              evidenceOverride: {
                agentId: evidenceScenario.agentId,
                claimIndex: evidenceScenario.claimIndex,
                originalValue: evidenceScenario.originalValue,
                forcedValue: evidenceScenario.tamperedValue,
              },
            }
          : {}),
      };
    }
    case "risk-veto":
      return {
        injected: true,
        type: "directional-risk-veto",
        description:
          "The real LLM final votes were recorded, then the scenario normalized the room to LONG and lowered MAX_PRICE_MOVE to exercise the deterministic veto path.",
        votesOverridden: debateResult.voteScenario.votesOverridden,
        voteOverrides,
        riskPolicyOverride: {
          ruleId:
            debateResult.riskScenario.overriddenRuleId ?? "MAX_PRICE_MOVE",
          originalThreshold: debateResult.riskScenario.originalThreshold ?? 0,
          scenarioThreshold: debateResult.riskScenario.scenarioThreshold ?? 0,
        },
      };
    case "deadlock":
      return {
        injected: true,
        type: "deadlock",
        description:
          "The real LLM final votes were recorded, then the scenario forced a LONG/SHORT/NO_TRADE split to exercise deadlock detection.",
        votesOverridden: debateResult.voteScenario.votesOverridden,
        voteOverrides,
      };
    case "error":
      return {
        injected: true,
        type: "workflow-recording-error",
        description: controlledError
          ? "A controlled post-stage recording error was injected after all real LLM stages completed."
          : "The workflow-recording error scenario was requested.",
        votesOverridden: false,
        voteOverrides: [],
      };
    case "healthy":
      return {
        injected: false,
        type: "none",
        description:
          "No controlled fault or output override was applied to this replay.",
        votesOverridden: false,
        voteOverrides: [],
      };
  }
}

function buildReplay(
  debateResult: DebateResult,
  snapshot: MarketSnapshot,
  controlledError?: ControlledWorkflowError,
): ReplayStep[] {
  if (debateResult.evidenceValidation.blocked) {
    return [
      {
        order: 1,
        title: `${snapshot.symbol} snapshot captured`,
        detail: `Snapshot ${snapshot.snapshotId} captured ${snapshot.symbol} at ${snapshot.currentPrice}.`,
      },
      {
        order: 2,
        title: "Independent proposals completed",
        detail: `${debateResult.proposals.length} agents produced snapshot-grounded proposals.`,
      },
      {
        order: 3,
        title: "Evidence integrity failed",
        detail: `${debateResult.evidenceValidation.invalidCount} claim(s) failed deterministic validation.`,
      },
      {
        order: 4,
        title: "Pipeline stopped at the evidence gate",
        detail:
          "Cross-examination, final voting, consensus, risk review, evaluation, and execution were not run.",
      },
    ];
  }

  const steps: ReplayStep[] = [
    {
      order: 1,
      title: `${snapshot.symbol} snapshot captured`,
      detail: `Snapshot ${snapshot.snapshotId} captured ${snapshot.symbol} at ${snapshot.currentPrice}.`,
    },
    {
      order: 2,
      title: "Independent proposals completed",
      detail: `${debateResult.proposals.length} agents produced snapshot-grounded proposals.`,
    },
    {
      order: 3,
      title: debateResult.evidenceValidation.blocked
        ? "Evidence integrity failed"
        : "Evidence validated",
      detail: debateResult.evidenceValidation.blocked
        ? `${debateResult.evidenceValidation.invalidCount} claim(s) failed validation and execution was blocked.`
        : `${debateResult.evidenceValidation.validCount}/${debateResult.evidenceValidation.checkedCount} claims matched the snapshot.`,
    },
    {
      order: 4,
      title: "Cross-examination completed",
      detail: `${debateResult.rebuttals.length} agents challenged the other proposals.`,
    },
    {
      order: 5,
      title: "Final votes submitted",
      detail:
        debateResult.scenario === "deadlock"
          ? `Injected scenario preserved the generated votes, then forced ${formatVoteOverrides(debateResult.voteScenario)} to produce no majority.`
          : debateResult.scenario === "risk-veto"
            ? `Injected scenario preserved the generated votes, then forced ${formatVoteOverrides(debateResult.voteScenario)} for deterministic risk evaluation.`
            : `${debateResult.finalVotes.length} final votes were recorded.`,
    },
    {
      order: 6,
      title: "Consensus resolved",
      detail: `${debateResult.consensus?.status ?? "NOT_RUN"}: ${debateResult.consensus?.position ?? "no position"}.`,
    },
    {
      order: 7,
      title: "Risk review completed",
      detail: `${debateResult.riskReview?.status ?? "NOT_RUN"}; trade allowed=${debateResult.riskReview?.tradeAllowed ?? false}.`,
    },
  ];

  if (controlledError) {
    steps.push({
      order: 8,
      title: "Controlled workflow error recorded",
      detail: controlledError.message,
    });
  }

  if (snapshot.snapshotId !== evaluationFixture.snapshotId) {
    steps.push({
      order: steps.length + 1,
      title: "Historical evaluation skipped",
      detail:
        "This dynamic snapshot has no matching future-outcome fixture. The decision trace remains valid.",
    });
  }

  return steps;
}

function formatVoteOverrides(voteScenario: ControlledVoteScenario): string {
  return voteScenario.voteOverrides
    .map(
      (vote) =>
        `${vote.agentId} ${vote.originalPosition}->${vote.forcedPosition}`,
    )
    .join(", ");
}

function signozBaseUrl(): string {
  return process.env.SIGNOZ_BASE_URL ?? "http://localhost:8080";
}
