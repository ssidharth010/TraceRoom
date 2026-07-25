import {
  ArrowRight,
  ArrowSquareOut,
  Check,
  Copy,
  Pause,
  Play,
  Pulse,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DebateTab } from "../DebateTab";
import {
  agentName,
  ControlledInjectionCard,
  formatScenario,
  formatStageName,
  OutcomeBadge,
} from "../components/SessionUI";
import { useTraceRoom } from "../TraceRoomContext";
import type { RecordedSession } from "../types";

export function IncidentsPage() {
  const { sessions, selected, selectSession } = useTraceRoom();
  const reduce = useReducedMotion();

  return (
    <div className="page incidents-page">
      <header className="page-heading incident-index-heading">
        <div>
          <span className="eyebrow">RECORDED DECISIONS</span>
          <h1>Every incident keeps its proof.</h1>
          <p>
            Select a session to inspect its replay, agent decisions, debate,
            controls, and matching SigNoz telemetry.
          </p>
        </div>
        <strong className="incident-count">{sessions.length}</strong>
      </header>

      <div className="incident-workspace">
        <aside className="session-rail">
          <div className="rail-heading">
            <span>RECORDED RUNS</span>
            <strong>{sessions.length}</strong>
          </div>
          {sessions.map((session) => (
            <button
              key={session.sessionId}
              className={
                selected?.sessionId === session.sessionId
                  ? "session-row active"
                  : "session-row"
              }
              onClick={() => selectSession(session.sessionId)}
            >
              <span>{session.snapshot.symbol}</span>
              <div>
                <strong>{formatScenario(session.scenario)}</strong>
                <small>{new Date(session.createdAt).toLocaleString()}</small>
              </div>
              <OutcomeBadge outcome={session.outcome} />
            </button>
          ))}
          {sessions.length === 0 && (
            <p className="rail-empty">
              No sessions yet. Start from Command and run a replay.
            </p>
          )}
        </aside>

        <section className="incident-detail">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.sessionId}
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <IncidentDetail session={selected} />
              </motion.div>
            ) : (
              <div className="incident-placeholder">
                <Pulse />
                <h2>Select a recorded decision.</h2>
                <p>
                  Incident details are always bound to the session selected on
                  the left.
                </p>
              </div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

function IncidentDetail({ session }: { session: RecordedSession }) {
  const navigate = useNavigate();
  const [sessionCopied, setSessionCopied] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);

  async function copy(value: string, kind: "session" | "logs") {
    await navigator.clipboard.writeText(value);
    if (kind === "session") {
      setSessionCopied(true);
      window.setTimeout(() => setSessionCopied(false), 1400);
    } else {
      setLogsCopied(true);
      window.setTimeout(() => setLogsCopied(false), 1400);
    }
  }

  return (
    <div className="incident-scroll">
      <header className="incident-detail-header">
        <div>
          <span className="incident-symbol">{session.snapshot.symbol}</span>
          <div className="incident-badges">
            <span className="scenario-badge">
              {formatScenario(session.scenario)}
            </span>
            <OutcomeBadge outcome={session.outcome} />
          </div>
          <h2>{session.snapshot.symbol} decision record</h2>
          <p>
            Captured {new Date(session.createdAt).toLocaleString()} · Session{" "}
            {session.sessionId}
          </p>
        </div>
        <button
          className="secondary-button compact-button"
          onClick={() => void copy(session.sessionId, "session")}
        >
          {sessionCopied ? <Check /> : <Copy />}
          {sessionCopied ? "COPIED" : "COPY SESSION ID"}
        </button>
      </header>

      <section className="incident-section" aria-labelledby="replay-heading">
        <SectionHeading
          index="01"
          eyebrow="INCIDENT REPLAY"
          title="What happened, in recorded order."
          id="replay-heading"
        />
        <IncidentReplay session={session} />
      </section>

      <section className="incident-section" aria-labelledby="agents-heading">
        <SectionHeading
          index="02"
          eyebrow="AGENT DECISIONS"
          title="What each agent proposed and finally recorded."
          id="agents-heading"
        />
        <div className="incident-agent-grid">
          {session.proposals.map((proposal) => {
            const vote = session.finalVotes.find(
              (candidate) => candidate.agentId === proposal.agentId,
            );
            const validation = session.evidenceValidation.agents.find(
              (candidate) => candidate.agentId === proposal.agentId,
            );
            const override = session.scenarioInjection.voteOverrides.find(
              (candidate) => candidate.agentId === proposal.agentId,
            );
            const genuineFlip =
              Boolean(vote) &&
              vote?.position !== proposal.position &&
              !override?.overridden;

            return (
              <article className="incident-agent-card" key={proposal.agentId}>
                <header>
                  <div>
                    <strong>{agentName(session, proposal.agentId)}</strong>
                    <span>
                      {agentPersona(session, proposal.agentId)} ·{" "}
                      {Math.round(proposal.confidence * 100)}%
                    </span>
                  </div>
                  <PositionChip position={proposal.position} />
                </header>
                <dl>
                  <div>
                    <dt>Evidence claims</dt>
                    <dd>{proposal.evidence.length}</dd>
                  </div>
                  <div>
                    <dt>Validation</dt>
                    <dd
                      className={
                        validation?.validationStatus === "valid"
                          ? "value-valid"
                          : "value-invalid"
                      }
                    >
                      {validation?.validationStatus.toUpperCase() ?? "NOT RUN"}
                    </dd>
                  </div>
                </dl>
                <div className="agent-position-change">
                  <span>INITIAL → FINAL</span>
                  <div>
                    <PositionChip position={proposal.position} />
                    <strong>→</strong>
                    <PositionChip position={vote?.position ?? "NOT RUN"} />
                    {override?.overridden && <i>SCENARIO-FORCED</i>}
                  </div>
                </div>
                {genuineFlip && vote && (
                  <div className="genuine-flip">
                    Changed {proposal.position} → {vote.position} after debate
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {session.stageStatuses.finalVote === "SKIPPED" && (
          <div className="stage-skipped-callout">
            Final voting was skipped — pipeline blocked at{" "}
            {formatStageName(
              session.pipelineGate.blockedAt ?? "evidence validation",
            )}
            .
          </div>
        )}
      </section>

      <ControlledInjectionCard session={session} />

      {session.error && (
        <section className="incident-error-card">
          <span>{session.error.code}</span>
          <h3>Workflow stopped at {session.error.stage}</h3>
          <p>{session.error.message}</p>
        </section>
      )}

      <section className="incident-section" aria-labelledby="stages-heading">
        <SectionHeading
          index="03"
          eyebrow="PIPELINE STATUS"
          title="Completed, blocked, and skipped stages."
          id="stages-heading"
        />
        <div className="incident-stage-list">
          {Object.entries(session.stageStatuses).map(([stage, status]) => (
            <div
              key={stage}
              className={`incident-stage stage-${status.toLowerCase()}`}
            >
              <span>{formatStageName(stage)}</span>
              <strong>{status}</strong>
              {status === "SKIPPED" && (
                <small>
                  Skipped —{" "}
                  {session.pipelineGate.status === "BLOCKED"
                    ? `pipeline blocked at ${formatStageName(session.pipelineGate.blockedAt ?? "evidence validation")}`
                    : "the workflow did not reach this stage"}
                </small>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="incident-section debate-shell">
        <details>
          <summary>VIEW FULL DEBATE TRANSCRIPT</summary>
          <DebateTab session={session} />
        </details>
      </section>

      <section className="incident-section" aria-labelledby="metrics-heading">
        <SectionHeading
          index="04"
          eyebrow="SESSION METRICS"
          title="Only values recorded by this run."
          id="metrics-heading"
        />
        <dl className="incident-metrics-strip">
          <div>
            <dt>Claims validated</dt>
            <dd>
              {session.evidenceValidation.validCount}/
              {session.evidenceValidation.checkedCount}
            </dd>
          </div>
          <div>
            <dt>Rules triggered</dt>
            <dd>
              {session.riskReview?.triggeredRuleIds.join(", ") ||
                session.pipelineGate.reasonCode ||
                "NONE"}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              {session.durationMs === undefined
                ? "NOT RECORDED"
                : formatDuration(session.durationMs)}
            </dd>
          </div>
          <div>
            <dt>Total agents</dt>
            <dd>{session.agents.length}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{session.outcome}</dd>
          </div>
        </dl>
      </section>

      <section
        className="incident-section investigate-section"
        aria-labelledby="investigate-heading"
      >
        <SectionHeading
          index="05"
          eyebrow="INVESTIGATE"
          title="Open the matching SigNoz evidence."
          id="investigate-heading"
        />
        <div className="investigate-grid">
          <a
            className="primary-button"
            href={session.signoz.traceUrl}
            target="_blank"
            rel="noreferrer"
          >
            VIEW FULL DECISION TRACE <ArrowSquareOut />
          </a>
          <a
            className="secondary-button"
            href={session.signoz.dashboardUrl}
            target="_blank"
            rel="noreferrer"
          >
            OPEN DASHBOARD <ArrowSquareOut />
          </a>
          <button
            className="logs-query"
            onClick={() => void copy(session.signoz.logsHint, "logs")}
          >
            <span>LOG QUERY</span>
            <code>{session.signoz.logsHint}</code>
            {logsCopied ? <Check /> : <Copy />}
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              navigate(`/room?session=${encodeURIComponent(session.sessionId)}`)
            }
          >
            OPEN BOUND AGENT ROOM <ArrowRight />
          </button>
        </div>
      </section>
    </div>
  );
}

function IncidentReplay({ session }: { session: RecordedSession }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const step = session.replay[index];

  useEffect(() => {
    setIndex(0);
    setPlaying(true);
  }, [session.sessionId]);

  useEffect(() => {
    if (!playing || reduce || session.replay.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) =>
        current >= session.replay.length - 1 ? 0 : current + 1,
      );
    }, 2200);
    return () => window.clearInterval(timer);
  }, [playing, reduce, session.replay.length]);

  if (!step) {
    return (
      <div className="stage-skipped-callout">No replay steps recorded.</div>
    );
  }

  return (
    <div className="incident-replay">
      <div className="incident-replay-focus">
        <span>
          STEP {index + 1} / {session.replay.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.detail}</p>
        <div className="replay-controls">
          <button
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
            aria-label="Previous replay step"
          >
            <SkipBack />
          </button>
          <button
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? "Pause replay" : "Play replay"}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <button
            onClick={() =>
              setIndex((current) =>
                Math.min(session.replay.length - 1, current + 1),
              )
            }
            disabled={index === session.replay.length - 1}
            aria-label="Next replay step"
          >
            <SkipForward />
          </button>
        </div>
      </div>
      <ol className="incident-replay-list">
        {session.replay.map((candidate, candidateIndex) => (
          <li
            className={candidateIndex === index ? "active" : ""}
            key={`${candidate.order}-${candidate.title}`}
          >
            <button onClick={() => setIndex(candidateIndex)}>
              <span>{String(candidate.order).padStart(2, "0")}</span>
              <strong>{candidate.title}</strong>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionHeading({
  index,
  eyebrow,
  title,
  id,
}: {
  index: string;
  eyebrow: string;
  title: string;
  id: string;
}) {
  return (
    <header className="incident-section-heading">
      <span>{index}</span>
      <div>
        <small>{eyebrow}</small>
        <h3 id={id}>{title}</h3>
      </div>
    </header>
  );
}

function PositionChip({ position }: { position: string }) {
  return (
    <span
      className={`position-chip position-${position.toLowerCase().replaceAll("_", "-")}`}
    >
      {position}
    </span>
  );
}

function agentPersona(session: RecordedSession, agentId: string): string {
  return (
    session.agents.find((agent) => agent.agentId === agentId)?.persona ??
    "UNKNOWN"
  );
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1_000).toFixed(1)}s`;
}
