"use client";

import { useMemo, useState } from "react";
import { Check, SelectField, TextField } from "@/components/Field";
import { FileDrop } from "@/components/FileDrop";
import { SignaturePad } from "@/components/SignaturePad";
import { PhotoIcon } from "@/components/icons";
import { naira } from "@/lib/domain/fees";
import { emptyProfile } from "@/lib/forms/registry";
import type { FormProfile } from "@/lib/forms/types";
import { resizeImage } from "@/lib/image";
import { PAY_AHEAD_PER_COMPANY, PILOT_REGISTRARS, companiesFor, payAheadTotal, type PilotRegistrarId } from "@/lib/pilot/config";
import type { PaymentMethod, PilotInput } from "@/lib/pilot/types";
import { pilotProblems } from "@/lib/pilot/validate";
import { errorMessage } from "@/lib/util";

type Held = { registrarId: PilotRegistrarId; company: string };
interface Result {
  ref: string; sendStatus: "sent" | "partial" | "failed"; mode: "test" | "live";
  registrars: string[]; companyCount: number; byHand: string[]; payment: { method: PaymentMethod; amountDue: number };
}

const emptyAt = { address: "", phone: "", nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "" };

export default function PilotPage() {
  const [regName, setRegName] = useState("");
  const [company, setCompany] = useState("");
  const [held, setHeld] = useState<Held[]>([]);
  const [profile, setProfile] = useState<FormProfile>(emptyProfile());
  const [at, setAt] = useState(emptyAt);
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("debit_after");
  const [payAck, setPayAck] = useState(false);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const regId = PILOT_REGISTRARS.find((r) => r.name === regName)?.id ?? "";
  const options = useMemo(
    () => companiesFor(regId).map((c) => c.company).filter((c) => !held.some((h) => h.registrarId === regId && h.company === c)),
    [regId, held],
  );
  const byRegistrar = PILOT_REGISTRARS.map((r) => ({ r, items: held.filter((h) => h.registrarId === r.id) })).filter((g) => g.items.length);

  const set = (k: keyof FormProfile) => (v: string) => setProfile((p) => ({ ...p, [k]: v }));
  const digits = (k: keyof FormProfile, n: number) => (v: string) => set(k)(v.replace(/\D/g, "").slice(0, n));
  const setA = (k: keyof typeof emptyAt) => (v: string) => setAt((a) => ({ ...a, [k]: v }));

  function add() {
    if (!regId || !company) return;
    setHeld((h) => [...h, { registrarId: regId as PilotRegistrarId, company }]);
    setCompany("");
  }
  const remove = (h: Held) => setHeld((all) => all.filter((x) => !(x.registrarId === h.registrarId && x.company === h.company)));

  const input: PilotInput = { profile, atPurchase: at, holdings: held, photo, signature, payment: { method, acknowledged: payAck }, consent };
  const missing = pilotProblems(input);
  const total = payAheadTotal(held.length);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/pilot/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, website }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Couldn't submit (${res.status}).`);
      setResult(data as Result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) return <Done r={result} email={profile.email} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Claim your dividends from Coronation and First Registrars</h1>
          <p>Tell us which companies you hold shares in and give your details once. We fill the registrar&apos;s e-dividend mandate form, attach a letter of authority signed with your signature, and email both to the registrar for you.</p>
        </div>
      </div>

      <div className="two-col">
        <div className="stack">
          <section className="card">
            <h2>Where you hold shares</h2>
            <p className="tiny">The pilot covers Coronation Registrars and First Registrars only. Pick a registrar, pick a company, and press + to add it. Add as many as you hold.</p>
            <div className="field-row">
              <SelectField label="Registrar" value={regName} onChange={(v) => { setRegName(v); setCompany(""); }} options={PILOT_REGISTRARS.map((r) => r.name)} placeholder="Choose a registrar" />
              <SelectField label="Company" value={company} onChange={setCompany} options={options} placeholder={regId ? "Choose a company" : "Choose a registrar first"} />
            </div>
            <button type="button" className="btn" disabled={!regId || !company} onClick={add}>+ Add company</button>
            {byRegistrar.length > 0 && (
              <div className="stack" style={{ marginTop: 16 }}>
                {byRegistrar.map(({ r, items }) => (
                  <div key={r.id}>
                    <div className="tiny" style={{ fontWeight: 600 }}>{r.name}</div>
                    <div className="tags" style={{ marginTop: 6 }}>
                      {items.map((h) => (
                        <button key={h.company} type="button" className="tag navy" onClick={() => remove(h)} aria-label={`Remove ${h.company}`}>{h.company} &times;</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="tiny" style={{ marginTop: 12 }}>Not covered yet: companies on other registrars, and FBN Holdings (First Registrars&apos; form doesn&apos;t list it).</p>
          </section>

          <section className="card">
            <h2>Your details</h2>
            <p className="tiny">Exactly as your bank and the registrar hold them. Block capitals are added for you.</p>
            <div className="field-row three">
              <TextField label="Surname" value={profile.surname} onChange={set("surname")} autoComplete="family-name" />
              <TextField label="First name" value={profile.firstName} onChange={set("firstName")} autoComplete="given-name" />
              <TextField label="Other names" value={profile.otherNames} onChange={set("otherNames")} placeholder="Optional" autoComplete="additional-name" />
            </div>
            <div className="field-row three">
              <TextField label="BVN" value={profile.bvn} onChange={digits("bvn", 11)} inputMode="numeric" placeholder="11 digits" />
              <TextField label="Bank" value={profile.bankName} onChange={set("bankName")} placeholder="Guaranty Trust Bank" />
              <TextField label="Account number" value={profile.accountNumber} onChange={digits("accountNumber", 10)} inputMode="numeric" placeholder="10 digits" />
            </div>
            <TextField label="Home address now" value={profile.address} onChange={set("address")} placeholder="House number, street and area" autoComplete="street-address" />
            <div className="field-row three">
              <TextField label="City or town" value={profile.city} onChange={set("city")} autoComplete="address-level2" />
              <TextField label="State" value={profile.state} onChange={set("state")} autoComplete="address-level1" />
              <TextField label="Country" value={profile.country} onChange={set("country")} autoComplete="country-name" />
            </div>
            <div className="field-row three">
              <TextField label="CHN" value={profile.chn} onChange={(v) => set("chn")(v.toUpperCase().slice(0, 20))} placeholder="Optional" />
              <TextField label="Mobile number" value={profile.phone1} onChange={set("phone1")} type="tel" inputMode="tel" autoComplete="tel" />
              <TextField label="Email" value={profile.email} onChange={set("email")} type="email" inputMode="email" autoComplete="email" hint="We send your confirmation here." />
            </div>
          </section>

          <section className="card">
            <h2>When you bought the shares</h2>
            <p className="tiny">The register holds the details you gave back then. Giving them helps the registrar find you.</p>
            <TextField label="Your home address at that time" value={at.address} onChange={setA("address")} placeholder="House number, street, area and city" />
            <TextField label="Your phone number at that time" value={at.phone} onChange={setA("phone")} type="tel" inputMode="tel" placeholder="Optional, if you remember it" />
            <div className="field-row three">
              <TextField label="Next of kin at that time" value={at.nextOfKinName} onChange={setA("nextOfKinName")} placeholder="Full name" />
              <TextField label="Relationship" value={at.nextOfKinRelationship} onChange={setA("nextOfKinRelationship")} placeholder="e.g. Spouse, mother" />
              <TextField label="Their phone" value={at.nextOfKinPhone} onChange={setA("nextOfKinPhone")} type="tel" inputMode="tel" placeholder="Optional" />
            </div>
          </section>

          <section className="card">
            <h2>Photo and signature</h2>
            <FileDrop label="Passport photograph" accept="image/*" icon={<PhotoIcon />}
              hint="A clear, recent photo on a plain background. It goes in the passport box on the form."
              filledLabel={photo ? "Photo added. Tap to replace" : null} preview={photo}
              onFile={async (f) => setPhoto(await resizeImage(f))} />
            <div className="field" style={{ marginTop: 12 }}>
              <span className="label">Signature</span>
              <SignaturePad value={signature} onChange={setSignature} />
              <p className="tiny">Sign the way you signed when you bought the shares. It goes on the form and on your letter of authority.</p>
            </div>
          </section>

          <section className="card">
            <h2>How you&apos;d like to pay us</h2>
            <p className="tiny">Choose one. Either way, the registrar pays any dividend straight into your own account. We never hold your money.</p>
            <div className="stack">
              <PayOption on={method === "debit_after"} onPick={() => { setMethod("debit_after"); setPayAck(false); }}
                title="Direct debit after payment" price="10% of what you receive"
                body="Pay nothing now. When a registrar pays you, we take 10% of that payment by direct debit, and tell you the exact amount first. If nothing arrives, you owe nothing." />
              <PayOption on={method === "pay_ahead"} onPick={() => { setMethod("pay_ahead"); setPayAck(false); }}
                title="Pay ahead" price={held.length ? `${naira(total)} for ${held.length} ${held.length === 1 ? "company" : "companies"}` : `${naira(PAY_AHEAD_PER_COMPANY)} per company`}
                body={`A flat ${naira(PAY_AHEAD_PER_COMPANY)} for each company you add, paid by bank transfer once you submit. We send the account details on screen and by email. Nothing is taken from your dividends.`} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Check checked={payAck} onToggle={() => setPayAck((v) => !v)}>
                {method === "debit_after"
                  ? <><b>I agree to a variable direct debit.</b> Each debit is 10% of one payment I&apos;ve received, never more, and I&apos;ll be told the exact amount before it&apos;s taken.</>
                  : <><b>I&apos;ll pay {held.length ? naira(total) : `${naira(PAY_AHEAD_PER_COMPANY)} per company`} by bank transfer</b> using my reference.</>}
              </Check>
            </div>
          </section>

          <section className="card">
            <h2>Your go-ahead</h2>
            <Check checked={consent} onToggle={() => setConsent((v) => !v)}>
              <b>I authorise Dividendi to act for me on the companies listed.</b> That means filling my registrar mandate form, signing a letter of authority with the signature I drew, and emailing both, with my passport photo and the details above, to the registrar. The authority covers these holdings only. Dividendi can&apos;t sell or transfer my shares or receive my money.
            </Check>
            <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
          </section>
        </div>

        <aside className="card ledger" style={{ position: "sticky", top: 24 }}>
          <h3>Your submission</h3>
          {byRegistrar.length === 0 ? <p className="tiny">Add a company and it appears here.</p> : byRegistrar.map(({ r, items }) => (
            <div className="row" key={r.id}><span className="k">{r.name}</span><span className="v">{items.length} {items.length === 1 ? "company" : "companies"}</span></div>
          ))}
          <div className="row"><span className="k">Payment</span><span className="v">{method === "pay_ahead" ? naira(total) : "10% after"}</span></div>
          <button className="btn gold lg" style={{ width: "100%", marginTop: 16 }} disabled={busy || missing.length > 0} onClick={submit}>
            {busy ? <span className="spin" /> : "Send my forms"}
          </button>
          {missing.length > 0 && <p className="tiny" style={{ marginTop: 8 }}>Still needed: {missing.join(", ")}.</p>}
          {error && <div className="field-error">{error}</div>}
          <p className="tiny" style={{ marginTop: 12 }}>We email the registrar for you and send you a confirmation. Nothing is sent until you press the button.</p>
        </aside>
      </div>
    </>
  );
}

function PayOption({ on, onPick, title, price, body }: { on: boolean; onPick: () => void; title: string; price: string; body: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className="card"
      style={{ textAlign: "left", padding: "14px 16px", cursor: "pointer", borderColor: on ? "var(--navy)" : undefined, boxShadow: on ? "0 0 0 2px var(--navy)" : undefined }}>
      <div className="row-between"><b>{title}</b><span className="tag gold">{price}</span></div>
      <div className="tiny" style={{ marginTop: 6 }}>{body}</div>
    </button>
  );
}

function Done({ r, email }: { r: Result; email: string }) {
  const ok = r.sendStatus === "sent";
  const partial = r.sendStatus === "partial";
  return (
    <div className="card" style={{ maxWidth: 640, margin: "24px auto" }}>
      <h1>{ok ? "Your forms are on their way" : partial ? "Some of your forms went out" : "We saved your details, but the email didn't go"}</h1>
      <p>
        {ok && <>We sent your mandate form and signed letter of authority to {r.registrars.join(" and ")}. A confirmation is on its way to <b>{email}</b>.</>}
        {partial && <>Part of your submission was sent. We have your details saved and will send the rest ourselves. You don&apos;t need to do anything.</>}
        {r.sendStatus === "failed" && <>Nothing reached the registrar yet. Your details are saved with us and our team will send them. You don&apos;t need to fill this in again.</>}
      </p>
      <div className="ledger" style={{ margin: "16px 0" }}>
        <div className="row"><span className="k">Your reference</span><span className="v">{r.ref}</span></div>
        <div className="row"><span className="k">Companies</span><span className="v">{r.companyCount}</span></div>
        {r.payment.method === "pay_ahead"
          ? <div className="row"><span className="k">To pay by bank transfer</span><span className="v">{naira(r.payment.amountDue)}</span></div>
          : <div className="row"><span className="k">Payment</span><span className="v">10% after you&apos;re paid</span></div>}
      </div>
      {r.payment.method === "pay_ahead" && <p className="tiny">Use <b>{r.ref}</b> as your transfer reference. The account details are in your confirmation email.</p>}
      {r.byHand.length > 0 && <p className="tiny">Not printed on the registrar&apos;s form, so we&apos;ve listed them in the email for the registrar to add: {r.byHand.join(", ")}.</p>}
      {r.mode === "test" && <p className="tiny"><b>Test mode:</b> the registrar emails were sent to our test inbox, not the registrar.</p>}
    </div>
  );
}
