import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type EmailMessage = { email: string; subject: string; text: string };
export type EmailDelivery = (message: EmailMessage) => Promise<void>;
export type AuthLinkDelivery = (message: { email: string; url: string }) => Promise<void>;

export async function deliverEmail(message: EmailMessage) {
  if (process.env.AUTH_EMAIL_FROM && process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM,
        to: [message.email],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) throw new Error("Email could not be delivered.");
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured.");
  const directory = path.join(process.cwd(), "data", "auth");
  await mkdir(directory, { recursive: true });
  await appendFile(
    path.join(directory, "outbox.jsonl"),
    `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}

export const deliverAuthLink: AuthLinkDelivery = async ({ email, url }) => {
  await deliverEmail({
    email,
    subject: "Sign in to Thesis Forge",
    text: `Your sign-in link expires in 10 minutes:\n\n${url}`,
  });
};

