import { runDebateSession } from "./session/runDebateSession";
import { resolveSessionScenario } from "./scenarios/runScenario";
import { telemetrySdk } from "./telemetry/tracing";

console.log("TraceRoom INFY debate session starting...");

try {
  const session = await runDebateSession(resolveSessionScenario());
  console.log(JSON.stringify(session, null, 2));
} catch (error) {
  console.error("Error running debate session:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  try {
    await telemetrySdk.shutdown();
    console.log("Telemetry SDK shutdown complete");
  } catch (error) {
    console.warn("Telemetry SDK shutdown failed after the debate run.");
    if (error instanceof Error) {
      console.warn(error.message);
    }
  }
}
