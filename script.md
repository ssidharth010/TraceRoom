# TraceRoom Demo Script

**Target:** 2:20  
**Hard limit:** 2:30  
**Audience:** experienced judges who should understand the product without
knowing autonomous-agent or observability terminology.

## Core story

TraceRoom is a black box recorder for financial AI. It validates what agents
claim, stops unsafe decisions, and uses SigNoz to prove what actually ran.

## Prepare before recording

The final video should feel live without making the judge watch setup or model
latency.

- Start TraceRoom, SigNoz, and the SigNoz MCP server.
- Run a fresh **Healthy** session and a fresh **INFY Evidence fault** session.
- Select the INFY incident and position its evidence failure on screen.
- In SigNoz, prepare tabs for:
  1. the INFY `debate.session` trace,
  2. its correlated logs,
  3. **TraceRoom / Submission Evidence** dashboard,
  4. **TraceRoom / Evidence Integrity Block** alert.
- Set the dashboard time range so both fresh sessions are visible.
- Confirm these dashboard panels contain data:
  **Session outcomes**, **Evidence blocks**, **LLM p95 latency**, and
  **Session cost**.
- Confirm the evidence alert is visibly firing.
- In TraceRoom **Evidence**, select the INFY incident and pre-fill:
  `Why was execution blocked?`
- Confirm the response will be labeled **VERIFIED BY SIGNOZ MCP**.
- Hide API keys, browser bookmarks, desktop notifications, and unrelated tabs.

If the dashboard, alert, or MCP result is not authenticated and visible, fix it
before recording. Do not replace live proof with a verbal claim.

## Final 2:20 recording

### 0:00–0:20 — The hook

**Show:** Begin directly on the INFY incident with `1819.26`, `1684.50`,
`8.00%`, `2.00%`, `EVIDENCE_INTEGRITY`, and **EXECUTION BLOCKED** visible.
Move the pointer across those values as they are spoken.

**Say:**

> This AI agent confidently cited 1,819 rupees. The trusted market snapshot said
> 1,684. It was eight percent wrong, while policy allows only two. TraceRoom
> caught the bad evidence and blocked the entire decision before any action
> could happen.

Pause briefly on **EXECUTION BLOCKED**.

### 0:20–0:40 — Make the product obvious

**Show:** Reveal the three agents and the pipeline stages in the same incident.

**Say:**

> TraceRoom is a black box recorder for financial AI. Three agents analyze one
> shared snapshot, challenge each other, vote, and pass through deterministic
> risk rules. TraceRoom records every step, validates every numeric claim, and
> makes the outcome explainable.

### 0:40–0:59 — Prove the safety gate

**Show:** Point to the invalid evidence row, then the downstream stages marked
**Skipped**. Expand **View Full Debate Transcript** only far enough to show the
shared snapshot, proposal, failure, and skipped stages.

**Say:**

> The evidence gate raised EVIDENCE_INTEGRITY. Cross-examination, voting,
> consensus, risk review, and execution are all marked skipped. This is not a
> warning added afterward. TraceRoom actually short-circuited the unsafe path,
> while preserving the agent's claim and the reason it failed.

### 0:59–1:19 — Prove it independently with traces and logs

**Show:** Open the prepared SigNoz trace. Point to `debate.session`, the three
agent proposal calls, and `evidence.validation`. Then switch to the correlated
log for the same session ID.

**Say:**

> SigNoz gives us independent operational proof. The trace ends at evidence
> validation, so the missing downstream operations prove they never ran. The
> correlated log carries the same session ID, blocking reason, invalid value,
> and execution status. The readable product record and the telemetry agree.

### 1:19–1:43 — Show system-level value on the dashboard

**Show:** Open **TraceRoom / Submission Evidence**. Move through four panels:
**Session outcomes**, **Evidence blocks**, **LLM p95 latency**, and
**Session cost**. Avoid opening panel editors.

**Say:**

> One incident explains what happened. The dashboard tells an operations team
> whether it is becoming a pattern. They can compare healthy and blocked
> sessions, count integrity failures, find slow agents, and watch model cost,
> all from telemetry emitted by the same decision pipeline.

### 1:43–1:56 — Show the alert

**Show:** Open the firing **TraceRoom / Evidence Integrity Block** alert. Keep
its condition and firing state visible.

**Say:**

> This alert fires when any session is blocked for evidence integrity. SigNoz
> notifies the team; TraceRoom's deterministic gate performs the immediate
> block. Monitoring and enforcement have separate, clear responsibilities.

### 1:56–2:13 — Ask and export

**Show:** Return to TraceRoom **Evidence**. Submit
`Why was execution blocked?` Show **VERIFIED BY SIGNOZ MCP**, the trace ID, and
the answer. Point to **DOWNLOAD RECEIPT**.

**Say:**

> An investigator can ask the read-only SigNoz Auditor in plain English. It
> reconstructs the answer for this exact trace, and TraceRoom exports a
> checksum-stamped receipt for audit or compliance review.

### 2:13–2:20 — Close

**Show:** Finish on the TraceRoom Command screen or wordmark.

**Say:**

> TraceRoom does not promise financial AI will always be right. It makes sure
> the AI can never be opaque.

Stop immediately. Do not add a stack list, roadmap, or thank-you slide.

## What the video proves

| Surface | Visible proof |
| --- | --- |
| TraceRoom incident | Wrong claim, authoritative value, tolerance, gate, and blocked execution |
| Debate transcript | Shared input, preserved claim, failure point, and skipped stages |
| SigNoz trace | Exact operations that ran and downstream operations that did not |
| SigNoz logs | Correlated, readable block event for the same session |
| SigNoz dashboard | Outcomes, evidence failures, latency, and cost across sessions |
| SigNoz alert | Evidence-integrity condition actively firing |
| SigNoz MCP | Plain-English reconstruction tied to the selected trace |
| Proof receipt | Portable record protected by a SHA-256 checksum |

## Delivery rules

- Speak at 135–145 words per minute. The narration is designed to leave small
  visual pauses while remaining under 2:30.
- Use “trusted market snapshot” before introducing technical vocabulary.
- Introduce “trace” only when SigNoz is visible.
- Never say a real trade was prevented. Say “the simulated action was blocked.”
- Do not scroll while delivering a key number or conclusion.
- Use hard cuts between prepared tabs if a page takes more than one second to
  load.
- Do not show dashboard editors, terminal setup, API keys, raw JSON, or source
  code in the main video.
- Do not spend time on all five scenarios. The dashboard establishes breadth;
  the INFY fault provides the memorable story.

## 90-second fallback

1. **0:00–0:20:** wrong value, trusted value, tolerance, and blocked action.
2. **0:20–0:40:** transcript and skipped downstream stages.
3. **0:40–1:00:** SigNoz trace plus correlated log.
4. **1:00–1:17:** dashboard plus firing alert.
5. **1:17–1:30:** MCP answer, receipt, and closing line.
