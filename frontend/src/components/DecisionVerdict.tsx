import {
  ArrowSquareOut,
  Check,
  DownloadSimple,
  MagnifyingGlass,
  Pulse,
  ShieldWarning,
  X,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadSessionVerification } from "../api";
import { downloadProofPack } from "../proofPack";
import type {
  RecordedSession,
  SessionTelemetryVerification,
} from "../types";

const stageLabels: Array<
  [keyof RecordedSession["stageStatuses"], string]
> = [
  ["proposals", "Evidence enters"],
  ["evidenceValidation", "Mismatch detected"],
  ["crossExamination", "Cross-examination"],
  ["finalVote", "Final vote"],
  ["riskReview", "Risk review"],
  ["evaluation", "Evaluation"],
];

export function DecisionVerdict({ session }: { session: RecordedSession }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [verification, setVerification] =
    useState<SessionTelemetryVerification | null>(null);
  const [verificationError, setVerificationError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const failedEvidence = useMemo(
    () =>
      session.evidenceValidation.agents
        .flatMap((agent) =>
          agent.checkedEvidence.map((claim) => ({
            claim,
            tolerancePct: agent.tolerancePct,
          })),
        )
        .find(({ claim }) => claim.validationStatus !== "valid") ?? null,
    [session],
  );

  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;
    let attempts = 0;
    setVerification(null);
    setVerificationError(false);

    async function verify() {
      attempts += 1;
      try {
        const result = await loadSessionVerification(session.sessionId);
        if (!active) return;
        setVerification(result);
        setVerificationError(false);
        const complete =
          result.traceVerified &&
          result.logCorrelated &&
          result.dashboardUpdated &&
          result.alertFiring &&
          result.mcpVerified;
        if (!complete && attempts < 12) {
          retryTimer = window.setTimeout(() => void verify(), 5_000);
        }
      } catch {
        if (!active) return;
        setVerificationError(true);
        if (attempts < 12) {
          retryTimer = window.setTimeout(() => void verify(), 5_000);
        }
      }
    }

    void verify();
    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [session.sessionId]);

  async function download() {
    setDownloading(true);
    setDownloadError(false);
    try {
      await downloadProofPack(session.sessionId);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }

  if (!session.evidenceValidation.blocked || !failedEvidence) {
    return null;
  }

  const cited = failedEvidence.claim.citedValue.toFixed(2);
  const authoritative = failedEvidence.claim.referenceValue.toFixed(2);
  const deviation = failedEvidence.claim.deviationPct.toFixed(2);
  const tolerance = failedEvidence.tolerancePct.toFixed(2);
  const ribbon = [
    ["TRACE VERIFIED", verification?.traceVerified],
    ["LOG CORRELATED", verification?.logCorrelated],
    ["DASHBOARD UPDATED", verification?.dashboardUpdated],
    ["ALERT FIRING", verification?.alertFiring],
    ["MCP VERIFIED", verification?.mcpVerified],
  ] as const;

  return (
    <section className="decision-verdict" aria-labelledby="verdict-heading">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <ShieldWarning weight="duotone" />
          <span>DECISION VERDICT</span>
        </div>
        <strong>EXECUTION BLOCKED</strong>
      </motion.header>

      <div className="verdict-values">
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.06 }}
        >
          <span>AUTHORITATIVE PRICE</span>
          <strong>{authoritative}</strong>
          <small>{session.snapshot.symbol} locked snapshot</small>
        </motion.div>
        <motion.div
          className="verdict-corrupt"
          initial={reduce ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12 }}
        >
          <span>CORRUPTED CITATION</span>
          <strong>{cited}</strong>
          <small>Controlled evidence injection</small>
        </motion.div>
        <motion.div
          className="verdict-threshold"
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span>DEVIATION</span>
          <strong>
            {deviation}% <b>&gt;</b> {tolerance}%
          </strong>
          <small>observed / maximum tolerance</small>
        </motion.div>
        <motion.div
          className="verdict-gate"
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.27 }}
        >
          <span>GATE CLOSED</span>
          <strong id="verdict-heading">
            {session.pipelineGate.reasonCode ?? "EVIDENCE_INTEGRITY"}
          </strong>
          <small>Downstream work short-circuited</small>
        </motion.div>
      </div>

      <div className="verdict-stage-rail" aria-label="Pipeline short circuit">
        {stageLabels.map(([stage, label], index) => {
          const status = session.stageStatuses[stage];
          return (
            <motion.div
              key={stage}
              className={`verdict-stage verdict-stage-${status.toLowerCase()}`}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.07 }}
            >
              <span>{status === "COMPLETED" ? <Check /> : <X />}</span>
              <strong>{label}</strong>
              <small>{status}</small>
            </motion.div>
          );
        })}
      </div>

      <div className="evidence-ribbon" aria-label="Live SigNoz verification">
        {ribbon.map(([label, verified]) => (
          <div
            key={label}
            className={
              verified
                ? "evidence-ribbon-item verified"
                : "evidence-ribbon-item unavailable"
            }
          >
            {verification === null && !verificationError ? (
              <Pulse className="spin" />
            ) : verified ? (
              <Check />
            ) : (
              <X />
            )}
            <span>{label}</span>
          </div>
        ))}
      </div>
      {verificationError && (
        <p className="verdict-inline-error">
          Live SigNoz verification is unavailable. The session record remains
          intact, but no verification badge was granted.
        </p>
      )}

      <div className="verdict-actions">
        <a
          className="primary-button"
          href={session.signoz.traceUrl}
          target="_blank"
          rel="noreferrer"
        >
          OPEN SIGNOZ TRACE <ArrowSquareOut />
        </a>
        <button
          className="secondary-button"
          onClick={() => navigate("/evidence?ask=why")}
        >
          <MagnifyingGlass /> ASK SIGNOZ WHY
        </button>
        <button
          className="secondary-button"
          onClick={() => void download()}
          disabled={downloading}
        >
          {downloading ? (
            <Pulse className="spin" />
          ) : (
            <DownloadSimple />
          )}
          DOWNLOAD PROOF PACK
        </button>
      </div>
      {downloadError && (
        <p className="verdict-inline-error">
          Proof pack generation failed. Check the TraceRoom API and retry.
        </p>
      )}
    </section>
  );
}
