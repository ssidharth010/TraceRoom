import type {
  RecordedSession,
  SessionScenario,
  TelemetryQuestionAnswer,
} from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function loadSessions(): Promise<RecordedSession[]> {
  return requestJson<RecordedSession[]>(`${apiBaseUrl}/sessions`);
}

export async function runSession(
  scenario: SessionScenario,
  snapshotId?: string,
): Promise<RecordedSession> {
  return requestJson<RecordedSession>(`${apiBaseUrl}/sessions/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, snapshotId }),
  });
}

export async function askAuditor(
  sessionId: string,
  question: string,
): Promise<TelemetryQuestionAnswer> {
  return requestJson<TelemetryQuestionAnswer>(
    `${apiBaseUrl}/sessions/${encodeURIComponent(sessionId)}/auditor/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("TraceRoom API is offline. Start it with npm run dev.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (
      response.status === 404 &&
      payload?.error === "Snapshot candidate not found."
    ) {
      throw new Error(
        "An older TraceRoom API is running. Stop it and restart npm run dev.",
      );
    }
    throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}
