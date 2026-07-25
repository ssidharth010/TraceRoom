import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadSessions as requestSessions,
  runSession as requestRunSession,
} from "./api";
import type { RecordedSession, SessionScenario } from "./types";

interface TraceRoomState {
  sessions: RecordedSession[];
  selected: RecordedSession | null;
  loadingScenario: SessionScenario | null;
  lastCompletedRun: RecordedSession | null;
  activeRunSymbol: string | null;
  booting: boolean;
  error: string | null;
  dismissCompletedRun: () => void;
  selectSession: (sessionId: string) => void;
  runScenario: (
    scenario: SessionScenario,
    snapshotId?: string,
    symbol?: string,
  ) => Promise<RecordedSession | null>;
  refresh: () => Promise<void>;
}

const TraceRoomContext = createContext<TraceRoomState | null>(null);

export function TraceRoomProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingScenario, setLoadingScenario] =
    useState<SessionScenario | null>(null);
  const [lastCompletedRun, setLastCompletedRun] =
    useState<RecordedSession | null>(null);
  const [activeRunSymbol, setActiveRunSymbol] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await requestSessions();
      setSessions(data);
      setSelectedId((current) =>
        current && data.some((session) => session.sessionId === current)
          ? current
          : null,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load sessions.",
      );
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismissCompletedRun = useCallback(() => {
    setLastCompletedRun(null);
  }, []);

  const runScenario = useCallback(
    async (scenario: SessionScenario, snapshotId?: string, symbol?: string) => {
      setLoadingScenario(scenario);
      setLastCompletedRun(null);
      setActiveRunSymbol(symbol ?? null);
      setError(null);
      try {
        const session = await requestRunSession(scenario, snapshotId);
        setSessions((current) => [
          session,
          ...current.filter((item) => item.sessionId !== session.sessionId),
        ]);
        setSelectedId(session.sessionId);
        setLastCompletedRun(session);
        return session;
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Session run failed.",
        );
        return null;
      } finally {
        setLoadingScenario(null);
      }
    },
    [],
  );

  const selected = useMemo(
    () =>
      selectedId
        ? (sessions.find((session) => session.sessionId === selectedId) ?? null)
        : null,
    [selectedId, sessions],
  );

  return (
    <TraceRoomContext.Provider
      value={{
        sessions,
        selected,
        loadingScenario,
        lastCompletedRun,
        activeRunSymbol,
        booting,
        error,
        dismissCompletedRun,
        selectSession: setSelectedId,
        runScenario,
        refresh,
      }}
    >
      {children}
    </TraceRoomContext.Provider>
  );
}

export function useTraceRoom(): TraceRoomState {
  const value = useContext(TraceRoomContext);
  if (!value) {
    throw new Error("useTraceRoom must be used inside TraceRoomProvider.");
  }
  return value;
}
