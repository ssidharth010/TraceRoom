import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  Flask,
  LockKey,
  Pulse,
  WarningDiamond,
  XCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configuredSnapshots } from "../../../src/config/snapshots";
import { AgentCanvas } from "../components/AgentCanvas";
import { formatScenario, OutcomeBadge } from "../components/SessionUI";
import { useTraceRoom } from "../TraceRoomContext";
import type { SessionScenario } from "../types";

const canonicalSnapshot = configuredSnapshots[0];

const labScenarios: Array<{
  scenario: SessionScenario;
  label: string;
  detail: string;
  icon: typeof CheckCircle;
}> = [
  {
    scenario: "risk-veto",
    label: "Risk policy",
    detail: "Verify that an unsafe decision is vetoed",
    icon: LockKey,
  },
  {
    scenario: "error",
    label: "Workflow recovery",
    detail: "Verify that an unexpected stage failure is recorded",
    icon: XCircle,
  },
  {
    scenario: "deadlock",
    label: "Consensus control",
    detail: "Verify that a split decision cannot execute",
    icon: ClockCounterClockwise,
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { sessions, loadingScenario, runScenario, selectSession } =
    useTraceRoom();
  const [labOpen, setLabOpen] = useState(false);
  const [labSnapshotId, setLabSnapshotId] = useState(
    canonicalSnapshot?.snapshotId ?? "",
  );

  const latest = sessions[0] ?? null;
  const decisionStats = useMemo(
    () => ({
      total: sessions.length,
      approved: sessions.filter((session) => session.outcome === "APPROVED")
        .length,
      blocked: sessions.filter((session) =>
        ["EVIDENCE_BLOCKED", "VETOED", "DEADLOCKED"].includes(session.outcome),
      ).length,
      failed: sessions.filter((session) => session.outcome === "ERROR").length,
    }),
    [sessions],
  );
  const labSnapshot = useMemo(
    () =>
      configuredSnapshots.find(
        (snapshot) => snapshot.snapshotId === labSnapshotId,
      ) ?? canonicalSnapshot,
    [labSnapshotId],
  );

  async function run(
    scenario: SessionScenario,
    snapshotId = canonicalSnapshot?.snapshotId,
    symbol = canonicalSnapshot?.symbol,
  ) {
    const session = await runScenario(scenario, snapshotId, symbol);
    if (!session) return;
    selectSession(session.sessionId);
    navigate("/incidents");
  }

  function openLatestIncident() {
    if (!latest) return;
    selectSession(latest.sessionId);
    navigate("/incidents");
  }

  return (
    <div className="page command-page product-command">
      <header className="command-hero">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">BLACK BOX FOR FINANCIAL AGENTS</span>
          <h1>Record every agent decision. Block unsafe execution.</h1>
          <p>
            TraceRoom captures agent reasoning, validates market evidence,
            enforces risk policy, and proves every outcome through SigNoz.
          </p>
          <div className="command-actions">
            <button
              className="run-button"
              disabled={loadingScenario !== null || !canonicalSnapshot}
              onClick={() => void run("healthy")}
            >
              {loadingScenario === "healthy" ? (
                <Pulse className="spin" />
              ) : (
                <CheckCircle weight="fill" />
              )}
              <span>
                <strong>RUN AGENT SESSION</strong>
                <small>INFY monitored workflow</small>
              </span>
              <ArrowRight />
            </button>
            <button
              className="control-test-button"
              disabled={loadingScenario !== null || !canonicalSnapshot}
              onClick={() => void run("evidence-fault")}
            >
              <WarningDiamond weight="fill" />
              SIMULATE EVIDENCE BREACH
            </button>
          </div>
        </motion.div>
        <motion.aside
          className="decision-system-map"
          initial={reduce ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          aria-label="TraceRoom decision control path"
        >
          <header>
            <span>DECISION CONTROL PATH</span>
            <strong>ACTIVE</strong>
          </header>
          <div className="system-map-intro">
            <strong>
              A decision cannot reach execution until every control passes.
            </strong>
          </div>
          <div className="system-map-stages">
            {[
              ["Agents deliberate", "RECORDED"],
              ["Evidence is validated", "ENFORCED"],
              ["Risk policy is reviewed", "ENFORCED"],
              ["Execution is gated", "CONTROLLED"],
            ].map(([label, status], index) => (
              <motion.div
                key={label}
                initial={reduce ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.08 }}
              >
                <span>
                  <CheckCircle weight="fill" />
                  {label}
                </span>
                <strong>{status}</strong>
              </motion.div>
            ))}
          </div>
          <footer>
            Spans, logs, metrics, and proof remain bound to one session.
          </footer>
        </motion.aside>
      </header>

      <dl className="decision-stats" aria-label="Recorded session totals">
        <div>
          <dt>Recorded sessions</dt>
          <dd>{decisionStats.total}</dd>
        </div>
        <div>
          <dt>Approved</dt>
          <dd>{decisionStats.approved}</dd>
        </div>
        <div>
          <dt>Blocked by controls</dt>
          <dd>{decisionStats.blocked}</dd>
        </div>
        <div>
          <dt>Workflow failures</dt>
          <dd>{decisionStats.failed}</dd>
        </div>
      </dl>

      <section className="latest-decision" aria-labelledby="latest-heading">
        <header>
          <div>
            <span className="eyebrow">LATEST DECISION</span>
            <h2 id="latest-heading">
              {latest
                ? `${latest.snapshot.symbol} / ${formatScenario(latest.scenario)}`
                : "No decision recorded yet."}
            </h2>
          </div>
          {latest && <OutcomeBadge outcome={latest.outcome} />}
        </header>

        {latest ? (
          <div className="latest-decision-grid">
            <button
              className="latest-decision-summary"
              onClick={openLatestIncident}
            >
              <dl>
                <div>
                  <dt>Ticker</dt>
                  <dd>{latest.snapshot.symbol}</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>{latest.snapshot.currentPrice.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>
                    {latest.evidenceValidation.validCount}/
                    {latest.evidenceValidation.checkedCount}
                  </dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>{latest.outcome}</dd>
                </div>
              </dl>
              <span>
                VIEW DECISION <ArrowRight />
              </span>
            </button>
            <div className="latest-network">
              <AgentCanvas session={latest} compact />
            </div>
          </div>
        ) : (
          <p className="latest-empty">
            Start a monitored run to create the first decision record.
          </p>
        )}
      </section>

      <section className="scenario-lab control-tests">
        <button
          className="scenario-lab-toggle"
          onClick={() => setLabOpen((open) => !open)}
          aria-expanded={labOpen}
        >
          <Flask />
          <span>
            <strong>CONTROL TESTS</strong>
            <small>Safely verify policy enforcement and failure handling</small>
          </span>
          <ArrowRight className={labOpen ? "rotate-down" : ""} />
        </button>
        <AnimatePresence initial={false}>
          {labOpen && (
            <motion.div
              className="scenario-lab-panel"
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label htmlFor="lab-snapshot">MARKET SNAPSHOT</label>
              <select
                id="lab-snapshot"
                value={labSnapshotId}
                onChange={(event) => setLabSnapshotId(event.target.value)}
                disabled={loadingScenario !== null}
              >
                {configuredSnapshots.map((snapshot) => (
                  <option value={snapshot.snapshotId} key={snapshot.snapshotId}>
                    {snapshot.symbol} /{" "}
                    {new Date(snapshot.observedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
              <div className="lab-action-grid">
                {labScenarios.map(
                  ({ scenario, label, detail, icon: Icon }) => (
                    <button
                      key={scenario}
                      disabled={loadingScenario !== null || !labSnapshot}
                      onClick={() =>
                        void run(
                          scenario,
                          labSnapshot?.snapshotId,
                          labSnapshot?.symbol,
                        )
                      }
                    >
                      <Icon />
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                      <ArrowRight />
                    </button>
                  ),
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
