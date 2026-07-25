import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  configuredSnapshots,
  getConfiguredSnapshot,
} from "../config/snapshots";
import { resolveConsensus } from "../debate/resolveConsensus";
import { validateEvidence } from "../evidence/validateEvidence";
import { marketSnapshot } from "../fixtures/marketSnapshot";
import { answerTelemetryQuestion } from "../integrations/signozMcpAuditor";
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
assert.equal(configuredSnapshots[0]?.symbol, "ACME");
assert.equal(getConfiguredSnapshot("snapshot-003")?.symbol, "ORBT");
assert.equal(getConfiguredSnapshot("missing-snapshot"), null);

const proposals: AgentProposal[] = ["agent-1", "agent-2", "agent-3"].map(
  (agentId) => ({
    agentId,
    snapshotId: marketSnapshot.snapshotId,
    position: "LONG",
    confidence: 0.7,
    thesis:
      "ACME has snapshot-grounded momentum suitable for this replay test.",
    evidence: [
      {
        sourceId: `market.quote:${marketSnapshot.symbol}`,
        claimType: "CURRENT_PRICE",
        citedValue: marketSnapshot.currentPrice,
        statement: "The current ACME price matches the shared replay snapshot.",
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
const faultyEvidence = validateEvidence(
  marketSnapshot,
  fault.proposals.flatMap((proposal) => proposal.evidence),
);
assert.equal(faultyEvidence.validationStatus, "price_deviation");
assert.equal(faultyEvidence.invalidCount, 1);

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
    "ACME remains a snapshot-grounded LONG after cross-examination.",
  position: "LONG",
  confidence: 0.7,
  supportedProposalAgentId: proposal.agentId,
  rationale: "The shared ACME snapshot supports the final LONG vote.",
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
  snapshot: {
    symbol: "ACME",
  },
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
            citedValue: 112.86,
            referenceValue: 104.5,
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
assert.match(auditorFallback.answer, /112\.86/);
assert.match(auditorFallback.answer, /104\.50/);
assert.match(auditorFallback.answer, /8\.00%/);
assert.match(auditorFallback.answer, /2\.00%/);
assert.match(auditorFallback.answer, /EVIDENCE_INTEGRITY/);
assert.match(auditorFallback.answer, /BLOCKED/);

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
