import {
  ArrowSquareOut,
  CheckCircle,
  DownloadSimple,
  Fingerprint,
  PaperPlaneTilt,
  Pulse,
  ShieldCheck,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { askAuditor } from "../api";
import { downloadProofPack } from "../proofPack";
import { useTraceRoom } from "../TraceRoomContext";
import type { TelemetryQuestionAnswer } from "../types";

export function EvidencePage() {
  const { selected } = useTraceRoom();
  const reduce = useReducedMotion();
  const [searchParams] = useSearchParams();
  const questions = useMemo(
    () => [
      `Why did TraceRoom ${selected?.execution.status === "BLOCKED" ? "stop" : "approve"} ${selected?.snapshot.symbol ?? "this session"}?`,
      "Which span failed?",
      "Show the session logs",
      "Were any alerts firing?",
    ],
    [selected],
  );
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TelemetryQuestionAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialQuestion = questions[0] ?? "";
    setQuestion(initialQuestion);
    setAnswer(null);
    setError(null);
    if (
      searchParams.get("ask") === "why" &&
      selected &&
      initialQuestion.length > 0
    ) {
      setLoading(true);
      void askAuditor(selected.sessionId, initialQuestion)
        .then(setAnswer)
        .catch((caught: unknown) => {
          setError(
            caught instanceof Error ? caught.message : "Auditor search failed.",
          );
        })
        .finally(() => setLoading(false));
    }
  }, [questions, searchParams, selected]);

  async function submitQuestion() {
    if (!selected || !question.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      setAnswer(await askAuditor(selected.sessionId, question.trim()));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Auditor search failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function downloadReceipt() {
    if (!selected) return;
    await downloadProofPack(selected.sessionId);
  }

  if (!selected) {
    return (
      <div className="page evidence-empty">
        <Fingerprint />
        <h1>Select evidence to investigate.</h1>
        <p>
          Choose a recorded incident first. Auditor questions and downloaded
          evidence remain bound to that exact session.
        </p>
        <Link className="primary-button" to="/incidents">
          OPEN INCIDENTS
        </Link>
      </div>
    );
  }

  return (
    <div className="page evidence-page">
      <header className="page-heading evidence-heading">
        <div>
          <span className="eyebrow">FORENSIC EVIDENCE</span>
          <h1>Do not trust the summary. Inspect the proof.</h1>
        </div>
        <div className="evidence-actions">
          <button
            className="secondary-button"
            onClick={() => void downloadReceipt()}
          >
            <DownloadSimple /> DOWNLOAD PROOF PACK
          </button>
          <a
            className="secondary-button"
            href={selected.signoz.dashboardUrl}
            target="_blank"
            rel="noreferrer"
          >
            OPEN DASHBOARD <ArrowSquareOut />
          </a>
        </div>
      </header>

      <section className="auditor-console">
        <div className="auditor-intro">
          <div className="auditor-icon">
            <ShieldCheck weight="duotone" />
          </div>
          <h2>Ask the Auditor</h2>
          <p>
            Natural-language investigation grounded in the selected decision
            trace. MCP connectivity is checked when a question runs; an
            unavailable key or service returns an explicitly labeled persisted
            session fallback.
          </p>
        </div>
        <div className="auditor-form">
          <label htmlFor="auditor-question">Question</label>
          <div>
            <input
              id="auditor-question"
              value={question}
              maxLength={500}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitQuestion();
              }}
            />
            <button
              className="send-button"
              onClick={() => void submitQuestion()}
              disabled={loading || !question.trim()}
              aria-label="Ask the Auditor"
            >
              {loading ? (
                <Pulse className="spin" />
              ) : (
                <PaperPlaneTilt weight="fill" />
              )}
            </button>
          </div>
          <div className="question-list">
            {questions.map((item) => (
              <button key={item} onClick={() => setQuestion(item)}>
                {item}
              </button>
            ))}
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>

      <AnimatePresence mode="wait">
        {answer ? (
          <motion.section
            className="auditor-answer"
            key={answer.answer}
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <header>
              <span>
                <CheckCircle weight="fill" />{" "}
                {answer.source === "signoz_mcp"
                  ? "VERIFIED BY SIGNOZ MCP"
                  : "SIGNOZ MCP UNAVAILABLE - PERSISTED SESSION FALLBACK"}
              </span>
              <small>TRACE {answer.traceId}</small>
            </header>
            <h2>{answer.answer}</h2>
            <div className="evidence-matrix">
              {answer.evidence
                .filter((item) => item.label !== "MCP result")
                .map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                ))}
            </div>
          </motion.section>
        ) : (
          <section className="auditor-standby">
            <Pulse />
            <span>
              Auditor ready to check MCP for trace{" "}
              {selected.signoz.traceId.slice(0, 12)}
            </span>
          </section>
        )}
      </AnimatePresence>
    </div>
  );
}
