import "dotenv/config";
import type { RecordedSession } from "../session/types";

export type TelemetryAnswerSource = "signoz_mcp" | "session_fallback";

export interface TelemetryEvidence {
  label: string;
  value: string;
}

export interface TelemetryQuestionAnswer {
  answer: string;
  evidence: TelemetryEvidence[];
  traceId: string;
  signozLinks: RecordedSession["signoz"];
  source: TelemetryAnswerSource;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

interface McpTool {
  name: string;
  description?: string;
}

interface McpCallResult<T> {
  result: T;
  sessionId: string | null;
}

interface SelectedTool {
  name: string;
  arguments: Record<string, unknown>;
}

export async function probeSignozMcp(): Promise<
  "READY" | "UNAUTHORIZED" | "UNAVAILABLE"
> {
  try {
    const initialized = await rawMcpRequest({
      method: "initialize",
      params: {
        protocolVersion: getMcpProtocolVersion(),
        capabilities: {},
        clientInfo: {
          name: "traceroom-readiness",
          version: "0.1.0",
        },
      },
      sessionId: null,
      hasId: true,
    });
    await mcpNotification(
      "notifications/initialized",
      {},
      initialized.sessionId,
    );
    const tools = await mcpRequest<{ tools?: McpTool[] }>(
      "tools/list",
      {},
      initialized.sessionId,
    );
    return tools.tools?.length ? "READY" : "UNAVAILABLE";
  } catch (error) {
    return error instanceof Error && /\b401\b|authoriz/i.test(error.message)
      ? "UNAUTHORIZED"
      : "UNAVAILABLE";
  }
}

export async function answerTelemetryQuestion(
  session: RecordedSession,
  question: string,
): Promise<TelemetryQuestionAnswer> {
  const normalizedQuestion = question.trim();
  if (normalizedQuestion.length === 0) {
    throw new Error("Enter a question about this session.");
  }

  try {
    const mcpEvidence = await querySignozMcp(session, normalizedQuestion);
    return {
      answer: buildAnswer(session, normalizedQuestion, "signoz_mcp"),
      evidence: [...baseEvidence(session), ...mcpEvidence],
      traceId: session.signoz.traceId,
      signozLinks: session.signoz,
      source: "signoz_mcp",
    };
  } catch (error) {
    return {
      answer: buildAnswer(session, normalizedQuestion, "session_fallback"),
      evidence: [
        ...baseEvidence(session),
        {
          label: "Telemetry source",
          value:
            "SigNoz MCP was unavailable, so this answer used the persisted TraceRoom session.",
        },
        {
          label: "MCP error",
          value: error instanceof Error ? error.message : String(error),
        },
      ],
      traceId: session.signoz.traceId,
      signozLinks: session.signoz,
      source: "session_fallback",
    };
  }
}

function buildAnswer(
  session: RecordedSession,
  question: string,
  source: TelemetryAnswerSource,
): string {
  const grounding =
    source === "signoz_mcp"
      ? "SigNoz MCP found the session telemetry."
      : "SigNoz MCP could not be reached; this is the deterministic TraceRoom fallback.";
  const failedEvidence = session.evidenceValidation.agents
    .flatMap((agent) => agent.checkedEvidence)
    .find((claim) => claim.validationStatus !== "valid");

  if (/span|stage|fail|error/i.test(question)) {
    const failedStage =
      session.pipelineGate.blockedAt === "EVIDENCE_VALIDATION"
        ? "evidence.validation"
        : (session.error?.stage ?? "none");
    return `${grounding} The stage to inspect is ${failedStage}. The session outcome is ${session.outcome}, and execution is ${session.execution.status}.`;
  }

  if (/evidence|price|claim|integrity|why/i.test(question) && failedEvidence) {
    return `${grounding} Evidence integrity failed because the cited value ${failedEvidence.citedValue.toFixed(2)} differed from the authoritative value ${failedEvidence.referenceValue.toFixed(2)} by ${failedEvidence.deviationPct.toFixed(2)}%, above the ${session.evidenceValidation.agents.find((agent) => agent.checkedEvidence.includes(failedEvidence))?.tolerancePct.toFixed(2) ?? "2.00"}% tolerance. The pipeline recorded ${session.pipelineGate.reasonCode ?? "EVIDENCE_INTEGRITY"} and execution was ${session.execution.status}.`;
  }

  if (/execution|attempt|trade|order|block/i.test(question)) {
    return `${grounding} Execution is ${session.execution.status}. ${session.execution.reason}`;
  }

  if (/risk|rule|veto/i.test(question)) {
    const rules =
      session.riskReview?.triggeredRuleIds.join(", ") ||
      session.pipelineGate.reasonCode ||
      "None";
    return `${grounding} Risk review is ${session.riskReview?.status ?? "NOT RUN"}. Triggered or blocking rules: ${rules}. Execution is ${session.execution.status}.`;
  }

  if (/alert/i.test(question)) {
    return `${grounding} The evidence-integrity state is ${session.evidenceValidation.validationStatus.toUpperCase()}, so the relevant alert condition is ${session.evidenceValidation.blocked ? "Evidence integrity critical" : "not active for this session"}.`;
  }

  return `${grounding} ${buildAuditorSummary(session)}`;
}

function buildAuditorSummary(session: RecordedSession): string {
  if (session.pipelineGate.status === "BLOCKED") {
    return `${session.snapshot.symbol} was blocked at ${session.pipelineGate.blockedAt} by ${session.pipelineGate.reasonCode}. ${session.evidenceValidation.validCount}/${session.evidenceValidation.checkedCount} evidence claims passed validation, and execution was ${session.execution.status}.`;
  }

  return `${session.snapshot.symbol} reached ${session.consensus?.status ?? "no consensus"} ${session.consensus?.position ?? "without a position"}. ${session.evidenceValidation.validCount}/${session.evidenceValidation.checkedCount} evidence claims passed validation, risk review was ${session.riskReview?.status ?? "not run"}, and execution was ${session.execution.status}.`;
}

function baseEvidence(session: RecordedSession): TelemetryEvidence[] {
  const failedEvidence = session.evidenceValidation.agents
    .flatMap((agent) => agent.checkedEvidence)
    .find((claim) => claim.validationStatus !== "valid");

  return [
    { label: "Session ID", value: session.sessionId },
    { label: "Trace ID", value: session.signoz.traceId },
    {
      label: "Evidence status",
      value: session.evidenceValidation.validationStatus,
    },
    {
      label: "Risk verdict",
      value: session.riskReview?.status ?? "NOT RUN",
    },
    { label: "Execution", value: session.execution.status },
    {
      label: "Blocking rules",
      value:
        session.riskReview?.triggeredRuleIds.join(", ") ||
        session.pipelineGate.reasonCode ||
        "None",
    },
    ...(failedEvidence
      ? [
          {
            label: "Failed evidence",
            value: `cited ${failedEvidence.citedValue.toFixed(2)} vs authoritative ${failedEvidence.referenceValue.toFixed(2)} (${failedEvidence.deviationPct.toFixed(2)}% deviation)`,
          },
        ]
      : []),
  ];
}

async function querySignozMcp(
  session: RecordedSession,
  question: string,
): Promise<TelemetryEvidence[]> {
  const initialized = await rawMcpRequest({
    method: "initialize",
    params: {
      protocolVersion: getMcpProtocolVersion(),
      capabilities: {},
      clientInfo: {
        name: "traceroom-api",
        version: "0.1.0",
      },
    },
    sessionId: null,
    hasId: true,
  });
  const sessionId = initialized.sessionId;

  await mcpNotification("notifications/initialized", {}, sessionId);
  const toolsResult = await mcpRequest<{ tools?: McpTool[] }>(
    "tools/list",
    {},
    sessionId,
  );
  const tools = toolsResult.tools ?? [];
  const selected = selectReadOnlyTool(tools, session, question);
  if (!selected) {
    throw new Error(
      "SigNoz MCP did not advertise a supported read-only search tool.",
    );
  }

  const result = await mcpRequest<unknown>(
    "tools/call",
    {
      name: selected.name,
      arguments: selected.arguments,
    },
    sessionId,
  );
  const toolError = getMcpToolError(result);
  if (toolError) {
    throw new Error(`SigNoz MCP tool ${selected.name} failed: ${toolError}`);
  }

  return [
    { label: "Telemetry source", value: `Connected to ${getMcpUrl()}` },
    { label: "MCP search tool", value: selected.name },
    { label: "MCP result", value: summarizeMcpResult(result) },
  ];
}

function selectReadOnlyTool(
  tools: McpTool[],
  session: RecordedSession,
  question: string,
): SelectedTool | null {
  const names = new Set(tools.map((tool) => tool.name));
  const common = { searchContext: question };
  const call = (
    preferredNames: string[],
    argumentsValue: Record<string, unknown>,
  ): SelectedTool | null => {
    const name = preferredNames.find((candidate) => names.has(candidate));
    return name ? { name, arguments: { ...argumentsValue, ...common } } : null;
  };

  if (/alert/i.test(question)) {
    return call(["signoz_list_alerts", "signoz_list_alert_rules"], {
      limit: 20,
    });
  }
  if (/dashboard/i.test(question)) {
    return call(["signoz_list_dashboards"], { limit: 20 });
  }
  if (/metric|latency|token|cost/i.test(question)) {
    return call(["signoz_list_metrics"], {
      searchText: "traceroom",
      timeRange: "24h",
      limit: 20,
    });
  }
  if (/log|message/i.test(question)) {
    return call(["signoz_search_logs"], {
      searchText: session.sessionId,
      timeRange: "24h",
      limit: 20,
    });
  }

  return (
    call(["signoz_get_trace_details"], {
      traceId: session.signoz.traceId,
      timeRange: "24h",
      includeSpans: true,
    }) ??
    call(["signoz_search_traces"], {
      searchText: session.sessionId,
      timeRange: "24h",
      limit: 20,
    })
  );
}

async function mcpRequest<T>(
  method: string,
  params: Record<string, unknown>,
  sessionId: string | null,
): Promise<T> {
  const response = await rawMcpRequest<T>({
    method,
    params,
    sessionId,
    hasId: true,
  });
  return response.result;
}

async function mcpNotification(
  method: string,
  params: Record<string, unknown>,
  sessionId: string | null,
): Promise<void> {
  await rawMcpRequest({
    method,
    params,
    sessionId,
    hasId: false,
  });
}

async function rawMcpRequest<T>({
  method,
  params,
  sessionId,
  hasId,
}: {
  method: string;
  params: Record<string, unknown>;
  sessionId: string | null;
  hasId: boolean;
}): Promise<McpCallResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getMcpTimeoutMs());

  try {
    const response = await fetch(getMcpUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": getMcpProtocolVersion(),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        ...mcpAuthHeaders(),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(hasId ? { id: crypto.randomUUID() } : {}),
        method,
        params,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `MCP ${method} failed with ${response.status}: ${summarizeMcpResult(text)}`,
      );
    }
    if (!hasId || response.status === 202 || text.trim().length === 0) {
      return {
        result: undefined as T,
        sessionId: response.headers.get("mcp-session-id"),
      };
    }

    const parsed = parseMcpResponse<T>(text);
    if (parsed.error) {
      throw new Error(parsed.error.message);
    }
    if (parsed.result === undefined) {
      throw new Error("MCP response did not include a result.");
    }
    return {
      result: parsed.result,
      sessionId: response.headers.get("mcp-session-id"),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SigNoz MCP timed out after ${getMcpTimeoutMs()}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getMcpToolError(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as {
    isError?: unknown;
    structuredContent?: { code?: unknown };
  };
  const failed =
    candidate.isError === true ||
    candidate.structuredContent?.code === "VALIDATION_FAILED";
  return failed ? summarizeMcpResult(value) : null;
}

function mcpAuthHeaders(): Record<string, string> {
  const apiKey = process.env.SIGNOZ_API_KEY ?? process.env.SIGNOZ_MCP_API_KEY;
  return apiKey
    ? {
        "SIGNOZ-API-KEY": apiKey,
      }
    : {};
}

function getMcpUrl(): string {
  return process.env.SIGNOZ_MCP_URL ?? "http://localhost:8000/mcp";
}

function getMcpTimeoutMs(): number {
  const configured = Number(process.env.SIGNOZ_MCP_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 2_500;
}

function getMcpProtocolVersion(): string {
  return process.env.SIGNOZ_MCP_PROTOCOL_VERSION ?? "2025-06-18";
}

function parseMcpResponse<T>(text: string): JsonRpcResponse<T> {
  const eventData = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");

  return JSON.parse(eventData.at(-1) ?? text) as JsonRpcResponse<T>;
}

function summarizeMcpResult(value: unknown): string {
  const text = extractMcpText(value);
  return text.length > 2_000 ? `${text.slice(0, 1_997)}...` : text;
}

function extractMcpText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const content = (value as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const texts = content
        .map((item) =>
          item && typeof item === "object" && "text" in item
            ? String((item as { text: unknown }).text)
            : "",
        )
        .filter(Boolean);
      if (texts.length > 0) {
        return texts.join(" ");
      }
    }
  }
  return JSON.stringify(value);
}
