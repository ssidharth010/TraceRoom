const apiPort = process.env.PORT ?? "8787";
const healthUrl =
  process.env.TRACEROOM_API_HEALTH_URL ??
  `http://127.0.0.1:${apiPort}/health`;
const timeoutMs = 30_000;
const retryDelayMs = 100;
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      const health = await response.json();
      if (health.revision === "configured-snapshots-v1") {
        process.exit(0);
      }

      console.error(
        "An older TraceRoom API is already running on this port. Stop it, then restart npm run dev.",
      );
      process.exit(1);
    }
  } catch {
    // The API process is still starting.
  }

  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
}

console.error(`TraceRoom API did not become ready at ${healthUrl}.`);
process.exit(1);
