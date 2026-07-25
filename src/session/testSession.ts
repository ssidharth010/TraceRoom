import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  configuredSnapshots,
  getConfiguredSnapshot,
} from "../config/snapshots";
import { resolveConsensus } from "../debate/resolveConsensus";
import { validateEvidence } from "../evidence/validateEvidence";
import { marketSnapshot } from "../fixtures/marketSnapshot";
import { answerTelemetryQuestion } from "../integrations/signozMcpAuditor";
import {
  hasVerifiedAlertUrls,
  hasVerifiedDashboardUrl,
  signozAlertUrls,
  signozDashboardUrl,
} from "../integrations/signozConfig";
import { toSessionTelemetryVerification } from "../integrations/verifySessionTelemetry";
import { buildProofPack } from "../proof/buildProofPack";
import { evaluateRisk } from "../risk/evaluationRisk";
import { applyControlledEvidenceFault } from "../scenarios/applyControlledEvidenceFault";
import { applyControlledVoteScenario } from "../scenarios/applyControlledVoteScenario";
import { getRiskReviewScenario } from "../scenarios/getRiskReviewScenario";
import {
  EVIDENCE_FAULT_ENV_VALUE,
  RISK_VETO_ENV_VALUE,
  resolveSessionScenario,
  scenarioEnvironmentValue,
} from "../scenarios/runScenario";
import type { FinalVote } from "../schemas/finalVote";
import type { AgentProposal } from "../schemas/proposal";
import type { RecordedSession } from "./types";

assert.equal(configuredSnapshots.length, 4);
assert.equal(configuredSnapshots[0]?.snapshotId, "snapshot-001");
assert.equal(configuredSnapshots[0]?.symbol, "INFY");
assert.equal(configuredSnapshots[0]?.currentPrice, 1684.5);

const originalDashboardUrl = process.env.SIGNOZ_DASHBOARD_URL;
const originalAlertUrls = process.env.SIGNOZ_ALERT_URLS;
process.env.SIGNOZ_DASHBOARD_URL =
  "http://localhost:8080/dashboard/submission-evidence-id";
process.env.SIGNOZ_ALERT_URLS = [
  "http://localhost:8080/alerts/overview?ruleId=evidence",
  "http://localhost:8080/alerts/overview?ruleId=failure",
  "http://localhost:8080/alerts/overview?ruleId=cost",
].join(",");
assert.equal(
  signozDashboardUrl(),
  "http://localhost:8080/dashboard/submission-evidence-id",
);
assert.equal(hasVerifiedDashboardUrl(), true);
assert.equal(signozAlertUrls().length, 3);
assert.equal(hasVerifiedAlertUrls(), true);
if (originalDashboardUrl === undefined) delete process.env.SIGNOZ_DASHBOARD_URL;
else process.env.SIGNOZ_DASHBOARD_URL = originalDashboardUrl;
if (originalAlertUrls === undefined) delete process.env.SIGNOZ_ALERT_URLS;
else process.env.SIGNOZ_ALERT_URLS = originalAlertUrls;
assert.equal(getConfiguredSnapshot("snapshot-003")?.symbol, "ORBT");
assert.equal(getConfiguredSnapshot("missing-snapshot"), null);

const proposals: AgentProposal[] = ["agent-1", "agent-2", "agent-3"].map(
  (agentId) => ({
    agentId,
    snapshotId: marketSnapshot.snapshotId,
    position: "LONG",
    confidence: 0.7,
    thesis:
      "INFY has snapshot-grounded momentum suitable for this replay test.",
    evidence: [
      {
        sourceId: `market.quote:${marketSnapshot.symbol}`,
        claimType: "CURRENT_PRICE",
        citedValue: marketSnapshot.currentPrice,
        statement: "The current INFY price matches the shared replay snapshot.",
      },
    ],
    risks: [],
  }),
);

const healthyEvidence = validateEvidence(
  marketSnapshot,
  proposals.flatMap((proposal) => proposal.evidence),
);
assert.equal(healthyEvidence.validationStatus, "valid");
assert.equal(healthyEvidence.invalidCount, 0);

const fault = applyControlledEvidenceFault(proposals, EVIDENCE_FAULT_ENV_VALUE);
assert.equal(fault.faultInjected, true);
if (fault.faultInjected) {
  assert.equal(fault.originalValue, 1684.5);
  assert.equal(fault.tamperedValue, 1819.26);
}
const faultyEvidence = validateEvidence(
  marketSnapshot,
  fault.proposals.flatMap((proposal) => proposal.evidence),
);
assert.equal(faultyEvidence.validationStatus, "price_deviation");
assert.equal(faultyEvidence.invalidCount, 1);
assert.equal(faultyEvidence.tolerancePct, 2);
assert.equal(faultyEvidence.checkedEvidence[0]?.referenceValue, 1684.5);
assert.equal(faultyEvidence.checkedEvidence[0]?.citedValue, 1819.26);
assert.equal(
  faultyEvidence.checkedEvidence[0]?.deviationPct.toFixed(2),
  "8.00",
);

const finalVotes: FinalVote[] = proposals.map((proposal) => ({
  agentId: proposal.agentId,
  snapshotId: proposal.snapshotId,
  initialPosition: proposal.position,
  changedFromInitial: false,
  critiqueResponses: [
    {
      sourceAgentId: "peer-1",
      disposition: "ACCEPTED",
      response:
        "The critique was accepted for this deterministic session test.",
    },
    {
      sourceAgentId: "peer-2",
      disposition: "ACCEPTED",
      response: "The second critique was accepted for this session test.",
    },
  ],
  revisedThesis:
    "INFY remains a snapshot-grounded LONG after cross-examination.",
  position: "LONG",
  confidence: 0.7,
  supportedProposalAgentId: proposal.agentId,
  rationale: "The shared INFY snapshot supports the final LONG vote.",
}));

const consensus = resolveConsensus(finalVotes);
assert.equal(consensus.status, "CONSENSUS");
assert.equal(consensus.position, "LONG");

const riskReview = evaluateRisk(consensus, marketSnapshot);
assert.equal(riskReview.status, "APPROVED");
assert.equal(riskReview.tradeAllowed, true);

const evidenceVeto = evaluateRisk(consensus, marketSnapshot, undefined, true);
assert.equal(evidenceVeto.status, "VETOED");
assert.equal(evidenceVeto.tradeAllowed, false);
assert.deepEqual(evidenceVeto.triggeredRuleIds, ["EVIDENCE_INTEGRITY"]);

const mixedFinalVotes: FinalVote[] = finalVotes.map((vote, index) => ({
  ...vote,
  position: index === 0 ? "SHORT" : index === 1 ? "NO_TRADE" : "LONG",
}));
const riskVoteScenario = applyControlledVoteScenario(
  mixedFinalVotes,
  "risk-veto",
);
assert.equal(riskVoteScenario.applied, true);
assert.equal(riskVoteScenario.votesOverridden, true);
assert.deepEqual(
  riskVoteScenario.voteOverrides.map((vote) => ({
    original: vote.originalPosition,
    forced: vote.forcedPosition,
    overridden: vote.overridden,
  })),
  [
    { original: "SHORT", forced: "LONG", overridden: true },
    { original: "NO_TRADE", forced: "LONG", overridden: true },
    { original: "LONG", forced: "LONG", overridden: false },
  ],
);
assert.ok(
  riskVoteScenario.finalVotes.every((vote) => vote.position === "LONG"),
);
const riskConsensus = resolveConsensus(riskVoteScenario.finalVotes);
const strictRiskScenario = getRiskReviewScenario(RISK_VETO_ENV_VALUE);
const riskVeto = evaluateRisk(
  riskConsensus,
  marketSnapshot,
  strictRiskScenario.policy,
);
assert.equal(riskVeto.status, "VETOED");
assert.equal(riskVeto.tradeAllowed, false);
assert.ok(riskVeto.triggeredRuleIds.includes("MAX_PRICE_MOVE"));
assert.equal(
  riskVeto.rules.find((rule) => rule.ruleId === "CONSENSUS_REQUIRED")?.message,
  "The recorded final positions resolved to LONG.",
);

const deadlockVoteScenario = applyControlledVoteScenario(
  finalVotes,
  "deadlock",
);
assert.equal(deadlockVoteScenario.applied, true);
assert.equal(deadlockVoteScenario.votesOverridden, true);
assert.deepEqual(
  deadlockVoteScenario.voteOverrides.map((vote) => vote.originalPosition),
  ["LONG", "LONG", "LONG"],
);
assert.deepEqual(
  deadlockVoteScenario.finalVotes.map((vote) => vote.position),
  ["LONG", "SHORT", "NO_TRADE"],
);
const deadlockConsensus = resolveConsensus(deadlockVoteScenario.finalVotes);
assert.equal(deadlockConsensus.status, "DEADLOCKED");
assert.equal(deadlockConsensus.position, null);
const deadlockRisk = evaluateRisk(deadlockConsensus, marketSnapshot);
assert.equal(deadlockRisk.status, "DEADLOCKED");
assert.deepEqual(deadlockRisk.triggeredRuleIds, ["CONSENSUS_REQUIRED"]);

assert.equal(resolveSessionScenario("healthy"), "healthy");
assert.equal(resolveSessionScenario("fault"), "evidence-fault");
assert.equal(resolveSessionScenario("risk-veto"), "risk-veto");
assert.equal(resolveSessionScenario("error"), "error");
assert.equal(resolveSessionScenario("deadlock"), "deadlock");
assert.equal(
  scenarioEnvironmentValue("evidence-fault"),
  EVIDENCE_FAULT_ENV_VALUE,
);

process.env.SIGNOZ_MCP_URL = "http://127.0.0.1:1/mcp";
process.env.SIGNOZ_MCP_TIMEOUT_MS = "100";
const auditorFixture = {
  sessionId: "auditor-evidence-fault",
  scenario: "evidence-fault",
  scenarioInjection: {
    evidenceOverride: {
      originalValue: 1684.5,
      forcedValue: 1819.26,
    },
  },
  snapshot: {
    snapshotId: "snapshot-001",
    symbol: "INFY",
    currentPrice: 1684.5,
  },
  stageStatuses: {
    marketSnapshot: "COMPLETED",
    proposals: "COMPLETED",
    evidenceValidation: "BLOCKED",
    crossExamination: "SKIPPED",
    finalVote: "SKIPPED",
    consensus: "SKIPPED",
    riskReview: "SKIPPED",
    evaluation: "SKIPPED",
  },
  agents: [],
  proposals: [],
  consensus: null,
  pipelineGate: {
    status: "BLOCKED",
    blockedAt: "EVIDENCE_VALIDATION",
    reasonCode: "EVIDENCE_INTEGRITY",
  },
  evidenceValidation: {
    checkedCount: 1,
    validCount: 0,
    validationStatus: "price_deviation",
    blocked: true,
    agents: [
      {
        tolerancePct: 2,
        checkedEvidence: [
          {
            citedValue: 1819.26,
            referenceValue: 1684.5,
            deviationPct: 8,
            validationStatus: "price_deviation",
          },
        ],
      },
    ],
  },
  riskReview: null,
  execution: {
    status: "BLOCKED",
    reason: "Execution blocked by the evidence-integrity gate.",
  },
  outcome: "EVIDENCE_BLOCKED",
  signoz: {
    traceId: "trace-auditor-fixture",
    traceUrl: "http://localhost:8080/trace/trace-auditor-fixture",
    logsHint: 'session.id="auditor-evidence-fault"',
    dashboardUrl: "http://localhost:8080/dashboard",
  },
} as unknown as RecordedSession;
const auditorFallback = await answerTelemetryQuestion(
  auditorFixture,
  "Why was execution blocked?",
);
assert.equal(auditorFallback.source, "session_fallback");
assert.match(auditorFallback.answer, /1819\.26/);
assert.match(auditorFallback.answer, /1684\.50/);
assert.match(auditorFallback.answer, /8\.00%/);
assert.match(auditorFallback.answer, /2\.00%/);
assert.match(auditorFallback.answer, /EVIDENCE_INTEGRITY/);
assert.match(auditorFallback.answer, /BLOCKED/);
const fallbackVerification = toSessionTelemetryVerification(
  auditorFixture,
  {
    trace: auditorFallback,
    logs: auditorFallback,
    dashboard: auditorFallback,
    alert: auditorFallback,
  },
);
assert.equal(fallbackVerification.mcpVerified, false);
assert.equal(fallbackVerification.traceVerified, false);

const liveAnswer = (value: string) => ({
  source: "signoz_mcp" as const,
  answer: "Verified.",
  traceId: auditorFixture.signoz.traceId,
  signozLinks: auditorFixture.signoz,
  evidence: [{ label: "MCP result", value }],
});
const inactiveAlertVerification = toSessionTelemetryVerification(
  auditorFixture,
  {
    trace: liveAnswer(auditorFixture.signoz.traceId),
    logs: liveAnswer(auditorFixture.sessionId),
    dashboard: liveAnswer("TraceRoom / Submission Evidence"),
    alert: liveAnswer(
      '{"alert":"TraceRoom / Evidence Integrity Block","state":"inactive","searchContext":"Were any alerts firing?"}',
    ),
  },
);
assert.equal(inactiveAlertVerification.alertFiring, false);
const firingAlertVerification = toSessionTelemetryVerification(
  auditorFixture,
  {
    trace: liveAnswer(auditorFixture.signoz.traceId),
    logs: liveAnswer(auditorFixture.sessionId),
    dashboard: liveAnswer("TraceRoom / Submission Evidence"),
    alert: liveAnswer(
      '{"alert":"TraceRoom / Evidence Integrity Block","state":"firing"}',
    ),
  },
);
assert.equal(firingAlertVerification.alertFiring, true);

const proofPack = buildProofPack(auditorFixture, auditorFallback);
assert.equal(proofPack.kind, "traceroom.decision-proof-pack");
assert.equal(proofPack.snapshot.symbol, "INFY");
assert.equal(proofPack.evidence.injected, 1819.26);
assert.equal(proofPack.integrity.algorithm, "SHA-256");
assert.match(proofPack.integrity.digest, /^[a-f0-9]{64}$/);
const { integrity: proofIntegrity, ...proofPayload } = proofPack;
assert.equal(
  proofIntegrity.digest,
  createHash("sha256").update(JSON.stringify(proofPayload)).digest("hex"),
);

const mcpMethods: string[] = [];
const mockMcpServer = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      id?: string;
      method: string;
      params?: {
        name?: string;
      };
    };
    mcpMethods.push(body.method);

    if (body.method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }

    const result =
      body.method === "initialize"
        ? {
            protocolVersion: "2025-06-18",
            capabilities: {},
            serverInfo: { name: "test-signoz", version: "1.0.0" },
          }
        : body.method === "tools/list"
          ? {
              tools: [
                {
                  name: "signoz_get_trace_details",
                  description: "Read one trace.",
                },
              ],
            }
          : {
              content: [
                {
                  type: "text",
                  text: `Trace ${auditorFixture.signoz.traceId} contains evidence.validation.`,
                },
              ],
            };

    response.writeHead(200, {
      "Content-Type": "application/json",
      ...(body.method === "initialize"
        ? { "Mcp-Session-Id": "test-mcp-session" }
        : {}),
    });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
});
await new Promise<void>((resolve) => {
  mockMcpServer.listen(0, "127.0.0.1", resolve);
});
const mockAddress = mockMcpServer.address();
assert.ok(mockAddress && typeof mockAddress === "object");
process.env.SIGNOZ_MCP_URL = `http://127.0.0.1:${mockAddress.port}/mcp`;
process.env.SIGNOZ_MCP_TIMEOUT_MS = "2000";
const liveAuditorAnswer = await answerTelemetryQuestion(
  auditorFixture,
  "Which span failed?",
);
await new Promise<void>((resolve, reject) => {
  mockMcpServer.close((error) => (error ? reject(error) : resolve()));
});
assert.equal(liveAuditorAnswer.source, "signoz_mcp");
assert.deepEqual(mcpMethods, [
  "initialize",
  "notifications/initialized",
  "tools/list",
  "tools/call",
]);
assert.ok(
  liveAuditorAnswer.evidence.some(
    (item) =>
      item.label === "MCP search tool" &&
      item.value === "signoz_get_trace_details",
  ),
);

console.log("TraceRoom five-scenario unit tests passed");
