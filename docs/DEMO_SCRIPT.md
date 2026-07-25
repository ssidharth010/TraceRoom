# Demo Script

## Final Submission Flow

1. Open **Command** and frame TraceRoom as the audit and governance layer around
   an autonomous financial-agent workload.
2. Leave the configured picker on ACME or choose another fixture, then run
   **Healthy**. While the request is active, point out the honest “agents
   debating” state.
3. Open the newest incident. Show the `APPROVED` outcome, session-bound replay,
   real agent proposals, and any genuine Initial → Final vote changes.
4. Expand **View Full Debate Transcript** and scroll through the snapshot,
   sealed proposals, evidence chips, cross-examination, final votes, consensus,
   and deterministic risk verdict.
5. Open the matching SigNoz trace from Investigate and show the 27-span
   `debate.session` structure.
6. Return to Command and run **Evidence Fault**. In its incident, show the
   controlled injection card, `112.86` cited against authoritative `104.50`,
   the `8.00%` deviation, `EVIDENCE_INTEGRITY`, and every downstream stage
   explicitly marked skipped.
7. Compare the remaining controlled scenarios:
   - **Risk Veto:** generated-to-forced vote table, risk-policy threshold
     override, and `MAX_PRICE_MOVE`.
   - **Deadlock:** generated-to-forced votes, 1/1/1 split, and
     `CONSENSUS_REQUIRED`.
   - **Error:** controlled post-stage error disclosure, readable error card, and
     the error trace.
8. Open **Agent Room** from one incident and explain that its cinematic replay
   is bound to that exact session rather than a global latest result.
9. Open **Evidence**, select the same incident, ask why it stopped or passed,
   and show the result labeled either SigNoz MCP verified or persisted-session
   fallback. Open the per-incident trace and dashboard links.
10. Close with: “TraceRoom does not promise autonomous financial agents will
    always be right. It makes sure they can never be opaque.”

Every scenario starts with a real configured-snapshot proposal stage. The
evidence-fault scenario stops after deterministic validation fails; the other
scenarios continue through real rebuttal and final-vote LLM stages. Controlled
changes are explicitly labeled in the UI and telemetry. Live and paper trading
are not part of the demo.

Use this line when introducing the deadlock:

> Deadlocks are rare organically, so TraceRoom ships controlled scenario
> injection to prove the detection path works. Here is the forced 1-1-1 split,
> the original LLM votes, and the corresponding SigNoz evidence.
