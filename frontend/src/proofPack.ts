import { loadProofPack } from "./api";

export async function downloadProofPack(sessionId: string): Promise<void> {
  const proofPack = await loadProofPack(sessionId);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(proofPack, null, 2)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `traceroom-proof-${sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
