import {
  CheckCircle,
  Lightning,
  LockKey,
  Warning,
  WarningDiamond,
  XCircle,
} from "@phosphor-icons/react";
import type { RecordedSession } from "../types";

export function OutcomeBadge({
  outcome,
}: {
  outcome: RecordedSession["outcome"];
}) {
  const Icon =
    outcome === "APPROVED"
      ? CheckCircle
      : outcome === "DEADLOCKED"
        ? Warning
        : outcome === "VETOED"
          ? LockKey
          : outcome === "ERROR"
            ? XCircle
            : WarningDiamond;

  return (
    <span className={`outcome-badge outcome-${outcome.toLowerCase()}`}>
      <Icon weight="fill" />
      {outcome.replaceAll("_", " ")}
    </span>
  );
}

export function StatusChip({ session }: { session: RecordedSession }) {
  return <OutcomeBadge outcome={session.outcome} />;
}

export function ControlledInjectionCard({
  session,
}: {
  session: RecordedSession;
}) {
  const injection = session.scenarioInjection;
  if (!injection.injected) {
    return null;
  }

  return (
    <section className="fault-injection-card" aria-label="Controlled injection">
      <header>
        <span><Lightning weight="fill" /> CONTROLLED FAULT INJECTION</span>
        <strong>{formatScenario(injection.type)}</strong>
      </header>
      <p>{injection.description}</p>

      {injection.evidenceOverride && (
        <dl className="injection-values">
          <div>
            <dt>Agent</dt>
            <dd>{agentName(session, injection.evidenceOverride.agentId)}</dd>
          </div>
          <div>
            <dt>Claim</dt>
            <dd>{injection.evidenceOverride.claimIndex + 1}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{formatNumber(injection.evidenceOverride.originalValue)}</dd>
          </div>
          <div>
            <dt>Forced</dt>
            <dd>{formatNumber(injection.evidenceOverride.forcedValue)}</dd>
          </div>
        </dl>
      )}

      {injection.voteOverrides.length > 0 && (
        <div className="vote-override-table">
          <div className="vote-override-head">
            <span>Agent</span>
            <span>Generated</span>
            <span>Forced</span>
            <span>Changed</span>
          </div>
          {injection.voteOverrides.map((override) => (
            <div key={override.agentId}>
              <strong>{agentName(session, override.agentId)}</strong>
              <span>{override.originalPosition}</span>
              <span>{override.forcedPosition}</span>
              <span className={override.overridden ? "changed-yes" : ""}>
                {override.overridden ? "YES" : "NO"}
              </span>
            </div>
          ))}
        </div>
      )}

      {injection.riskPolicyOverride && (
        <div className="policy-override">
          <span>{injection.riskPolicyOverride.ruleId}</span>
          <strong>
            {injection.riskPolicyOverride.originalThreshold}% →{" "}
            {injection.riskPolicyOverride.scenarioThreshold}%
          </strong>
        </div>
      )}
    </section>
  );
}

export function agentName(session: RecordedSession, agentId: string): string {
  return (
    session.agents.find((agent) => agent.agentId === agentId)?.displayName ??
    "Unknown agent"
  );
}

export function formatScenario(value: string): string {
  return value.replaceAll("-", " ").replaceAll("_", " ").toUpperCase();
}

export function formatStageName(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replaceAll("_", " ")
    .toUpperCase();
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
