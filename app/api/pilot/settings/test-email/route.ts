import { NextResponse } from "next/server";
import { DATA_SOURCE } from "@/lib/config";
import { HttpError, caller, requireOps } from "@/lib/server/http";
import { getMailer, pilotEnv } from "@/lib/pilot/mail";
import { effectiveSettings } from "@/lib/pilot/settings";
import { isEmail } from "@/lib/pilot/settingsShared";
import { getPilotStore } from "@/lib/pilot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Staff only: send a plain test message from the saved sender to an address the admin types, so a wrong
 * sender or mail login shows up here and not on a real shareholder's submission.
 */
export async function POST(req: Request) {
  try {
    if (DATA_SOURCE === "firebase") requireOps(await caller(req));
    const to = String(((await req.json().catch(() => ({}))) as { to?: unknown }).to ?? "").trim();
    if (!isEmail(to)) throw new HttpError(400, "Type the email address to send the test to.");
    const s = effectiveSettings(await (await getPilotStore()).getSettings());
    const env = pilotEnv(s);
    try {
      await getMailer().send({
        from: env.from, to, replyTo: env.replyTo || undefined,
        subject: `Test email from ${s.brandName}`,
        text: `This is a test from the ${s.brandName} pilot settings page.\n\nIf you can read this, emails sent from ${env.from} are getting through.\nReplies will go to ${env.replyTo || "the sender"}.`,
        html: `<p>This is a test from the <b>${s.brandName.replace(/[<>&]/g, "")}</b> pilot settings page.</p><p>If you can read this, emails sent from this address are getting through. Replies will go to ${(env.replyTo || "the sender").replace(/[<>&]/g, "")}.</p>`,
      });
    } catch (e) {
      console.error("[pilot] test email failed", e);
      throw new HttpError(502, `The email didn't go. The mail server said: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}. Check that the sending email matches your mail login.`);
    }
    return NextResponse.json({ ok: true, from: env.from, to });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[pilot] test email route failed", e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
