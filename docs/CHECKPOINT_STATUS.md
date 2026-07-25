# Checkpoint Status

Current target: configured replay sessions driven by the real three-agent LLM
pipeline and recorded in SigNoz.

## Completed

- Foundry files exist: `casting.yaml`, `casting.yaml.lock`.
- ACME `snapshot-001` is the canonical fixture; Command can also select NOVA,
  ORBT, VELA, or Random.
- Three proposal, rebuttal, and final-vote stages execute through the configured LLM.
- Evidence validation, consensus, risk review, and linked evaluation are traced.
- Node API persists real stage outputs to SQLite.
- React/Vite actions for all five replay scenarios call the API through `/api`.
- Root `npm run dev` starts and watches the API and frontend together. Its
  startup check rejects an older API process that does not support configured
  snapshots.
- A UI-triggered healthy run produces the expected 27-span `debate.session` trace.
- Evidence-fault, risk-veto, deadlock, and controlled-error sessions start from
  the selected real agent pipeline and persist their outcomes.
- The evidence-integrity gate persists a terminal blocked session and skips
  every downstream debate and decision stage.
- The expandable Debate transcript renders the complete saved decision record, including
  validated evidence, cross-examination, vote changes, controlled injections,
  consensus, risk verdicts, errors, and explicit skipped-stage stubs.
- Command owns all five run actions and the read-only snapshot picker.
- Completed runs announce the scenario, symbol, and persisted outcome in a
  dismissible toast with a direct link to the recorded incident.
- Incidents render replay, agents, controlled injections, stage statuses,
  debate, real metrics, and SigNoz links in one continuous detail view.
- Deterministic tests cover `EVIDENCE_INTEGRITY`, `MAX_PRICE_MOVE`,
  `CONSENSUS_REQUIRED`, and scenario routing.
- The Evidence page accepts natural-language session questions and searches
  read-only SigNoz MCP trace, log, metric, alert, and dashboard tools through
  the API.
- Evidence keeps receipt export, the Auditor, and the dashboard action while
  SigNoz trace navigation remains centralized in Incidents.
- Ask the Auditor labels live MCP results and preserves a deterministic
  persisted-session fallback when the local MCP service is unavailable.
- The four-page interface separates Command, a session-bound Agent Room,
  continuous incident records, and forensic evidence.
- Downloaded block receipts include a SHA-256 checksum over their proof payload.
- The snapshot picker is read-only over four config-defined fixtures; full
  authoring remains roadmap work.

## Working Demo Path

1. Run `npm install` and `npm --prefix frontend install` once.
2. Start Foundry/SigNoz and confirm OTLP port `4318` is exposed.
3. Run `npm run dev` from the repository root.
4. Open `http://127.0.0.1:5173`.
5. Choose a configured snapshot and run any scenario from Command.
6. Open its incident and inspect the bound replay, agents, injection disclosure,
   stage statuses, Debate transcript, real metrics, and SigNoz links.
7. Open the session-bound Agent Room or ask `Why was execution blocked?`, `Which span
failed?`, or `Show the session logs`.
8. Download the proof receipt or copy the trace ID from the Evidence page.
9. Open the `debate.session` trace in SigNoz and inspect its stage hierarchy,
   attributes, events, logs, and error status.

## Pending

- Capture final dashboard and alert screenshots plus their live URLs.

Live market trading and paper trading are intentionally deprioritized.
