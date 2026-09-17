// Runs once when the Next.js server starts.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const { recoverInterruptedJobs } = await import("@/lib/pipeline");
  await recoverInterruptedJobs().catch((error) => console.error("[startup] recovery failed:", error));
}
