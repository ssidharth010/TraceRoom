# TraceRoom Product Spec

TraceRoom is a decision-observability and audit platform for autonomous
financial agents. It records the full decision trail: shared snapshot,
independent proposals, cross-examination, final votes, consensus, evidence
validation, deterministic risk review, evaluation, replay, and supporting
SigNoz telemetry.

The financial-agent workflow is the instrumented workload, not the product.
TraceRoom is the audit and governance layer. SigNoz supplies the traces, logs,
metrics, dashboards, alerts, and MCP-backed investigation surfaces.

```text
Agents recommend.
Consensus selects.
The risk engine governs.
TraceRoom audits.
```

## Current Replay Fixture

- Snapshot: `snapshot-001`
- Symbol: `ACME`
- Current price: `104.50`
- Previous close: `1600.00`
- Horizon: `30` minutes
- Agents: Momentum Scout, Mean Reversion Analyst, Market Skeptic

The snapshot is passed to the configured LLM agents. Their validated structured
outputs—not prewritten demo proposals—are persisted and returned to the UI.

## Current Replay Outcomes

The UI and API expose five real-agent replay paths:

- healthy decision processing
- controlled evidence-integrity failure
- controlled deterministic risk veto
- controlled post-stage workflow error
- controlled consensus deadlock

All paths send the selected configured snapshot through the proposal LLM calls.
Healthy, risk-veto, error, and deadlock continue through rebuttal and final
voting. Evidence-fault terminates immediately after deterministic validation
fails, leaving those downstream stages explicitly not run. Scenario controls
are disclosed in the replay and telemetry and make the incident demonstrations
repeatable. No live or paper trade is placed.

## Incident Record And Debate Transcript

Each incident is one continuous audit record. Its collapsed Debate transcript
is the human-readable companion to the SigNoz trace and renders the persisted
stage outputs in chronological order:
snapshot, proposals, per-claim validation, cross-examination, final votes,
consensus, and risk verdict. Scenario injections are labeled at the point where
they enter the workflow, generated and recorded votes remain distinguishable,
and evidence-gated stages are shown as skipped instead of disappearing.

This transcript does not replace SigNoz. It explains the argument content while
the linked SigNoz trace, logs, metrics, dashboards, and alerts prove the
instrumented execution path.
