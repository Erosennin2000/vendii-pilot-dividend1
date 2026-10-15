import "server-only";
import { naira } from "@/lib/domain/fees";
import { PILOT_BRAND, PAY_AHEAD_PER_COMPANY, pilotRegistrar } from "./config";
import type { PilotSubmission } from "./types";

export interface MailAttachment { filename: string; content: Uint8Array; contentType: string }
export interface MailMessage {
  from: string;
  to: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}
export interface Mailer { send(m: MailMessage): Promise<{ messageId?: string }> }

/** All pilot settings that come from the environment, read at call time so tests and Vercel both work. */
export function pilotEnv() {
  const e = process.env;
  const mode: "test" | "live" = e.PILOT_MODE === "live" ? "live" : "test"; // anything else is test: nothing reaches a registrar by accident
  const admin = (e.PILOT_ADMIN_EMAIL ?? "").trim();
  return {
    mode,
    from: e.MAIL_FROM?.trim() || `${PILOT_BRAND} <dami@dividendii.com>`,
    admin,
    /** In test mode every registrar email lands here instead. */
    testInbox: (e.PILOT_TEST_EMAIL ?? admin).trim(),
    replyTo: (e.PILOT_REPLY_TO ?? admin).trim(),
    pay: {
      bank: e.PILOT_PAY_BANK?.trim() || "",
      accountName: e.PILOT_PAY_ACCOUNT_NAME?.trim() || "",
      accountNumber: e.PILOT_PAY_ACCOUNT_NUMBER?.trim() || "",
    },
  };
}

let override: Mailer | null = null;
/** Tests hand in a fake mailer. */
export const setMailerForTests = (m: Mailer | null) => { override = m; };

/** SMTP through nodemailer. With no SMTP_HOST, local dev just logs the message; a production deployment fails loudly. */
export function getMailer(): Mailer {
  if (override) return override;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    if (process.env.NODE_ENV !== "production") {
      return {
        async send(m) {
          console.log(`[pilot mail, not delivered: SMTP_HOST is not set] to=${m.to} subject="${m.subject}" attachments=${(m.attachments ?? []).map((a) => a.filename).join(", ")}`);
          return { messageId: "dev-not-delivered" };
        },
      };
    }
    throw Object.assign(new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS."), { code: "config/smtp" });
  }
  return {
    async send(m) {
      const nodemailer = await import("nodemailer");
      const port = Number(process.env.SMTP_PORT ?? 587);
      const transport = nodemailer.createTransport({
        host, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      const info = await transport.sendMail({
        from: m.from, to: m.to, bcc: m.bcc, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html,
        attachments: (m.attachments ?? []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
      });
      return { messageId: info.messageId };
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fullName = (s: PilotSubmission) => [s.profile.firstName, s.profile.otherNames, s.profile.surname].filter((x) => x.trim()).join(" ");

function shell(body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1c2330;max-width:620px">${body}</div>`;
}

/** The email a registrar receives: the shareholder's details and holdings in the body, mandate form and authority letter attached. */
export function registrarEmail(s: PilotSubmission, registrarId: string): Pick<MailMessage, "subject" | "text" | "html"> {
  const reg = pilotRegistrar(registrarId)!;
  const form = s.forms.find((f) => f.registrarId === registrarId);
  const companies = s.holdings.filter((h) => h.registrarId === registrarId).map((h) => h.company);
  const name = fullName(s);
  const a = s.atPurchase;
  const kin = [a.nextOfKinName, a.nextOfKinRelationship && `(${a.nextOfKinRelationship})`, a.nextOfKinPhone].filter(Boolean).join(" ");
  const byHand = form?.unlisted ?? [];

  const subject = `E-dividend mandate and letter of authority: ${s.profile.surname.toUpperCase()} ${s.profile.firstName} (${companies.length} ${companies.length === 1 ? "holding" : "holdings"}) [${s.ref}]`;

  const lines = [
    `Dear ${reg.name},`,
    ``,
    `${PILOT_BRAND} is sending this on behalf of ${name.toUpperCase()}, who holds shares in the companies below on your register.`,
    ``,
    `Attached:`,
    `1. The completed e-dividend mandate form, with passport photograph and signature.`,
    `2. A letter of authority signed by the shareholder, authorising ${PILOT_BRAND} to submit the mandate and correspond with you for these holdings only. Payment is to go directly to the shareholder's bank account.`,
    ``,
    `Holdings:`,
    ...companies.map((c, i) => `${i + 1}. ${c}`),
    ...((s.variants ?? []).length ? [``, `The name may appear on your register as: ${(s.variants ?? []).join("; ")}.`] : []),
    ...(byHand.length ? [``, `Not printed on your form, please note by hand: ${byHand.join("; ")}.`] : []),
    ``,
    `Details when the shares were bought, to help you find the holding:`,
    `Address: ${a.address}`,
    ...(a.phone ? [`Phone: ${a.phone}`] : []),
    `Next of kin: ${kin}`,
    ``,
    `Current contact: ${s.profile.phone1}, ${s.profile.email}`,
    ``,
    `Please reply to this email quoting ${s.ref}, or confirm which further documents you need.`,
    ``,
    `${PILOT_BRAND}`,
  ];
  const html = shell(
    `<p>Dear ${esc(reg.name)},</p>` +
    `<p>${esc(PILOT_BRAND)} is sending this on behalf of <b>${esc(name.toUpperCase())}</b>, who holds shares in the companies below on your register.</p>` +
    `<p><b>Attached</b></p><ol><li>The completed e-dividend mandate form, with passport photograph and signature.</li>` +
    `<li>A letter of authority signed by the shareholder, authorising ${esc(PILOT_BRAND)} to submit the mandate and correspond with you for these holdings only. Payment is to go directly to the shareholder's bank account.</li></ol>` +
    `<p><b>Holdings</b></p><ol>${companies.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>` +
    ((s.variants ?? []).length ? `<p><b>The name may appear on your register as:</b> ${esc((s.variants ?? []).join("; "))}.</p>` : "") +
    (byHand.length ? `<p><b>Not printed on your form, please note by hand:</b> ${esc(byHand.join("; "))}.</p>` : "") +
    `<p><b>Details when the shares were bought</b>, to help you find the holding:<br>Address: ${esc(a.address)}<br>` +
    (a.phone ? `Phone: ${esc(a.phone)}<br>` : "") + `Next of kin: ${esc(kin)}</p>` +
    `<p>Current contact: ${esc(s.profile.phone1)}, ${esc(s.profile.email)}</p>` +
    `<p>Please reply to this email quoting <b>${esc(s.ref)}</b>, or tell us which further documents you need.</p><p>${esc(PILOT_BRAND)}</p>`,
  );
  return { subject, text: lines.join("\n"), html };
}

function paymentLines(s: PilotSubmission) {
  const env = pilotEnv();
  if (s.payment.method === "pay_ahead") {
    const bits = [`Pay ahead: ${naira(s.payment.amountDue)} (${naira(PAY_AHEAD_PER_COMPANY)} for each of ${s.holdings.length} ${s.holdings.length === 1 ? "company" : "companies"}).`];
    if (env.pay.accountNumber) bits.push(`Transfer to ${env.pay.accountName || PILOT_BRAND}, ${env.pay.bank}, account ${env.pay.accountNumber}. Use ${s.ref} as the reference.`);
    else bits.push(`We'll send you our account details shortly. Use ${s.ref} as the reference.`);
    return bits;
  }
  return [`Direct debit after payment: nothing now. We take 10% of any dividend that actually reaches your account, and tell you the exact amount before each debit.`];
}

/** What the shareholder gets: a receipt of what was sent, where, and what happens next. No BVN, no attachments. */
export function confirmationEmail(s: PilotSubmission): Pick<MailMessage, "subject" | "text" | "html"> {
  const byReg = [...new Set(s.holdings.map((h) => h.registrar))].map((r) => ({ r, items: s.holdings.filter((h) => h.registrar === r).map((h) => h.company) }));
  const pay = paymentLines(s);
  const subject = `We've sent your dividend forms (${s.ref})`;
  const text = [
    `Hello ${s.profile.firstName},`,
    ``,
    `We've sent your e-dividend mandate form and a signed letter of authority to the registrars below. Your reference is ${s.ref}.`,
    ``,
    ...byReg.flatMap(({ r, items }) => [r, ...items.map((c) => `  - ${c}`), ``]),
    `What happens next: the registrar checks its records and replies to us. We chase them and tell you when anything changes. Any dividend is paid by the registrar straight into your account ending ${s.profile.accountNumber.slice(-4)}.`,
    ``,
    ...pay,
    ``,
    `Questions? Reply to this email and quote ${s.ref}.`,
    ``,
    PILOT_BRAND,
  ].join("\n");
  const html = shell(
    `<p>Hello ${esc(s.profile.firstName)},</p>` +
    `<p>We've sent your e-dividend mandate form and a signed letter of authority to the registrars below. Your reference is <b>${esc(s.ref)}</b>.</p>` +
    byReg.map(({ r, items }) => `<p><b>${esc(r)}</b></p><ul>${items.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`).join("") +
    `<p><b>What happens next:</b> the registrar checks its records and replies to us. We chase them and tell you when anything changes. Any dividend is paid by the registrar straight into your account ending ${esc(s.profile.accountNumber.slice(-4))}.</p>` +
    pay.map((l) => `<p>${esc(l)}</p>`).join("") +
    `<p>Questions? Reply to this email and quote ${esc(s.ref)}.</p><p>${esc(PILOT_BRAND)}</p>`,
  );
  return { subject, text, html };
}

export { paymentLines };


/** A follow-up to a registrar about a submission already sent. Staff can add a line of their own. */
export function chaseEmail(s: PilotSubmission, registrarId: string, extra = ""): Pick<MailMessage, "subject" | "text" | "html"> {
  const reg = pilotRegistrar(registrarId)!;
  const companies = s.holdings.filter((h) => h.registrarId === registrarId).map((h) => h.company);
  const sentAt = [...s.emails].reverse().find((e) => e.kind === "registrar" && e.registrarId === registrarId && e.status === "sent")?.at ?? s.createdAt;
  const day = new Date(sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
  const name = fullName(s).toUpperCase();
  const subject = `Follow-up: e-dividend mandate for ${s.profile.surname.toUpperCase()} ${s.profile.firstName} (${companies.length} ${companies.length === 1 ? "holding" : "holdings"}) [${s.ref}]`;
  const note = extra.trim();
  const text = [
    `Dear ${reg.name},`, ``,
    `We wrote on ${day} on behalf of ${name}, reference ${s.ref}, enclosing the e-dividend mandate form and a signed letter of authority. We have not yet had a reply, so we are following up. The documents are attached again.`,
    ``, `Holdings (${companies.length}):`, ...companies.map((c, i) => `${i + 1}. ${c}`),
    ...(note ? [``, note] : []),
    ``, `Please confirm that the mandate has been received and updated, or tell us what else you need.`, ``, PILOT_BRAND,
  ].join("\n");
  const html = shell(
    `<p>Dear ${esc(reg.name)},</p>` +
    `<p>We wrote on ${esc(day)} on behalf of <b>${esc(name)}</b>, reference <b>${esc(s.ref)}</b>, enclosing the e-dividend mandate form and a signed letter of authority. We have not yet had a reply, so we are following up. The documents are attached again.</p>` +
    `<p><b>Holdings (${companies.length})</b></p><ol>${companies.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>` +
    (note ? `<p>${esc(note)}</p>` : "") +
    `<p>Please confirm that the mandate has been received and updated, or tell us what else you need.</p><p>${esc(PILOT_BRAND)}</p>`,
  );
  return { subject, text, html };
}
