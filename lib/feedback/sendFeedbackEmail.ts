// lib/feedback/sendFeedbackEmail.ts
// Best-effort notification only. The feedback row in the database is the
// record of truth -- this never blocks or fails a feedback submission.
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FEEDBACK_TO = "admin@life-cfo.com";
const FEEDBACK_FROM = "Life CFO Feedback <noreply@life-cfo.com>";

export async function sendFeedbackEmail(params: { email: string | null; path: string; message: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: FEEDBACK_TO,
        subject: `Life CFO beta feedback — ${params.path}`,
        text: `From: ${params.email ?? "unknown user"}\nPage: ${params.path}\n\n${params.message}`,
      }),
    });
  } catch {
    // Swallow -- a failed notification should never surface as a failed feedback submission.
  }
}
