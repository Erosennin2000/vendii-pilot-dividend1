import { NextResponse } from "next/server";
import { getMailer } from "@/lib/pilot/mail";
import { tooMany } from "@/lib/pilot/rateLimit";
import { getPilotStore } from "@/lib/pilot/store";
import { submitPilot } from "@/lib/pilot/submit";
import { verifyToken } from "@/lib/pilot/token";
import { PilotValidationError, parsePilotInput } from "@/lib/pilot/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public, but needs the token from the email check. Validates, fills the forms, saves the record, emails the registrars
 * and the shareholder. Replies with the reference and how it went, never with the shareholder's details.
 */
export async function POST(req: Request) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    if (tooMany(ip)) return NextResponse.json({ error: "Too many submissions from this connection. Try again in an hour." }, { status: 429 });

    const raw = await req.json().catch(() => null);
    // The hidden "website" box is for bots. Pretend it worked and do nothing.
    if (raw && typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ ref: "DVD-000000", sendStatus: "sent", payment: { method: "debit_after", amountDue: 0 } });

    // Step 1's email check must have passed. The token says which lead, and the email on the forms is theirs.
    const who = verifyToken(raw?.token);
    if (!who) return NextResponse.json({ error: "Please confirm your email again to continue." }, { status: 401 });
    const input = parsePilotInput({ ...raw, profile: { ...(raw?.profile ?? {}), email: who.email } });
    const sub = await submitPilot(input, { store: await getPilotStore(), mailer: getMailer(), leadId: who.leadId });
    return NextResponse.json({
      ref: sub.ref,
      sendStatus: sub.sendStatus,
      mode: sub.mode,
      registrars: [...new Set(sub.holdings.map((h) => h.registrar))],
      companyCount: sub.holdings.length,
      byHand: sub.forms.flatMap((f) => f.unlisted),
      payment: { method: sub.payment.method, amountDue: sub.payment.amountDue },
    });
  } catch (e) {
    if (e instanceof PilotValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[pilot] submit failed", e);
    return NextResponse.json({ error: "Something went wrong on our side. Nothing was sent. Try again in a minute." }, { status: 500 });
  }
}
