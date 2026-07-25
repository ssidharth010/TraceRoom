import "dotenv/config";

export const REQUIRED_ALERT_NAMES = [
  "TraceRoom / Evidence Integrity Block",
  "TraceRoom / Uncontrolled Agent Failure",
  "TraceRoom / Session Cost Threshold",
] as const;

export function signozInstanceUrl(): string {
  return (
    process.env.SIGNOZ_INSTANCE_URL ??
    process.env.SIGNOZ_BASE_URL ??
    "http://localhost:8080"
  ).replace(/\/+$/, "");
}

export function signozDashboardUrl(): string {
  return (
    process.env.SIGNOZ_DASHBOARD_URL ??
    `${signozInstanceUrl()}/dashboard`
  );
}

export function signozAlertUrls(): string[] {
  return (process.env.SIGNOZ_ALERT_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function hasVerifiedDashboardUrl(): boolean {
  return Boolean(process.env.SIGNOZ_DASHBOARD_URL?.trim());
}

export function hasVerifiedAlertUrls(): boolean {
  return signozAlertUrls().length >= REQUIRED_ALERT_NAMES.length;
}
