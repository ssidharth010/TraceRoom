import {
  ArrowClockwise,
  ChatCircleText,
  LockKey,
  Play,
  SkipForward,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgentCanvas } from "../components/AgentCanvas";
import { StatusChip } from "../components/SessionUI";
import { useTraceRoom } from "../TraceRoomContext";

const liveStages = [
  {
    agent: "Momentum",
    status: "Reading shared snapshot",
    detail: "Testing trend strength against the {symbol} market frame.",
  },
  {
    agent: "Mean Reversion",
    status: "Challenging extension",
    detail: "Comparing the cited price with the authoritative reference.",
  },
  {
    agent: "Skeptic",
    status: "Auditing every claim",
    detail: "Following evidence lineage before consensus can form.",
  },
  {
    agent: "Evidence Gate",
    status: "Holding execution",
    detail: "No downstream action is released until validation completes.",
  },
];

export function RoomPage() {
  const {
    sessions,
    selected,
    selectSession,
    loadingScenario,
    activeRunSymbol,
  } = useTraceRoom();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reduce = useReducedMotion();
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [liveIndex, setLiveIndex] = useState(0);
  const requestedSessionId = searchParams.get("session");

  useEffect(() => {
    if (
      requestedSessionId &&
      requestedSessionId !== selected?.sessionId &&
      sessions.some((session) => session.sessionId === requestedSessionId)
    ) {
      selectSession(requestedSessionId);
    }
  }, [requestedSessionId, selectSession, selected?.sessionId, sessions]);

  useEffect(() => {
    if (!loadingScenario || reduce) return;
    const timer = window.setInterval(() => {
      setLiveIndex((current) => (current + 1) % liveStages.length);
    }, 1350);
    return () => window.clearInterval(timer);
  }, [loadingScenario, reduce]);

  useEffect(() => {
    setReplayIndex(0);
  }, [selected?.sessionId]);

  useEffect(() => {
    if (!playing || reduce || !selected?.replay.length) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) =>
        current >= selected.replay.length - 1 ? 0 : current + 1,
      );
    }, 1800);
    return () => window.clearInterval(timer);
  }, [playing, reduce, selected]);

  const messages = useMemo(
    () =>
      selected?.proposals.map((proposal) => ({
        agent:
          selected.agents.find((agent) => agent.agentId === proposal.agentId)
            ?.displayName ?? "Unknown agent",
        position: proposal.position,
        text: proposal.thesis,
        confidence: proposal.confidence,
      })) ?? [],
    [selected],
  );

  if (loadingScenario) {
    return (
      <div className="page room-page live-room">
        <header className="page-heading room-heading">
          <div>
            <span className="eyebrow">LIVE AGENT ROOM</span>
            <h1>Reasoning in motion.</h1>
          </div>
          <span className="live-chip">
            <span /> SESSION ACTIVE
          </span>
        </header>

        <div className="room-layout">
          <section className="room-canvas-panel live-canvas-panel">
            <AgentCanvas session={null} phase={liveIndex / liveStages.length} />
            <div className="live-scanline" aria-hidden="true" />
            <AnimatePresence mode="wait">
              <motion.div
                className="replay-callout live-callout"
                key={liveIndex}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <span>{String(liveIndex + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{liveStages[liveIndex].agent}</strong>
                  <p>{liveStages[liveIndex].status}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </section>

          <aside className="conversation-panel live-transmissions">
            <div className="conversation-header">
              <ChatCircleText />
              <span>LIVE TRANSMISSIONS</span>
            </div>
            <div className="conversation-feed">
              {liveStages.map((stage, index) => (
                <motion.article
                  className={
                    index === liveIndex ? "live-message active" : "live-message"
                  }
                  key={stage.agent}
                  animate={{
                    opacity: index <= liveIndex ? 1 : 0.34,
                    x: index === liveIndex ? 0 : 8,
                  }}
                >
                  <header>
                    <strong>{stage.agent}</strong>
                    <span>
                      {index === liveIndex
                        ? "TALKING"
                        : index < liveIndex
                          ? "HEARD"
                          : "QUEUED"}
                    </span>
                  </header>
                  <p>
                    {stage.detail.replace(
                      "{symbol}",
                      activeRunSymbol ?? "configured snapshot",
                    )}
                  </p>
                  <footer>{stage.status.toUpperCase()}</footer>
                </motion.article>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="page room-empty">
        <AgentCanvas session={null} />
        <div className="room-empty-copy">
          <h1>Select a recorded decision.</h1>
          <p>
            Choose a decision from the log to inspect its agent conversation
            and stage-by-stage replay.
          </p>
          <button
            className="primary-button"
            onClick={() => navigate("/incidents")}
          >
            OPEN INCIDENTS
          </button>
        </div>
      </div>
    );
  }

  const step = selected.replay[replayIndex];
  return (
    <div className="page room-page">
      <header className="page-heading room-heading">
        <div>
          <span className="eyebrow">DECISION REPLAY</span>
          <h1>{selected.snapshot.symbol} decision network</h1>
        </div>
        <div className="room-session-binding">
          <label htmlFor="room-session">RECORDED DECISION</label>
          <select
            id="room-session"
            value={selected.sessionId}
            onChange={(event) => {
              selectSession(event.target.value);
              navigate(
                `/room?session=${encodeURIComponent(event.target.value)}`,
              );
            }}
          >
            {sessions.map((session) => (
              <option value={session.sessionId} key={session.sessionId}>
                {session.snapshot.symbol} / {session.outcome} /{" "}
                {session.sessionId.slice(0, 8)}
              </option>
            ))}
          </select>
          <StatusChip session={selected} />
        </div>
      </header>

      <div className="room-layout">
        <section className="room-canvas-panel">
          <AgentCanvas
            session={selected}
            phase={
              selected.replay.length ? replayIndex / selected.replay.length : 0
            }
          />
          <div className="playback">
            <button
              className="icon-button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause replay" : "Play replay"}
            >
              {playing ? <SkipForward /> : <Play />}
            </button>
            <div className="playback-track" aria-hidden="true">
              <motion.span
                animate={{ scaleX: (replayIndex + 1) / selected.replay.length }}
                transition={{ duration: reduce ? 0 : 0.4 }}
              />
            </div>
            <button
              className="icon-button"
              onClick={() => setReplayIndex(0)}
              aria-label="Restart replay"
            >
              <ArrowClockwise />
            </button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              className="replay-callout"
              key={`${step?.order}-${replayIndex}`}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <span>{String(step?.order ?? 0).padStart(2, "0")}</span>
              <div>
                <strong>{step?.title}</strong>
                <p>{step?.detail}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        <aside className="conversation-panel">
          <div className="conversation-header">
            <ChatCircleText />
            <span>AGENT TRANSMISSIONS</span>
          </div>
          <div className="conversation-feed">
            {messages.map((message, index) => (
              <motion.article
                key={`${message.agent}-${index}`}
                initial={reduce ? false : { opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.12 }}
              >
                <header>
                  <strong>{message.agent}</strong>
                  <span>{Math.round(message.confidence * 100)}%</span>
                </header>
                <p>{message.text}</p>
                <footer>{message.position}</footer>
              </motion.article>
            ))}
            {selected.evidenceValidation.blocked && (
              <motion.article
                className="gate-message"
                initial={reduce ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                <header>
                  <strong>EVIDENCE GATE</strong>
                  <LockKey weight="fill" />
                </header>
                <p>{selected.pipelineGate.message}</p>
                <footer>TRANSMISSION TERMINATED</footer>
              </motion.article>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
