import "dotenv/config";
import { configuredSnapshots } from "../config/snapshots";
import {
  hasVerifiedAlertUrls,
  hasVerifiedDashboardUrl,
  signozInstanceUrl,
} from "../integrations/signozConfig";
import { probeSignozMcp } from "../integrations/signozMcpAuditor";

export interface DemoReadiness {
  ready: boolean;
  checkedAt: string;
  api: "READY" | "UNAVAILABLE";
  llm: "READY" | "UNAVAILABLE";
  signozUi: "READY" | "UNAVAILABLE";
  signozMcp: "READY" | "UNAUTHORIZED" | "UNAVAILABLE";
  dashboard: "VERIFIED" | "UNVERIFIED";
  alerts: "VERIFIED" | "UNVERIFIED";
  canonicalFixture: "VERIFIED" | "INVALID";
}

export async function getDemoReadiness(): Promise<DemoReadiness> {
  const [signozUi, signozMcp] = await Promise.all([
    probeHttp(signozInstanceUrl()),
    probeSignozMcp(),
  ]);
  const fixture = configuredSnapshots[0];
  const canonicalFixture =
    fixture?.snapshotId === "snapshot-001" &&
    fixture.symbol === "INFY" &&
    fixture.currentPrice === 1684.5
      ? "VERIFIED"
      : "INVALID";
  const llm =
    process.env.LLM_API_KEY &&
    process.env.LLM_BASE_URL &&
    process.env.LLM_MODEL
      ? "READY"
      : "UNAVAILABLE";
  const dashboard = hasVerifiedDashboardUrl() ? "VERIFIED" : "UNVERIFIED";
  const alerts = hasVerifiedAlertUrls() ? "VERIFIED" : "UNVERIFIED";

  return {
    ready:
      llm === "READY" &&
      signozUi === "READY" &&
      signozMcp === "READY" &&
      dashboard === "VERIFIED" &&
      alerts === "VERIFIED" &&
      canonicalFixture === "VERIFIED",
    checkedAt: new Date().toISOString(),
    api: "READY",
    llm,
    signozUi,
    signozMcp,
    dashboard,
    alerts,
    canonicalFixture,
  };
}

async function probeHttp(url: string): Promise<"READY" | "UNAVAILABLE"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok ? "READY" : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  } finally {
    clearTimeout(timeout);
  }
}
