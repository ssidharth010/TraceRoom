import { useState, type ReactNode } from "react";
import { agentName, formatStageName } from "./components/SessionUI";
import type { CheckedEvidence, RecordedSession, StageStatus } from "./types";

export function DebateTab({ session }: { session: RecordedSession }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [passedRulesExpanded, setPassedRulesExpanded] = useState(false);
  const failedEvidence = collectFailedEvidence(session);
  const triggeredRules =
    session.riskReview?.rules.filter((rule) => rule.outcome === "TRIGGERED") ??
    [];
  const passedRules =
    session.riskReview?.rules.filter((rule) => rule.outcome === "PASSED") ?? [];
  const hasVoteOverrides = sessionHasVoteOverrides(session);

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <section className="tr-debate">
      <header className="tr-debate-header">
        <strong>
          Debate transcript — {session.agents.length} agents ·{" "}
          {session.evidenceValidation.validCount}/
          {session.evidenceValidation.checkedCount} claims validated
        </strong>
        <a
          className="tr-debate-trace-link"
          href={session.signoz.traceUrl}
          target="_blank"
          rel="noreferrer"
        >
          VIEW AS TRACE IN SIGNOZ ↗
        </a>
      </header>

      <div className="tr-debate-timeline">
        <TimelineStage
          label="Market Snapshot"
          status={session.stageStatuses.marketSnapshot}
        >
          <div className="tr-transcript-card tr-snapshot-card">
            <TranscriptDatum label="Symbol" value={session.snapshot.symbol} />
            <TranscriptDatum
              label="Current"
              value={formatNumber(session.snapshot.currentPrice)}
            />
            <TranscriptDatum
              label="Previous close"
              value={formatNumber(session.snapshot.previousClose)}
            />
            <TranscriptDatum
              label="Day range"
              value={`${formatNumber(session.snapshot.dayLow)}–${formatNumber(session.snapshot.dayHigh)}`}
            />
            <TranscriptDatum
              label="RSI"
              value={session.snapshot.indicators.rsi14.toFixed(1)}
            />
            <TranscriptDatum
              label="Volume"
              value={formatCompactNumber(session.snapshot.volume)}
            />
            <p>
              Shared authoritative snapshot — every cited claim below is
              validated against these values.
            </p>
          </div>
        </TimelineStage>

        {session.scenarioInjection.evidenceOverride && (
          <InjectionEvent
            text={evidenceInjectionText(
              session,
              session.scenarioInjection.evidenceOverride,
            )}
          />
        )}

        <TimelineStage
          label="Independent Proposals"
          status={session.stageStatuses.proposals}
          subtitle="Proposals are sealed — agents do not see each other's first answers."
        >
          <div className="tr-proposal-grid">
            {session.proposals.map((proposal) => (
              <article
                className="tr-transcript-card tr-proposal-card"
                key={proposal.agentId}
              >
                <header>
                  <div>
                    <strong>{agentName(session, proposal.agentId)}</strong>
                    <span>{agentPersona(session, proposal.agentId)}</span>
                  </div>
                  <PositionBadge position={proposal.position} />
                  <small>{formatConfidence(proposal.confidence)}</small>
                </header>
                <ExpandableText
                  id={`proposal-${proposal.agentId}`}
                  text={proposal.thesis}
                  isExpanded={expanded.has(`proposal-${proposal.agentId}`)}
                  onToggle={() =>
                    toggleExpanded(`proposal-${proposal.agentId}`)
                  }
                />
                <div className="tr-evidence-chip-list">
                  {proposal.evidence.map((claim, claimIndex) => {
                    const validation = checkedEvidence(
                      session,
                      proposal.agentId,
                      claimIndex,
                    );
                    return (
                      <span
                        className={`tr-evidence-chip ${
                          validation?.validationStatus === "valid"
                            ? "tr-evidence-chip-valid"
                            : "tr-evidence-chip-invalid"
                        }`}
                        title={evidenceTitle(validation, claim.statement)}
                        key={`${proposal.agentId}-${claimIndex}`}
                      >
                        {claim.claimType}: {formatNumber(claim.citedValue)}
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </TimelineStage>

        <TimelineStage
          label="Evidence Validation"
          status={session.stageStatuses.evidenceValidation}
        >
          {failedEvidence.length === 0 ? (
            <div className="tr-debate-valid-line">
              ✓ {session.evidenceValidation.validCount}/
              {session.evidenceValidation.checkedCount} cited claims matched the
              snapshot.
            </div>
          ) : (
            <div className="tr-debate-failure-callout">
              <h4>Evidence integrity failure</h4>
              {failedEvidence.map((failure) => (
                <div
                  className="tr-debate-failed-claim"
                  key={`${failure.agentId}-${failure.claimIndex}`}
                >
                  <strong>
                    {agentName(session, failure.agentId)} ·{" "}
                    {failure.claim.claimType}
                  </strong>
                  <span>
                    Cited {formatNumber(failure.claim.citedValue)} · Reference{" "}
                    {formatNumber(failure.claim.referenceValue)} · Deviation{" "}
                    {formatDeviation(failure.claim.deviationPct)} ·{" "}
                    {failure.claim.validationStatus.toUpperCase()}
                  </span>
                </div>
              ))}
              {session.pipelineGate.status === "BLOCKED" && (
                <div className="tr-debate-gate-message">
                  <strong>
                    {session.pipelineGate.reasonCode ?? "PIPELINE_BLOCKED"}
                  </strong>
                  <span>{session.pipelineGate.message}</span>
                </div>
              )}
            </div>
          )}
        </TimelineStage>

        <TimelineStage
          label="Cross-Examination"
          status={session.stageStatuses.crossExamination}
          skippedMessage={skippedMessage(session, "cross-examination")}
        >
          <div className="tr-rebuttal-list">
            {session.rebuttals.map((rebuttal) => (
              <article
                className="tr-transcript-card tr-rebuttal-card"
                key={rebuttal.agentId}
              >
                <h4>
                  {agentName(session, rebuttal.agentId)} challenges the room
                </h4>
                {rebuttal.critiques.map((critique) => (
                  <div
                    className="tr-critique"
                    key={`${rebuttal.agentId}-${critique.targetAgentId}`}
                  >
                    <strong>
                      → vs {agentName(session, critique.targetAgentId)}
                    </strong>
                    <p>
                      <span className="tr-positive-mark">✓</span> Strongest
                      agreement: {critique.strongestAgreement}
                    </p>
                    <p>
                      <span className="tr-negative-mark">×</span> Strongest
                      objection: {critique.strongestObjection}
                    </p>
                    {critique.evidenceConflicts.length > 0 && (
                      <div className="tr-evidence-chip-list">
                        {critique.evidenceConflicts.map((conflict) => (
                          <span
                            className="tr-evidence-chip tr-evidence-chip-warning"
                            key={conflict}
                          >
                            ⚠ {conflict}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <em>{rebuttal.overallAssessment}</em>
              </article>
            ))}
          </div>
        </TimelineStage>

        {hasVoteOverrides && (
          <InjectionEvent
            text={`${session.scenarioInjection.description} Recorded mapping: ${voteOverrideSummary(session)}.`}
          />
        )}

        <TimelineStage
          label="Final Votes"
          status={session.stageStatuses.finalVote}
          skippedMessage={skippedMessage(session, "final voting")}
        >
          <div className="tr-final-vote-list">
            {session.finalVotes.map((vote) => {
              const generatedPosition = generatedVotePosition(session, vote);
              const override = session.scenarioInjection.voteOverrides.find(
                (candidate) => candidate.agentId === vote.agentId,
              );
              const transitionStart = hasVoteOverrides
                ? generatedPosition
                : vote.initialPosition;
              const organicFlip =
                generatedPosition !== vote.initialPosition &&
                !override?.overridden;

              return (
                <article
                  className="tr-transcript-card tr-final-vote-row"
                  key={vote.agentId}
                >
                  <div>
                    <strong>{agentName(session, vote.agentId)}</strong>
                    <small>
                      {formatConfidence(vote.confidence)} confidence
                    </small>
                  </div>
                  <div className="tr-vote-transition">
                    <small>
                      {hasVoteOverrides
                        ? "GENERATED → RECORDED"
                        : "INITIAL → FINAL"}
                    </small>
                    <div>
                      <PositionBadge position={transitionStart} />
                      <span>→</span>
                      <PositionBadge position={vote.position} />
                      {override?.overridden && (
                        <span className="tr-forced-chip">SCENARIO-FORCED</span>
                      )}
                    </div>
                  </div>
                  <ExpandableText
                    id={`vote-${vote.agentId}`}
                    text={vote.rationale}
                    isExpanded={expanded.has(`vote-${vote.agentId}`)}
                    onToggle={() => toggleExpanded(`vote-${vote.agentId}`)}
                    compact
                  />
                  {organicFlip && (
                    <div className="tr-organic-flip">
                      Changed {vote.initialPosition} → {generatedPosition} after
                      debate
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </TimelineStage>

        <TimelineStage
          label="Consensus"
          status={session.stageStatuses.consensus}
          skippedMessage={skippedMessage(session, "consensus")}
        >
          {session.consensus && (
            <div className="tr-transcript-card tr-consensus-card">
              <div>
                <span
                  className={`tr-status-badge tr-status-${session.consensus.status.toLowerCase()}`}
                >
                  {session.consensus.status}
                </span>
                <PositionBadge
                  position={session.consensus.position ?? "NO POSITION"}
                />
                <strong>{consensusSplit(session)}</strong>
              </div>
              <p>{consensusSupportingLine(session)}</p>
            </div>
          )}
        </TimelineStage>

        {session.scenarioInjection.riskPolicyOverride && (
          <InjectionEvent
            text={`Risk policy tightened: ${session.scenarioInjection.riskPolicyOverride.ruleId} ${session.scenarioInjection.riskPolicyOverride.originalThreshold}% → ${session.scenarioInjection.riskPolicyOverride.scenarioThreshold}%.`}
          />
        )}

        <TimelineStage
          label="Risk Verdict"
          status={terminalStageStatus(session)}
          skippedMessage={skippedMessage(session, "risk review")}
          showChildrenWhenSkipped
          isTerminal
        >
          <div className="tr-risk-stack">
            {session.riskReview && (
              <div className="tr-transcript-card tr-risk-card">
                <header>
                  <h4>Deterministic risk verdict</h4>
                  <span
                    className={`tr-status-badge tr-risk-${session.riskReview.status.toLowerCase()}`}
                  >
                    {session.riskReview.status}
                  </span>
                </header>
                {triggeredRules.map((rule) => (
                  <div className="tr-triggered-rule" key={rule.ruleId}>
                    <strong>{rule.ruleId}</strong>
                    <span>{rule.message}</span>
                  </div>
                ))}
                {passedRules.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="tr-expand-button"
                      aria-expanded={passedRulesExpanded}
                      onClick={() =>
                        setPassedRulesExpanded((current) => !current)
                      }
                    >
                      {passedRules.length} rules passed{" "}
                      {passedRulesExpanded ? "▾" : "▸"}
                    </button>
                    {passedRulesExpanded && (
                      <div className="tr-passed-rules">
                        {passedRules.map((rule) => (
                          <p key={rule.ruleId}>
                            ✓ {rule.ruleId}: {rule.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {session.scenarioInjection.type === "workflow-recording-error" && (
              <InjectionCallout text={session.scenarioInjection.description} />
            )}

            {!session.riskReview &&
              session.pipelineGate.status === "BLOCKED" && (
                <div className="tr-debate-terminal-error">
                  <strong>
                    {session.pipelineGate.reasonCode ?? "PIPELINE_BLOCKED"}
                  </strong>
                  <h4>Evidence violation recorded — no execution permitted</h4>
                  <p>{session.execution.reason}</p>
                </div>
              )}

            {session.error && (
              <div className="tr-debate-terminal-error">
                <div>
                  <strong>{session.error.code}</strong>
                  <span>{session.error.stage}</span>
                </div>
                <h4>Workflow error recorded</h4>
                <p>{session.error.message}</p>
              </div>
            )}

            <div className="tr-debate-outcome">
              <span>TERMINAL OUTCOME</span>
              <strong className={`outcome-${session.outcome.toLowerCase()}`}>
                {session.outcome}
              </strong>
            </div>
          </div>
        </TimelineStage>
      </div>
    </section>
  );
}

function TimelineStage({
  label,
  status,
  subtitle,
  skippedMessage: skippedCopy,
  showChildrenWhenSkipped = false,
  isTerminal = false,
  children,
}: {
  label: string;
  status: StageStatus;
  subtitle?: string;
  skippedMessage?: string;
  showChildrenWhenSkipped?: boolean;
  isTerminal?: boolean;
  children: ReactNode;
}) {
  const skipped = status === "SKIPPED";
  return (
    <article
      className={`tr-debate-stage ${skipped ? "tr-debate-stage-skipped" : ""}`}
    >
      <div className="tr-debate-rail" aria-hidden="true">
        <span
          className={`tr-debate-node tr-debate-node-${status.toLowerCase()}`}
        />
        {!isTerminal && <span className="tr-debate-rail-line" />}
      </div>
      <div className="tr-debate-stage-content">
        <header className="tr-debate-stage-heading">
          <div>
            <h3>{label}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <span className={`tr-stage-status status-${status.toLowerCase()}`}>
            {status}
          </span>
        </header>
        {skipped && (
          <div className="tr-debate-skipped">
            Skipped — {skippedCopy ?? "the pipeline did not reach this stage"}
          </div>
        )}
        {(!skipped || showChildrenWhenSkipped) && children}
      </div>
    </article>
  );
}

function InjectionEvent({ text }: { text: string }) {
  return (
    <div className="tr-debate-injection-row">
      <div className="tr-debate-rail" aria-hidden="true">
        <span className="tr-debate-injection-node">⚡</span>
        <span className="tr-debate-rail-line" />
      </div>
      <InjectionCallout text={text} />
    </div>
  );
}

function InjectionCallout({ text }: { text: string }) {
  return (
    <div className="tr-debate-injection">
      <strong>⚡ CONTROLLED INJECTION</strong>
      <p>{text}</p>
    </div>
  );
}

function ExpandableText({
  id,
  text,
  isExpanded,
  onToggle,
  compact = false,
}: {
  id: string;
  text: string;
  isExpanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const canExpand = text.length > (compact ? 180 : 320);
  return (
    <div className="tr-expandable">
      <p
        id={id}
        className={!isExpanded && canExpand ? "tr-clamped-text" : undefined}
      >
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          className="tr-expand-button"
          aria-controls={id}
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          {isExpanded ? "SHOW LESS" : "SHOW MORE"}
        </button>
      )}
    </div>
  );
}

function TranscriptDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PositionBadge({ position }: { position: string }) {
  return (
    <span
      className={`tr-position tr-position-${position.toLowerCase().replaceAll("_", "-")}`}
    >
      {position}
    </span>
  );
}

function collectFailedEvidence(session: RecordedSession) {
  return session.evidenceValidation.agents.flatMap((agent) =>
    agent.checkedEvidence.flatMap((claim, claimIndex) =>
      claim.validationStatus === "valid"
        ? []
        : [{ agentId: agent.agentId, claimIndex, claim }],
    ),
  );
}

function checkedEvidence(
  session: RecordedSession,
  agentId: string,
  claimIndex: number,
) {
  return session.evidenceValidation.agents.find(
    (agent) => agent.agentId === agentId,
  )?.checkedEvidence[claimIndex];
}

function evidenceTitle(
  validation: CheckedEvidence | undefined,
  statement: string,
) {
  if (!validation) {
    return statement;
  }
  const base = `${statement} Reference: ${formatNumber(validation.referenceValue)}.`;
  return validation.validationStatus === "valid"
    ? `${base} Validated.`
    : `${base} Deviation: ${formatDeviation(validation.deviationPct)}. ${validation.validationStatus.toUpperCase()}.`;
}

function evidenceInjectionText(
  session: RecordedSession,
  override: NonNullable<
    RecordedSession["scenarioInjection"]["evidenceOverride"]
  >,
) {
  const claim = session.proposals.find(
    (proposal) => proposal.agentId === override.agentId,
  )?.evidence[override.claimIndex];
  return `${session.scenarioInjection.description} ${agentName(session, override.agentId)}'s claim ${override.claimIndex + 1} (${claim?.claimType ?? "UNKNOWN"}) was corrupted: ${formatNumber(override.originalValue)} → ${formatNumber(override.forcedValue)} — before deterministic validation.`;
}

function generatedVotePosition(
  session: RecordedSession,
  vote: RecordedSession["finalVotes"][number],
) {
  return (
    session.scenarioInjection.voteOverrides.find(
      (override) => override.agentId === vote.agentId,
    )?.originalPosition ?? vote.position
  );
}

function sessionHasVoteOverrides(session: RecordedSession) {
  return session.scenarioInjection.voteOverrides.some(
    (vote) => vote.overridden,
  );
}

function voteOverrideSummary(session: RecordedSession) {
  return session.scenarioInjection.voteOverrides
    .filter((vote) => vote.overridden)
    .map(
      (vote) =>
        `${agentName(session, vote.agentId)} ${vote.originalPosition}→${vote.forcedPosition}`,
    )
    .join(", ");
}

function consensusSplit(session: RecordedSession) {
  if (!session.consensus) {
    return "NO VOTE";
  }
  const counts = Object.values(session.consensus.voteCounts);
  if (session.consensus.status === "DEADLOCKED") {
    return counts.join("/");
  }
  return `${Math.max(...counts)}/${session.agents.length}`;
}

function consensusSupportingLine(session: RecordedSession) {
  if (!session.consensus) {
    return "";
  }
  if (session.consensus.status === "DEADLOCKED") {
    return "No majority position — 1/1/1 split.";
  }

  const forcedCount = session.scenarioInjection.voteOverrides.filter(
    (vote) => vote.overridden,
  ).length;
  return forcedCount > 0
    ? `${session.consensus.supportingAgentIds.length}/${session.agents.length} recorded votes aligned on ${session.consensus.position} (${forcedCount} scenario-forced — see fault injection).`
    : `${session.consensus.supportingAgentIds.length} agents organically supported ${session.consensus.position}.`;
}

function skippedMessage(session: RecordedSession, stage: string) {
  return session.pipelineGate.status === "BLOCKED"
    ? `${stage} was not run because the pipeline was blocked at ${formatStageName(session.pipelineGate.blockedAt ?? "evidence validation")}`
    : `${stage} was not run`;
}

function terminalStageStatus(session: RecordedSession): StageStatus {
  return session.error ? "ERROR" : session.stageStatuses.riskReview;
}

function agentPersona(session: RecordedSession, agentId: string) {
  return (
    session.agents.find((agent) => agent.agentId === agentId)?.persona ??
    "UNKNOWN"
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDeviation(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "unbounded";
}
