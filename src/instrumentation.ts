// Runs once at server startup — kicks off the 5-minute transcode sweep.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTranscodeTimer } = await import("./lib/transcode");
    startTranscodeTimer();
  }
}
