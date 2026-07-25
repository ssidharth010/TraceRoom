import { createHash } from "node:crypto";
import type { TelemetryQuestionAnswer } from "../integrations/signozMcpAuditor";
import type { RecordedSession } from "../session/types";

export function buildProofPack(
  session: RecordedSession,
  mcpAnswer: TelemetryQuestionAnswer | null,
) {
  const failedEvidence =
    session.evidenceValidation.agents
      .flatMap((agent) => agent.checkedEvidence)
      .find((claim) => claim.validationStatus !== "valid") ?? null;
  const payload = {
    kind: "traceroom.decision-proof-pack",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sessionId: session.sessionId,
    traceId: session.signoz.traceId,
    scenario: session.scenario,
    outcome: session.outcome,
    snapshot: session.snapshot,
    evidence: {
      original: session.scenarioInjection.evidenceOverride?.originalValue ?? null,
      injected: session.scenarioInjection.evidenceOverride?.forcedValue ?? null,
      failedClaim: failedEvidence,
      validation: session.evidenceValidation,
    },
    gate: session.pipelineGate,
    execution: session.execution,
    stageStatuses: session.stageStatuses,
    agents: session.agents,
    proposals: session.proposals,
    signoz: session.signoz,
    mcp:
      mcpAnswer === null
        ? null
        : {
            source: mcpAnswer.source,
            answer: mcpAnswer.answer,
            evidence: mcpAnswer.evidence,
          },
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  return {
    ...payload,
    integrity: {
      algorithm: "SHA-256" as const,
      digest,
      covers: "JSON.stringify(proof pack without integrity)",
    },
  };
}
