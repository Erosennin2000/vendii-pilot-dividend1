import { isEmail, isElevenDigits, isNuban } from "@/lib/domain/validation";
import { normalizeNgPhone } from "@/lib/domain/phone";
import type { FormProfile } from "@/lib/forms/types";
import { MAX_COMPANIES, PILOT_COMPANIES, pilotRegistrar, type PilotRegistrarId } from "./config";
import { clean } from "./text";
import type { PilotInput } from "./types";

export class PilotValidationError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
  }
}

const PROFILE_KEYS: (keyof FormProfile)[] = ["surname", "firstName", "otherNames", "bvn", "bankName", "accountNumber", "address", "city", "state", "country", "previousAddress", "chn", "phone1", "phone2", "email"];

/** Plain-language list of what is still missing or wrong. Used by the form (to explain a disabled button) and by the server. */
export function pilotProblems(i: PilotInput): string[] {
  const p: string[] = [];
  const has = (s: string) => !!s?.trim();
  if (!i.holdings.length) p.push("add at least one company");
  if (i.holdings.length > MAX_COMPANIES) p.push(`add no more than ${MAX_COMPANIES} companies`);
  if (!has(i.profile.surname)) p.push("your surname");
  if (!has(i.profile.firstName)) p.push("your first name");
  if (!isElevenDigits(i.profile.bvn)) p.push("your 11-digit BVN");
  if (!has(i.profile.bankName)) p.push("your bank");
  if (!isNuban(i.profile.accountNumber)) p.push("your 10-digit account number");
  if (!has(i.profile.address)) p.push("your current address");
  if (!has(i.profile.city) || !has(i.profile.state)) p.push("your city and state");
  if (!normalizeNgPhone(i.profile.phone1)) p.push("a Nigerian mobile number");
  if (!isEmail(i.profile.email)) p.push("a valid email address");
  if (!has(i.atPurchase.address)) p.push("your address when you bought the shares");
  if (!has(i.atPurchase.nextOfKinName)) p.push("your next of kin when you bought the shares");
  if (!i.photo) p.push("a passport photo");
  if (!i.signature) p.push("your signature");
  if (!i.payment.method) p.push("how you'd like to pay");
  else if (!i.payment.acknowledged) p.push("a tick to confirm the payment terms");
  if (!i.consent) p.push("a tick to authorise us to send your forms");
  return p;
}

/** Server side: take untrusted JSON, return a clean PilotInput or throw with every problem listed. */
export function parsePilotInput(raw: unknown): PilotInput {
  const b = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rp = (b.profile ?? {}) as Record<string, unknown>;
  const profile = Object.fromEntries(PROFILE_KEYS.map((k) => [k, clean(rp[k], k === "address" || k === "previousAddress" ? 300 : 120)])) as unknown as FormProfile;
  profile.bvn = profile.bvn.replace(/\D/g, "");
  profile.accountNumber = profile.accountNumber.replace(/\D/g, "");
  profile.email = profile.email.toLowerCase();
  profile.chn = profile.chn.toUpperCase().replace(/\s/g, "");
  profile.country ||= "Nigeria";
  const phone = normalizeNgPhone(profile.phone1);
  if (phone) profile.phone1 = phone;

  const ap = (b.atPurchase ?? {}) as Record<string, unknown>;
  const atPurchase = {
    address: clean(ap.address, 300),
    phone: clean(ap.phone, 40),
    nextOfKinName: clean(ap.nextOfKinName, 120),
    nextOfKinRelationship: clean(ap.nextOfKinRelationship, 60),
    nextOfKinPhone: clean(ap.nextOfKinPhone, 40),
  };
  // The registrar forms have one "previous address" box. The address at purchase is what the register holds.
  profile.previousAddress = atPurchase.address;

  const holdings: PilotInput["holdings"] = [];
  const problems: string[] = [];
  for (const h of Array.isArray(b.holdings) ? b.holdings.slice(0, MAX_COMPANIES + 1) : []) {
    const registrarId = String(h?.registrarId ?? "");
    const company = String(h?.company ?? "");
    if (!pilotRegistrar(registrarId)) { problems.push(`${registrarId || "That registrar"} isn't part of the pilot.`); continue; }
    // Only names printed on the form's own list are accepted, so nothing arbitrary reaches a registrar.
    const listed = PILOT_COMPANIES.find((c) => c.registrarId === registrarId && c.company === company);
    if (!listed) { problems.push(`${company.slice(0, 80) || "That company"} isn't covered in the pilot.`); continue; }
    if (!holdings.some((x) => x.registrarId === registrarId && x.company === company)) holdings.push({ registrarId: registrarId as PilotRegistrarId, company });
  }

  const pay = (b.payment ?? {}) as Record<string, unknown>;
  const method = pay.method === "pay_ahead" ? "pay_ahead" : pay.method === "debit_after" ? "debit_after" : null;
  const dataUrl = (v: unknown, max: number) => (typeof v === "string" && /^data:image\/(png|jpe?g);base64,/.test(v) && v.length < max ? v : null);

  const input: PilotInput = {
    profile, atPurchase, holdings,
    photo: dataUrl(b.photo, 8_000_000),
    signature: dataUrl(b.signature, 3_000_000),
    payment: { method: (method ?? "debit_after") as PilotInput["payment"]["method"], acknowledged: pay.acknowledged === true },
    consent: b.consent === true,
    website: typeof b.website === "string" ? b.website : "",
  };
  if (!method) problems.push("Choose how you'd like to pay.");
  const missing = pilotProblems(input);
  if (missing.length || problems.length) {
    throw new PilotValidationError([...problems, ...(missing.length ? [`Still needed: ${missing.join(", ")}.`] : [])]);
  }
  return input;
}
