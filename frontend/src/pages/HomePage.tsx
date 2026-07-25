import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  DiceFive,
  LockKey,
  Pulse,
  WarningDiamond,
  XCircle,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configuredSnapshots } from "../../../src/config/snapshots";
import { AgentCanvas } from "../components/AgentCanvas";
import { formatScenario, OutcomeBadge } from "../components/SessionUI";
import { useTraceRoom } from "../TraceRoomContext";
import type { SessionScenario } from "../types";

const scenarioActions: Array<{
  scenario: SessionScenario;
  label: string;
  detail: string;
  icon: typeof CheckCircle;
}> = [
  {
    scenario: "healthy",
    label: "Healthy",
    detail: "Unmodified agent decision",
    icon: CheckCircle,
  },
  {
    scenario: "evidence-fault",
    label: "Evidence fault",
    detail: "Corrupted cited value",
    icon: WarningDiamond,
  },
  {
    scenario: "risk-veto",
    label: "Risk veto",
    detail: "Deterministic policy block",
    icon: LockKey,
  },
  {
    scenario: "error",
    label: "Error",
    detail: "Post-stage recording failure",
    icon: XCircle,
  },
  {
    scenario: "deadlock",
    label: "Deadlock",
    detail: "Forced 1 / 1 / 1 split",
    icon: ClockCounterClockwise,
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { sessions, loadingScenario, runScenario, selectSession, booting } =
    useTraceRoom();
  const [snapshotChoice, setSnapshotChoice] = useState("random");
  const [pendingSnapshotId, setPendingSnapshotId] = useState<string | null>(
    null,
  );

  const latest = sessions[0] ?? null;
  const chosenSnapshot = useMemo(
    () =>
      configuredSnapshots.find(
        (snapshot) => snapshot.snapshotId === snapshotChoice,
      ) ?? null,
    [snapshotChoice],
  );
  const pendingSnapshot =
    configuredSnapshots.find(
      (snapshot) => snapshot.snapshotId === pendingSnapshotId,
    ) ?? null;

  async function run(scenario: SessionScenario) {
    const snapshot =
      chosenSnapshot ??
      configuredSnapshots[
        Math.floor(Math.random() * configuredSnapshots.length)
      ];
    if (!snapshot) {
      return;
    }

    setPendingSnapshotId(snapshot.snapshotId);
    await runScenario(scenario, snapshot.snapshotId, snapshot.symbol);
    setPendingSnapshotId(null);
  }

  function openLatestIncident() {
    if (!latest) {
      return;
    }
    selectSession(latest.sessionId);
    navigate("/incidents");
  }

  return (
    <div className="page command-page">
      <header className="command-hero">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">DECISION OBSERVABILITY COMMAND</span>
          <h1>Run it. Trace it. Prove it.</h1>
          <p>
            Send one configured market snapshot through the autonomous agent
            room and inspect the complete decision record in TraceRoom and
            SigNoz.
          </p>
        </motion.div>
        <div className="command-state">
          <Pulse weight="fill" />
          <span>
            {loadingScenario
              ? `AGENTS DEBATING ${pendingSnapshot?.symbol ?? ""}`
              : booting
                ? "CONNECTING"
                : "SYSTEM READY"}
          </span>
        </div>
      </header>

      <section className="command-console" aria-labelledby="run-heading">
        <div className="snapshot-picker-panel">
          <span className="console-index">01 / MARKET INPUT</span>
          <h2 id="run-heading">Choose the evidence frame.</h2>
          <label htmlFor="snapshot-picker">CONFIGURED SNAPSHOT</label>
          <div className="snapshot-select-wrap">
            <DiceFive />
            <select
              id="snapshot-picker"
              value={snapshotChoice}
              onChange={(event) => setSnapshotChoice(event.target.value)}
              disabled={loadingScenario !== null}
            >
              <option value="random">RANDOM FIXTURE</option>
              {configuredSnapshots.map((snapshot) => (
                <option value={snapshot.snapshotId} key={snapshot.snapshotId}>
                  {snapshot.symbol} / {snapshot.snapshotId}
                </option>
              ))}
            </select>
          </div>

          {chosenSnapshot ? (
            <dl className="snapshot-picker-readout">
              <div>
                <dt>Symbol</dt>
                <dd>{chosenSnapshot.symbol}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{chosenSnapshot.currentPrice.toFixed(2)}</dd>
              </div>
              <div>
                <dt>RSI 14</dt>
                <dd>{chosenSnapshot.indicators.rsi14.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Horizon</dt>
                <dd>{chosenSnapshot.decisionHorizonMinutes}m</dd>
              </div>
            </dl>
          ) : (
            <p className="random-snapshot-copy">
              TraceRoom will select one of {configuredSnapshots.length}{" "}
              read-only fixtures when the run begins.
            </p>
          )}
        </div>

        <div className="scenario-launcher">
          <span className="console-index">02 / REPLAY SCENARIO</span>
          <div className="scenario-command-grid">
            {scenarioActions.map(({ scenario, label, detail, icon: Icon }) => (
              <button
                key={scenario}
                className={`scenario-command scenario-${scenario}`}
                disabled={loadingScenario !== null}
                onClick={() => void run(scenario)}
              >
                <Icon weight={scenario === "healthy" ? "fill" : "regular"} />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                {loadingScenario === scenario ? (
                  <Pulse className="spin" />
                ) : (
                  <ArrowRight />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="latest-decision" aria-labelledby="latest-heading">
        <header>
          <div>
            <span className="console-index">LATEST RECORDED DECISION</span>
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
            Choose a snapshot and run any scenario to create a decision record.
          </p>
        )}
      </section>
    </div>
  );
}
