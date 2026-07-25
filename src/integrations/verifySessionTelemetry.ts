import {
  answerTelemetryQuestion,
  type TelemetryQuestionAnswer,
} from "./signozMcpAuditor";
import type { RecordedSession } from "../session/types";

export interface SessionTelemetryVerification {
  checkedAt: string;
  traceVerified: boolean;
  logCorrelated: boolean;
  dashboardUpdated: boolean;
  alertFiring: boolean;
  mcpVerified: boolean;
}

const verificationCache = new Map<string, SessionTelemetryVerification>();

export async function verifySessionTelemetry(
  session: RecordedSession,
): Promise<SessionTelemetryVerification> {
  const previous = verificationCache.get(session.sessionId);
  if (
    previous?.traceVerified &&
    previous.logCorrelated &&
    previous.dashboardUpdated &&
    previous.alertFiring &&
    previous.mcpVerified
  ) {
    return previous;
  }

  const trace = await answerWithRetry(session, "Which span failed?");
  const logs = await answerWithRetry(session, "Show the session logs");
  const dashboard = await answerWithRetry(
    session,
    "Show the TraceRoom / Submission Evidence dashboard",
  );
  const alert = await answerWithRetry(session, "Were any alerts firing?");
  const current = toSessionTelemetryVerification(session, {
    trace,
    logs,
    dashboard,
    alert,
  });
  const merged = previous
    ? {
        checkedAt: current.checkedAt,
        traceVerified: previous.traceVerified || current.traceVerified,
        logCorrelated: previous.logCorrelated || current.logCorrelated,
        dashboardUpdated: previous.dashboardUpdated || current.dashboardUpdated,
        alertFiring: previous.alertFiring || current.alertFiring,
        mcpVerified: previous.mcpVerified || current.mcpVerified,
      }
    : current;
  verificationCache.set(session.sessionId, merged);
  return merged;
}

async function answerWithRetry(
  session: RecordedSession,
  question: string,
): Promise<TelemetryQuestionAnswer> {
  const first = await answerTelemetryQuestion(session, question);
  return first.source === "signoz_mcp"
    ? first
    : answerTelemetryQuestion(session, question);
}

export function toSessionTelemetryVerification(
  session: RecordedSession,
  answers: Record<
    "trace" | "logs" | "dashboard" | "alert",
    TelemetryQuestionAnswer
  >,
): SessionTelemetryVerification {
  const live = (answer: TelemetryQuestionAnswer) =>
    answer.source === "signoz_mcp";
  const values = (answer: TelemetryQuestionAnswer) =>
    answer.evidence.map((item) => item.value).join(" ");
  const traceVerified =
    live(answers.trace) &&
    values(answers.trace).includes(session.signoz.traceId);
  const logCorrelated =
    live(answers.logs) &&
    values(answers.logs).includes(session.sessionId);
  const dashboardUpdated =
    live(answers.dashboard) &&
    /TraceRoom\s*\/\s*Submission Evidence/i.test(values(answers.dashboard));
  const alertEvidence = values(answers.alert);
  const alertFiring =
    live(answers.alert) &&
    /"alert(?:name)?"\s*:\s*"TraceRoom\s*\/\s*Evidence Integrity Block"[\s\S]{0,1600}"state"\s*:\s*"(firing|active|triggered)"/i.test(
      alertEvidence,
    );

  return {
    checkedAt: new Date().toISOString(),
    traceVerified,
    logCorrelated,
    dashboardUpdated,
    alertFiring,
    mcpVerified: Object.values(answers).every(live),
  };
}
