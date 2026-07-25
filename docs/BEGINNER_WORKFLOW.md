# TraceRoom Beginner Workflow

This guide explains the product without assuming knowledge of autonomous
agents, financial markets, or observability systems.

## The Product In One Minute

TraceRoom is a **decision-observability and audit platform for autonomous
financial agents**. It turns a proposed financial action into a traceable,
inspectable, and replayable decision record.

The financial-agent workflow is not the product. It is the system TraceRoom
observes during the hackathon demo. The product is the audit and governance
layer around that workflow, together with the SigNoz observability surfaces
used to investigate it.

```text
Agents recommend.
Consensus selects.
The risk engine governs.
TraceRoom audits.
SigNoz makes the evidence observable.
```

Target users are fintech engineering, quantitative research, risk, compliance,
and platform teams operating autonomous financial agents. TraceRoom is not a
stock-tip application for retail investors.

## Why TraceRoom Exists

Autonomous agents can call models, cite evidence, disagree, change their votes,
and recommend an action in seconds. When something goes wrong, an operator must
be able to answer:

- What common market data did the agents receive?
- What did each agent initially recommend?
- Which evidence supported each argument, and was it valid?
- What changed during cross-examination?
- How was consensus reached, or why did the room deadlock?
- Which deterministic risk rule approved or vetoed the decision?
- Which model call was slow, expensive, malformed, or responsible for failure?
- Can the full incident be reconstructed from operational evidence?

TraceRoom records those answers instead of leaving the agent system as a black
box.

## Why SigNoz Is Central

TraceRoom uses OpenTelemetry to send decision evidence to SigNoz. Each SigNoz
feature answers a different operational question.

### Traces

The decision trace shows the complete causal workflow: market snapshot,
proposal calls, evidence validation, cross-examination, final votes, consensus,
and risk review. Operators can see ordering, parent-child relationships,
latency, and failures in one place.

### Logs

Correlated logs contain readable stage results such as agent positions,
confidence, evidence, critiques, vote changes, and risk outcomes. Session and
trace identifiers connect those logs to the exact workflow that produced them.

### Metrics

Metrics aggregate behavior across many sessions: LLM latency, token use, cost,
evidence-validation rate, risk-veto rate, deadlock rate, decision outcomes, and
decision regret.

### Dashboards

The Decision Integrity dashboard summarizes decision health and governance.
The Agent Reliability dashboard compares agent latency, cost, failures,
evidence quality, and usefulness over time.

### Alerts

Alerts notify operators about evidence-integrity violations, workflow-integrity
violations, deadlocks, session-cost overruns, and model failures. Alerts report
incidents; the deterministic risk engine remains responsible for synchronous
blocking.

### SigNoz MCP

Ask the Auditor will use the SigNoz MCP server to reconstruct a decision from
telemetry. It must answer from observable evidence rather than from the
TraceRoom operational database.

## What TraceRoom Owns

TraceRoom owns:

- session orchestration and correlation identifiers
- the shared market snapshot record
- agent-stage and evidence records
- deterministic evidence validation
- consensus and risk-governance results
- replay and human-readable decision views
- deep links into supporting SigNoz evidence

TraceRoom does not rebuild SigNoz Trace Explorer. Its own UI explains the
decision in domain language, while SigNoz remains the place for deep technical
investigation, aggregate dashboards, metrics, logs, and alerts.

## Current Instrumented Workload

The current healthy replay uses:

- snapshot: `snapshot-001`
- symbol: `ACME`
- horizon: 30 minutes
- agents: Momentum Scout, Mean Reversion Analyst, and Market Skeptic

This fixed replay input keeps the workflow repeatable outside market hours. The
configured LLM still generates the proposal, rebuttal, and final-vote content;
those outputs are not prewritten UI fixtures.

## Healthy Session Flow

1. The user clicks **Run Healthy Session**.
2. TraceRoom creates a correlated session identifier.
3. The API loads the selected configured replay snapshot.
4. All three agents receive the same snapshot.
5. Each agent makes an LLM call and submits a sealed proposal.
6. TraceRoom validates every cited value against the shared snapshot.
7. Each agent cross-examines the other two proposals through another LLM call.
8. Each agent submits a final vote through a third LLM call.
9. Consensus selects a majority position or reports a deadlock.
10. The deterministic risk engine approves, vetoes, or records no executable trade.
11. The real stage outputs are persisted to SQLite for the TraceRoom UI.
12. OpenTelemetry sends traces, logs, and metrics to SigNoz.
13. The user can inspect the domain view in TraceRoom or open the supporting evidence in SigNoz.

A successful healthy workflow currently produces a 27-span `debate.session`
trace plus a separately linked `decision.evaluation` trace when evaluation is
applicable.

## What The User Sees

### TraceRoom Command

Command is the demo starting point:

- choose one configured snapshot or Random
- launch any of the five replay scenarios
- see the honest “agents debating” state during the real LLM calls
- inspect the newest session's ticker, price, evidence count, and outcome
- open the complete incident record

The Incidents page then presents replay, agents, controlled injections, stage
statuses, the expandable Debate transcript, real session metrics, and the
matching SigNoz links in one continuous scroll.

### SigNoz Investigation

SigNoz provides the engineering and operational view:

- the complete decision trace and LLM-call hierarchy
- errors and latency by stage
- correlated structured logs
- token, cost, reliability, and outcome metrics
- Decision Integrity and Agent Reliability dashboards
- alerts for unsafe or abnormal sessions

## Tiny Glossary

**Agent** — An autonomous component that examines the shared snapshot and
returns a recommendation.

**Market snapshot** — The common, fixed input all agents must use for a replay.

**Evidence** — A cited value and statement supporting an agent argument.

**Evidence validation** — A deterministic comparison between cited values and
the authoritative snapshot.

**Consensus** — The majority result after final votes.

**Risk review** — Deterministic governance that approves or vetoes a proposed
action after consensus.

**Trace** — A causal timeline of one decision workflow and its child operations.

**Log** — A structured event containing readable detail about a workflow stage.

**Metric** — A numeric measurement aggregated across sessions, such as latency,
cost, veto rate, or validation rate.

**Alert** — A SigNoz rule that notifies operators when telemetry shows a problem.

**Replay** — A repeatable run using a fixed historical or simulated snapshot.

## Available Replay Scenarios

- **Healthy:** the generated room proceeds without a controlled fault.
- **Evidence fault:** one generated evidence value is shifted by 8%, validation
  fails, and `EVIDENCE_INTEGRITY` stops the pipeline. Cross-examination, final
  voting, consensus, risk review, evaluation, and execution are marked
  **Not run**.
- **Risk veto:** the generated stages still run, then the replay transparently
  normalizes final votes to `LONG` so the stricter `MAX_PRICE_MOVE` policy is
  exercised.
- **Error:** the generated stages still run, then a controlled post-stage
  recording failure creates a persisted, inspectable error session.
- **Deadlock:** the generated stages still run, then the replay transparently
  normalizes final votes to `LONG`, `SHORT`, and `NO_TRADE`, producing no
  majority and triggering `CONSENSUS_REQUIRED`.

The controlled modifications are demo fixtures, not claims that the LLM
naturally produced those incidents. TraceRoom records them explicitly in the
session replay and telemetry. The UI labels them **Injected Scenario** and
shows the generated and forced vote for every agent. SigNoz retains the real
LLM result on `agent.final_vote` and records the transformation as
`scenario.vote_override` events on the parent final-vote round.

## Human-Readable Debate Record

The incident's expandable **View Full Debate Transcript** section turns saved
agent-stage outputs into one chronological record. It shows the shared
snapshot, each proposal and its evidence, cross-examination, final votes,
consensus, and risk verdict. Controlled injections appear inline, while stages
stopped by the evidence gate remain visible as **Skipped**. The header links the
readable record to its SigNoz trace.

## Upcoming Product Work

- full snapshot authoring beyond the frozen config picker

Live-market and paper-trading modes are deprioritized. They are potential data
sources for TraceRoom, not the core product.

## What To Say During The Demo

> TraceRoom is the audit layer for autonomous financial agents. The agents make
> a decision, TraceRoom records and governs the lifecycle, and SigNoz gives us
> the traces, logs, metrics, dashboards, and alerts needed to prove exactly what
> happened.

Closing line:

> TraceRoom does not promise autonomous financial agents will always be right.
> It makes sure they can never be opaque.
