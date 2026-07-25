import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { RecordedSession } from "../session/types";

const defaultDbPath = resolve(process.cwd(), "data", "traceroom.sqlite");

export class SessionStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = process.env.TRACEROOM_DB_PATH ?? defaultDbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        mode TEXT NOT NULL,
        ticker TEXT NOT NULL,
        outcome TEXT NOT NULL,
        evidence_status TEXT NOT NULL,
        execution_status TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
    `);
  }

  save(session: RecordedSession): void {
    const statement = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        session_id,
        created_at,
        mode,
        ticker,
        outcome,
        evidence_status,
        execution_status,
        data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      session.sessionId,
      session.createdAt,
      session.mode,
      session.snapshot.symbol,
      session.outcome,
      session.evidenceValidation.validationStatus,
      session.execution.status,
      JSON.stringify(session),
    );
  }

  list(): RecordedSession[] {
    const rows = this.db
      .prepare(
        "SELECT data_json FROM sessions ORDER BY created_at DESC",
      )
      .all() as Array<{ data_json: string }>;

    return rows
      .map((row) => JSON.parse(row.data_json) as unknown)
      .filter(isRecordedSession);
  }

  get(sessionId: string): RecordedSession | null {
    const row = this.db
      .prepare("SELECT data_json FROM sessions WHERE session_id = ?")
      .get(sessionId) as { data_json: string } | undefined;

    if (!row) {
      return null;
    }

    const session = JSON.parse(row.data_json) as unknown;
    return isRecordedSession(session) ? session : null;
  }

  close(): void {
    this.db.close();
  }
}

function isRecordedSession(value: unknown): value is RecordedSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecordedSession>;
  return Boolean(
    candidate.schemaVersion === 4 &&
      candidate.scenarioInjection &&
      candidate.stageStatuses &&
      candidate.pipelineGate &&
      candidate.snapshot &&
      candidate.evidenceValidation &&
      Array.isArray(candidate.rebuttals),
  );
}
