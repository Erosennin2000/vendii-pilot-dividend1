import "server-only";
import { randomBytes } from "node:crypto";
import { dataUrlBytes, fillForms } from "@/lib/forms/fill";
import type { FormProfile } from "@/lib/forms/types";
import { buildAuthorityLetter } from "./authority";
import { PAY_AHEAD_PER_COMPANY, PILOT_REGISTRARS, pilotRegistrar, type PilotRegistrarId } from "./config";
import { confirmationEmail, pilotEnv, registrarEmail, type Mailer } from "./mail";
import type { PilotStore } from "./store";
import { pdfSafe } from "./text";
import type { EmailRecord, PilotInput, PilotSubmission, SendStatus, StoredFile } from "./types";

export interface Deps {
  store: PilotStore;
  mailer: Mailer;
  now?: () => Date;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function newRef(): string {
  const b = randomBytes(6);
  return "DVD-" + [...b].map((x) => ALPHABET[x % ALPHABET.length]).join("");
}

function safeProfile(p: FormProfile): FormProfile {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, pdfSafe(String(v ?? ""))])) as unknown as FormProfile;
}

export function sendStatusOf(s: Pick<PilotSubmission, "holdings" | "emails">): SendStatus {
  const ids = [...new Set(s.holdings.map((h) => h.registrarId))];
  const ok = ids.filter((id) => {
    const last = [...s.emails].reverse().find((e) => e.kind === "registrar" && e.registrarId === id);
    return last?.status === "sent";
  });
  return ok.length === ids.length ? "sent" : ok.length ? "partial" : "failed";
}

/** Sends one registrar's email with its two PDFs. Never throws: the outcome is the record. */
async function sendToRegistrar(sub: PilotSubmission, registrarId: PilotRegistrarId, deps: Deps): Promise<EmailRecord> {
  const env = pilotEnv();
  const reg = pilotRegistrar(registrarId)!;
  const at = (deps.now?.() ?? new Date()).toISOString();
  const live = sub.mode === "live";
  const to = live ? reg.email : env.testInbox;
  const base: EmailRecord = { kind: "registrar", registrarId, to, status: "failed", at, ...(live ? {} : { wouldHaveGoneTo: reg.email }) };
  try {
    if (!to) throw new Error("PILOT_TEST_EMAIL (or PILOT_ADMIN_EMAIL) is not set, so there is nowhere to send test emails.");
    const files = sub.files.filter((f) => f.registrarId === registrarId);
    const attachments = [];
    for (const f of files) attachments.push({ filename: f.filename, content: await deps.store.readFile(f.path), contentType: "application/pdf" });
    const body = registrarEmail(sub, registrarId);
    const banner = live ? "" : `TEST MODE: this would have gone to ${reg.email}. It was sent to ${to} instead.\n\n`;
    const res = await deps.mailer.send({
      from: env.from, to,
      bcc: live && env.admin && env.admin !== to ? env.admin : undefined,
      replyTo: env.replyTo || undefined,
      subject: (live ? "" : `[TEST, would go to ${reg.email}] `) + body.subject,
      text: banner + body.text,
      html: (live ? "" : `<p style="background:#fff4d6;padding:8px 12px;border-radius:6px"><b>TEST MODE:</b> this would have gone to ${reg.email}. It was sent to ${to} instead.</p>`) + body.html,
      attachments,
    });
    return { ...base, status: "sent", messageId: res.messageId };
  } catch (e) {
    console.error("[pilot] registrar email failed", sub.ref, registrarId, e);
    return { ...base, status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Send failed." };
  }
}

async function sendConfirmation(sub: PilotSubmission, deps: Deps): Promise<EmailRecord> {
  const env = pilotEnv();
  const at = (deps.now?.() ?? new Date()).toISOString();
  const base: EmailRecord = { kind: "confirmation", to: sub.profile.email, status: "failed", at };
  try {
    const body = confirmationEmail(sub);
    const res = await deps.mailer.send({ from: env.from, to: sub.profile.email, replyTo: env.replyTo || undefined, ...body });
    return { ...base, status: "sent", messageId: res.messageId };
  } catch (e) {
    console.error("[pilot] confirmation email failed", sub.ref, e);
    return { ...base, status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Send failed." };
  }
}

/**
 * The whole pilot submission: fill each registrar's form, write the authority letter, save the record,
 * email each registrar, email the shareholder. The record is saved before anything is sent, so a failed
 * email shows up in the admin page and can be retried.
 */
export async function submitPilot(input: PilotInput, deps: Deps): Promise<PilotSubmission> {
  const env = pilotEnv();
  const now = deps.now?.() ?? new Date();
  const id = randomBytes(12).toString("hex");
  const ref = newRef();
  const profile = safeProfile(input.profile);
  const at = {
    address: pdfSafe(input.atPurchase.address), phone: pdfSafe(input.atPurchase.phone),
    nextOfKinName: pdfSafe(input.atPurchase.nextOfKinName), nextOfKinRelationship: pdfSafe(input.atPurchase.nextOfKinRelationship),
    nextOfKinPhone: pdfSafe(input.atPurchase.nextOfKinPhone),
  };
  const photo = dataUrlBytes(input.photo);
  const signature = dataUrlBytes(input.signature);

  const registrarIds = PILOT_REGISTRARS.map((r) => r.id).filter((rid) => input.holdings.some((h) => h.registrarId === rid));
  const files: StoredFile[] = [];
  const blobs: { path: string; bytes: Uint8Array; contentType: string }[] = [];
  const forms: PilotSubmission["forms"] = [];
  for (const rid of registrarIds) {
    const reg = pilotRegistrar(rid)!;
    const companies = input.holdings.filter((h) => h.registrarId === rid).map((h) => h.company);
    const { pdf, forms: filled } = await fillForms(profile, companies.map((company) => ({ registrarId: rid, company })), { photo, signature });
    const authority = await buildAuthorityLetter({ registrar: reg.name, ref, profile, atPurchase: at, companies, signature, replyTo: env.replyTo, now });
    const mandateName = `Mandate-${reg.name.split(" ")[0]}-${ref}.pdf`;
    const authorityName = `Letter-of-authority-${reg.name.split(" ")[0]}-${ref}.pdf`;
    for (const [kind, filename, bytes] of [["mandate", mandateName, pdf], ["authority", authorityName, authority]] as const) {
      const path = `pilot-submissions/${id}/${filename}`;
      files.push({ name: `${kind}-${rid}`, registrarId: rid, kind, path, filename });
      blobs.push({ path, bytes, contentType: "application/pdf" });
    }
    const f = filled[0];
    forms.push({ registrarId: rid, registrar: reg.name, ticked: f.ticked, unlisted: f.unlisted, warnings: f.warnings.map((w) => w.message) });
  }

  const n = input.holdings.length;
  const sub: PilotSubmission = {
    id, ref, createdAt: now.toISOString(), mode: env.mode,
    profile: input.profile, atPurchase: input.atPurchase, // the originals, exactly as typed
    holdings: input.holdings.map((h) => ({ ...h, registrar: pilotRegistrar(h.registrarId)!.name })),
    forms,
    payment: input.payment.method === "pay_ahead"
      ? { method: "pay_ahead", amountDue: n * PAY_AHEAD_PER_COMPANY, status: "awaiting_payment", paidAt: null }
      : { method: "debit_after", amountDue: 0, status: "debit_pending", paidAt: null },
    consentAt: now.toISOString(),
    files, emails: [], sendStatus: "failed", note: "",
  };
  await deps.store.save(sub, blobs);

  // Registrar emails read their PDFs back from the store: the same path a later "resend" takes.
  for (const rid of registrarIds) sub.emails.push(await sendToRegistrar(sub, rid, deps));
  sub.sendStatus = sendStatusOf(sub);
  if (sub.sendStatus !== "failed") sub.emails.push(await sendConfirmation(sub, deps));
  await deps.store.update(id, { emails: sub.emails, sendStatus: sub.sendStatus });
  return sub;
}

/** Admin retry. With no registrar named, resends every registrar whose latest email failed. */
export async function resendPilot(id: string, registrarId: string | null, deps: Deps): Promise<PilotSubmission> {
  const sub = await deps.store.get(id);
  if (!sub) throw new Error("Submission not found.");
  const ids = [...new Set(sub.holdings.map((h) => h.registrarId))];
  const targets = registrarId
    ? ids.filter((r) => r === registrarId)
    : ids.filter((r) => [...sub.emails].reverse().find((e) => e.kind === "registrar" && e.registrarId === r)?.status !== "sent");
  if (!targets.length) throw new Error(registrarId ? "That registrar isn't on this submission." : "Every email went through. Pick a registrar to send it again.");
  for (const rid of targets) sub.emails.push(await sendToRegistrar(sub, rid, deps));
  sub.sendStatus = sendStatusOf(sub);
  const hadConfirmation = sub.emails.some((e) => e.kind === "confirmation" && e.status === "sent");
  if (sub.sendStatus !== "failed" && !hadConfirmation) sub.emails.push(await sendConfirmation(sub, deps));
  await deps.store.update(id, { emails: sub.emails, sendStatus: sub.sendStatus });
  return sub;
}
