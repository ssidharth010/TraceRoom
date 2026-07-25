import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  Flask,
  LockKey,
  Pulse,
  ShieldCheck,
  WarningDiamond,
  XCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configuredSnapshots } from "../../../src/config/snapshots";
import { loadDemoReadiness } from "../api";
import { AgentCanvas } from "../components/AgentCanvas";
import { formatScenario, OutcomeBadge } from "../components/SessionUI";
import { useTraceRoom } from "../TraceRoomContext";
import type { DemoReadiness, SessionScenario } from "../types";

const canonicalSnapshot = configuredSnapshots[0];

const labScenarios: Array<{
  scenario: SessionScenario;
  label: string;
  detail: string;
  icon: typeof CheckCircle;
}> = [
  {
    scenario: "risk-veto",
    label: "Risk veto",
    detail: "Exercise the deterministic policy boundary",
    icon: LockKey,
  },
  {
    scenario: "error",
    label: "Workflow error",
    detail: "Record an uncontrolled stage failure",
    icon: XCircle,
  },
  {
    scenario: "deadlock",
    label: "Agent deadlock",
    detail: "Force a split with no majority",
    icon: ClockCounterClockwise,
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { sessions, loadingScenario, runScenario, selectSession, booting } =
    useTraceRoom();
  const [readiness, setReadiness] = useState<DemoReadiness | null>(null);
  const [readinessError, setReadinessError] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [labSnapshotId, setLabSnapshotId] = useState(
    canonicalSnapshot?.snapshotId ?? "",
  );

  const latest = sessions[0] ?? null;
  const labSnapshot = useMemo(
    () =>
      configuredSnapshots.find(
        (snapshot) => snapshot.snapshotId === labSnapshotId,
      ) ?? canonicalSnapshot,
    [labSnapshotId],
  );

  useEffect(() => {
    let active = true;
    void loadDemoReadiness()
      .then((result) => {
        if (active) {
          setReadiness(result);
          setReadinessError(false);
        }
      })
      .catch(() => {
        if (active) setReadinessError(true);
      });
    return () => {
      active = false;
    };
  }, []);

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

  const readinessItems = readiness
    ? [
        ["API", readiness.api],
        ["LLM", readiness.llm],
        ["SIGNOZ UI", readiness.signozUi],
        ["SIGNOZ MCP", readiness.signozMcp],
        ["DASHBOARD", readiness.dashboard],
        ["ALERTS", readiness.alerts],
        ["INFY FIXTURE", readiness.canonicalFixture],
      ]
    : [];

  return (
    <div className="page command-page judge-mode">
      <header className="judge-hero">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">DECISION EVIDENCE FIREWALL</span>
          <h1>Watch one false claim stop an autonomous decision.</h1>
          <p>
            TraceRoom blocks corrupted INFY evidence, then SigNoz proves where
            the agent workflow stopped.
          </p>
          <div className="judge-actions">
            <button
              className="breach-button"
              disabled={loadingScenario !== null || !canonicalSnapshot}
              onClick={() => void run("evidence-fault")}
            >
              {loadingScenario === "evidence-fault" ? (
                <Pulse className="spin" />
              ) : (
                <WarningDiamond weight="fill" />
              )}
              <span>
                <strong>RUN THE EVIDENCE BREACH</strong>
                <small>INFY / 8.00% controlled corruption</small>
              </span>
              <ArrowRight />
            </button>
            <button
              className="healthy-compare-button"
              disabled={loadingScenario !== null || !canonicalSnapshot}
              onClick={() => void run("healthy")}
            >
              <CheckCircle weight="fill" />
              COMPARE HEALTHY RUN
            </button>
          </div>
        </motion.div>

        <motion.aside
          className="readiness-terminal"
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          aria-live="polite"
        >
          <header>
            <div>
              <ShieldCheck weight="duotone" />
              <span>DEMO READINESS</span>
            </div>
            <strong
              className={
                readiness?.ready ? "readiness-ready" : "readiness-attention"
              }
            >
              {booting || (!readiness && !readinessError)
                ? "CHECKING"
                : readiness?.ready
                  ? "ALL SYSTEMS READY"
                  : "ATTENTION REQUIRED"}
            </strong>
          </header>
          {readinessError ? (
            <p className="readiness-error">
              Readiness endpoint unavailable. Restart the TraceRoom API.
            </p>
          ) : (
            <div className="readiness-grid">
              {readinessItems.map(([label, status], index) => (
                <motion.div
                  key={label}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + index * 0.035 }}
                >
                  <span>{label}</span>
                  <strong
                    className={
                      status === "READY" || status === "VERIFIED"
                        ? "status-ok"
                        : "status-missing"
                    }
                  >
                    {status}
                  </strong>
                </motion.div>
              ))}
              {!readiness && !readinessError && (
                <div className="readiness-skeleton" aria-hidden="true" />
              )}
            </div>
          )}
        </motion.aside>
      </header>

      <section className="canonical-frame" aria-label="Canonical demo contract">
        <div>
          <span>AUTHORITATIVE</span>
          <strong>1684.50</strong>
        </div>
        <div className="canonical-transfer">
          <span>CONTROLLED FAULT</span>
          <strong>+8.00%</strong>
          <ArrowRight />
        </div>
        <div>
          <span>AGENT CITATION</span>
          <strong>1819.26</strong>
        </div>
        <div className="canonical-gate">
          <span>MAX TOLERANCE</span>
          <strong>2.00%</strong>
          <small>EVIDENCE_INTEGRITY closes the gate</small>
        </div>
      </section>

      <section className="scenario-lab">
        <button
          className="scenario-lab-toggle"
          onClick={() => setLabOpen((open) => !open)}
          aria-expanded={labOpen}
        >
          <Flask />
          <span>
            <strong>OPEN SCENARIO LAB</strong>
            <small>Secondary fixtures and controlled failure modes</small>
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
              <label htmlFor="lab-snapshot">REPLAY FIXTURE</label>
              <select
                id="lab-snapshot"
                value={labSnapshotId}
                onChange={(event) => setLabSnapshotId(event.target.value)}
                disabled={loadingScenario !== null}
              >
                {configuredSnapshots.map((snapshot) => (
                  <option value={snapshot.snapshotId} key={snapshot.snapshotId}>
                    {snapshot.symbol} / {snapshot.snapshotId}
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

      <section className="latest-decision" aria-labelledby="latest-heading">
        <header>
          <div>
            <span className="eyebrow">LATEST RECORDED DECISION</span>
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
                OPEN INCIDENT <ArrowRight />
              </span>
            </button>
            <div className="latest-network">
              <AgentCanvas session={latest} compact />
            </div>
          </div>
        ) : (
          <p className="latest-empty">
            Run the evidence breach to create the canonical decision record.
          </p>
        )}
      </section>
    </div>
  );
}
