import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  configuredSnapshots,
  getConfiguredSnapshot,
} from "../config/snapshots";
import { getDemoReadiness } from "../demo/readiness";
import { answerTelemetryQuestion } from "../integrations/signozMcpAuditor";
import { verifySessionTelemetry } from "../integrations/verifySessionTelemetry";
import { createSnapshotCandidate } from "../market/snapshotService";
import type { SnapshotExchange } from "../market/snapshotTypes";
import { SessionStore } from "../persistence/sessionStore";
import { SnapshotStore } from "../persistence/snapshotStore";
import { buildProofPack } from "../proof/buildProofPack";
import { resolveSessionScenario } from "../scenarios/runScenario";
import { runDebateSession } from "../session/runDebateSession";
import { telemetrySdk } from "../telemetry/tracing";

const port = Number(process.env.PORT ?? 8787);
const store = new SessionStore();
const snapshotStore = new SnapshotStore();

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`TraceRoom API listening on http://localhost:${port}`);
});

process.on("SIGINT", () => {
  shutdown();
});

process.on("SIGTERM", () => {
  shutdown();
});

async function shutdown(): Promise<void> {
  server.close();
  store.close();
  snapshotStore.close();
  await telemetrySdk.shutdown();
  process.exit(0);
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  applyCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host}`,
  );
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "traceroom-api",
      version: "0.1.0",
      revision: "configured-snapshots-v1",
      configuredSnapshotIds: configuredSnapshots.map(
        (snapshot) => snapshot.snapshotId,
      ),
    });
    return;
  }

  if (request.method === "GET" && pathname === "/demo/readiness") {
    sendJson(response, 200, await getDemoReadiness());
    return;
  }

  if (
    request.method === "POST" &&
    pathname === "/signoz/alerts/webhook"
  ) {
    const payload = await readJsonBody(request);
    console.log(
      `SigNoz alert webhook received: ${JSON.stringify(payload).slice(0, 1_000)}`,
    );
    sendJson(response, 202, { accepted: true });
    return;
  }

  if (request.method === "POST" && pathname === "/sessions/run") {
    const body = await readJsonBody(request);
    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const scenario = resolveSessionScenario(
      (typeof bodyRecord.scenario === "string" ? bodyRecord.scenario : null) ??
        requestUrl.searchParams.get("scenario") ??
        requestUrl.searchParams.get("mode"),
    );
    const snapshotId =
      typeof bodyRecord.snapshotId === "string"
        ? bodyRecord.snapshotId.trim()
        : "";
    const configuredSnapshot = snapshotId
      ? getConfiguredSnapshot(snapshotId)
      : null;
    const candidate =
      snapshotId && !configuredSnapshot ? snapshotStore.get(snapshotId) : null;
    if (snapshotId && !configuredSnapshot && !candidate) {
      sendJson(response, 404, { error: "Configured snapshot not found." });
      return;
    }
    if (candidate && (candidate.status !== "LOCKED" || !candidate.snapshot)) {
      sendJson(response, 409, {
        error: "Only locked snapshots may enter the agent pipeline.",
      });
      return;
    }

    const session = await runDebateSession(
      scenario,
      configuredSnapshot ?? candidate?.snapshot ?? undefined,
    );
    store.save(session);
    console.log(
      `Session completed: scenario=${session.scenario} sessionId=${session.sessionId} traceId=${session.signoz.traceId} outcome=${session.outcome}`,
    );
    sendJson(response, 201, session);
    return;
  }

  if (request.method === "GET" && pathname === "/sessions") {
    sendJson(response, 200, store.list());
    return;
  }

  const sessionMatch = pathname.match(/^\/sessions\/([^/]+)$/);
  if (request.method === "GET" && sessionMatch) {
    const session = store.get(decodeURIComponent(sessionMatch[1]));
    if (!session) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }
    sendJson(response, 200, session);
    return;
  }

  const proofPackMatch = pathname.match(
    /^\/sessions\/([^/]+)\/proof-pack$/,
  );
  if (request.method === "GET" && proofPackMatch) {
    const session = store.get(decodeURIComponent(proofPackMatch[1]));
    if (!session) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }
    const verifyMcp = requestUrl.searchParams.get("verifyMcp") !== "false";
    const mcpAnswer = verifyMcp
      ? await answerTelemetryQuestion(
          session,
          "Why was execution blocked and which evidence failed?",
        )
      : null;
    sendJson(response, 200, buildProofPack(session, mcpAnswer));
    return;
  }

  const verificationMatch = pathname.match(
    /^\/sessions\/([^/]+)\/verification$/,
  );
  if (request.method === "GET" && verificationMatch) {
    const session = store.get(decodeURIComponent(verificationMatch[1]));
    if (!session) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }
    sendJson(response, 200, await verifySessionTelemetry(session));
    return;
  }

  if (request.method === "POST" && pathname === "/market/snapshots") {
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object") {
      sendJson(response, 400, {
        error: "Request body must include symbol and exchange.",
      });
      return;
    }
    const record = body as Record<string, unknown>;
    if (
      typeof record.symbol !== "string" ||
      typeof record.exchange !== "string"
    ) {
      sendJson(response, 400, {
        error: "Request body must include symbol and exchange.",
      });
      return;
    }

    let candidate;
    try {
      candidate = await createSnapshotCandidate({
        symbol: record.symbol,
        exchange: record.exchange as SnapshotExchange,
      });
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error ? error.message : "Invalid snapshot request.",
      });
      return;
    }
    snapshotStore.save(candidate);
    sendJson(response, 201, candidate);
    return;
  }

  const snapshotMatch = pathname.match(/^\/market\/snapshots\/([^/]+)$/);
  if (request.method === "GET" && snapshotMatch) {
    const candidate = snapshotStore.get(decodeURIComponent(snapshotMatch[1]));
    if (!candidate) {
      sendJson(response, 404, { error: "Snapshot candidate not found." });
      return;
    }
    sendJson(response, 200, candidate);
    return;
  }

  const snapshotLockMatch = pathname.match(
    /^\/market\/snapshots\/([^/]+)\/lock$/,
  );
  if (request.method === "POST" && snapshotLockMatch) {
    const candidateId = decodeURIComponent(snapshotLockMatch[1]);
    const candidate = snapshotStore.get(candidateId);
    if (!candidate) {
      sendJson(response, 404, { error: "Snapshot candidate not found." });
      return;
    }
    if (!candidate.canLock && candidate.status !== "LOCKED") {
      sendJson(response, 409, {
        error: "Snapshot candidate did not pass validation.",
      });
      return;
    }
    sendJson(response, 200, await snapshotStore.lock(candidateId));
    return;
  }

  const auditorSearchMatch = pathname.match(
    /^\/sessions\/([^/]+)\/auditor\/search$/,
  );
  if (request.method === "POST" && auditorSearchMatch) {
    const session = store.get(decodeURIComponent(auditorSearchMatch[1]));
    if (!session) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }

    const body = await readJsonBody(request);
    const question =
      body &&
      typeof body === "object" &&
      "question" in body &&
      typeof body.question === "string"
        ? body.question.trim()
        : "";
    if (question.length === 0) {
      sendJson(response, 400, { error: "A question is required." });
      return;
    }
    if (question.length > 500) {
      sendJson(response, 400, {
        error: "Question must be 500 characters or fewer.",
      });
      return;
    }

    sendJson(response, 200, await answerTelemetryQuestion(session, question));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return null;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function applyCors(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body, null, 2));
}
