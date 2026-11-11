import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PILOT_COMPANIES, PILOT_REGISTRARS, companiesFor, payAheadTotal, registrarAddress } from "@/lib/pilot/config";
import type { MailMessage, Mailer } from "@/lib/pilot/mail";
import { resetRateLimit, tooMany } from "@/lib/pilot/rateLimit";
import { defaultSettings, effectiveSettings, publicConfig } from "@/lib/pilot/settings";
import { mergeStored, parseSettingsPatch } from "@/lib/pilot/settingsShared";
import { memoryStore } from "@/lib/pilot/store";
import { resendPilot, submitPilot } from "@/lib/pilot/submit";
import { pdfSafe } from "@/lib/pilot/text";
import { PilotValidationError, parsePilotInput, pilotProblems } from "@/lib/pilot/validate";

const photo = "data:image/jpeg;base64," + readFileSync("tests/fixtures/photo.jpg").toString("base64");
const signature = "data:image/png;base64," + readFileSync("tests/fixtures/signature.png").toString("base64");

const raw = (over: Record<string, unknown> = {}) => ({
  profile: {
    surname: "Ogunyemi", firstName: "Adewale", otherNames: "Bamidele", bvn: "22154874718", bankName: "Guaranty Trust Bank",
    accountNumber: "0123456213", address: "14 Bourdillon Close, Ikoyi", city: "Lagos", state: "Lagos", country: "Nigeria",
    previousAddress: "", chn: "", phone1: "08031234567", phone2: "", email: "Adewale@Example.com",
  },
  atPurchase: { address: "22 Awolowo Road, Ikoyi", phone: "08099990000", nextOfKinName: "Funke Ogunyemi", nextOfKinRelationship: "Spouse", nextOfKinPhone: "" },
  holdings: [
    { registrarId: "coronation", company: "MTN Nigeria Communication PLC" },
    { registrarId: "coronation", company: "Dangote Cement PLC" },
    { registrarId: "first", company: "CADBURY NIGERIA PLC" },
  ],
  photo, signature,
  payment: { method: "pay_ahead", acknowledged: true },
  consent: true,
  ...over,
});

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  failFor: (m: MailMessage) => boolean = () => false;
  async send(m: MailMessage) {
    if (this.failFor(m)) throw new Error("550 mailbox unavailable");
    this.sent.push(m);
    return { messageId: `id-${this.sent.length}` };
  }
}

beforeEach(() => {
  Object.assign(process.env, { PILOT_MODE: "test", PILOT_TEST_EMAIL: "tester@example.com", PILOT_ADMIN_EMAIL: "admin@example.com", MAIL_FROM: "Dividendi <dummy@dividendi.com>" });
  resetRateLimit();
  delete (globalThis as { __pilotSettings?: unknown }).__pilotSettings;
});

describe("pilot company list", () => {
  it("covers all 21 registrars, and leaves FBN Holdings out", () => {
    expect(PILOT_REGISTRARS.length).toBe(21);
    expect(new Set(PILOT_COMPANIES.map((c) => c.registrarId))).toEqual(new Set(PILOT_REGISTRARS.map((r) => r.id)));
    expect(companiesFor("coronation").length).toBe(30);
    expect(PILOT_COMPANIES.some((c) => /FBN HOLDINGS/i.test(c.company))).toBe(false);
    expect(payAheadTotal(12)).toBe(2400);
  });
});

describe("validation", () => {
  it("accepts a complete submission and tidies it", () => {
    const i = parsePilotInput(raw());
    expect(i.profile.email).toBe("adewale@example.com");
    expect(i.profile.phone1).toBe("+2348031234567");
    expect(i.profile.previousAddress).toBe("22 Awolowo Road, Ikoyi"); // the form's "previous address" box carries the address at purchase
    expect(i.holdings.length).toBe(3);
  });

  it("lists everything that's missing", () => {
    const i = parsePilotInput(raw());
    expect(pilotProblems({ ...i, consent: false, signature: null })).toEqual(["your signature", "a tick to authorise us to send your forms"]);
    expect(() => parsePilotInput(raw({ consent: false }))).toThrow(PilotValidationError);
    expect(() => parsePilotInput(raw({ payment: { method: "pay_ahead", acknowledged: false } }))).toThrow(/payment terms/);
    expect(() => parsePilotInput(raw({ atPurchase: { address: "", phone: "", nextOfKinName: "", nextOfKinRelationship: "", nextOfKinPhone: "" } }))).toThrow(/next of kin/);
  });

  it("refuses registrars and companies that aren't on a form", () => {
    expect(() => parsePilotInput(raw({ holdings: [{ registrarId: "nonexistent", company: "Zenith Bank Plc" }] }))).toThrow(/isn't a registrar we cover/);
    expect(() => parsePilotInput(raw({ holdings: [{ registrarId: "veritas", company: "Dangote Cement PLC" }] }))).toThrow(/isn't on that registrar's form/);
    expect(() => parsePilotInput(raw({ holdings: [{ registrarId: "first", company: "FBN HOLDINGS PLC" }] }))).toThrow(/isn't on that registrar's form/);
    expect(() => parsePilotInput(raw({ holdings: [{ registrarId: "coronation", company: "Anything I Typed" }] }))).toThrow(/isn't on that registrar's form/);
  });

  it("drops duplicate holdings", () => {
    const h = { registrarId: "coronation", company: "Dangote Cement PLC" };
    expect(parsePilotInput(raw({ holdings: [h, h] })).holdings.length).toBe(1);
  });
});

describe("pdfSafe", () => {
  it("keeps the letter and drops the mark on Yoruba and Igbo names", () => {
    expect(pdfSafe("Ọládẹ̀jọ Adébáyò")).toBe("Oladejo Adebayo");
    expect(pdfSafe("Nkem’s ₦200")).toBe("Nkem's N200");
  });
});

describe("submitPilot", () => {
  it("test mode: one email per registrar to the test inbox with both PDFs, then a confirmation to the shareholder", async () => {
    const mailer = new FakeMailer();
    const store = memoryStore();
    const sub = await submitPilot(parsePilotInput(raw()), { store, mailer });

    expect(sub.sendStatus).toBe("sent");
    expect(sub.ref).toMatch(/^DVD-[A-Z2-9]{6}$/);
    const reg = mailer.sent.filter((m) => m.attachments?.length);
    expect(reg.length).toBe(2);
    for (const m of reg) {
      expect(m.to).toBe("tester@example.com");
      expect(m.subject).toMatch(/^\[TEST, would go to /);
      expect(m.text).toContain("TEST MODE");
      expect(m.text).toContain("22 Awolowo Road"); // address at purchase
      expect(m.text).toContain("Funke Ogunyemi"); // next of kin
      expect(m.attachments!.map((a) => a.filename.split("-")[0])).toEqual(["Mandate", "Letter"]);
      for (const a of m.attachments!) expect((await PDFDocument.load(a.content)).getPageCount()).toBeGreaterThan(0);
    }
    const first = reg.find((m) => m.subject.includes("first") || m.text.includes("First Registrars"))!;
    expect(first.text).toContain("CADBURY NIGERIA PLC");
    expect(first.text).not.toContain("MTN Nigeria");

    const conf = mailer.sent.find((m) => !m.attachments?.length)!;
    expect(conf.to).toBe("adewale@example.com");
    expect(conf.text).toContain(sub.ref);
    expect(conf.text).toContain("N600".replace("N", "₦")); // 3 companies x 200
    expect(conf.text).not.toContain("22154874718"); // no BVN in the shareholder's email

    const saved = await store.get(sub.id);
    expect(saved?.payment).toMatchObject({ method: "pay_ahead", amountDue: 600, status: "awaiting_payment" });
    expect(saved?.files.length).toBe(4);
    expect(saved?.emails.filter((e) => e.kind === "registrar").every((e) => e.wouldHaveGoneTo)).toBe(true);
  }, 60_000);

  it("live mode: goes to the registrar's own address and blind-copies the admin", async () => {
    process.env.PILOT_MODE = "live";
    const mailer = new FakeMailer();
    await submitPilot(parsePilotInput(raw({ holdings: [{ registrarId: "coronation", company: "Dangote Cement PLC" }] })), { store: memoryStore(), mailer });
    const m = mailer.sent.find((x) => x.attachments?.length)!;
    expect(m.to).toBe("customercare@coronationregistrars.com");
    expect(m.bcc).toBe("admin@example.com");
    expect(m.subject).not.toContain("TEST");
  }, 60_000);

  it("every one of the 21 registrars gets its own email with a mandate and a letter of authority", async () => {
    const holdings = PILOT_REGISTRARS.map((r) => ({ registrarId: r.id, company: companiesFor(r.id)[0].company }));
    const mailer = new FakeMailer();
    const store = memoryStore();
    const sub = await submitPilot(parsePilotInput(raw({ holdings })), { store, mailer });
    expect(sub.sendStatus).toBe("sent");
    const reg = mailer.sent.filter((m) => m.attachments?.length);
    expect(reg.length).toBe(21);
    for (const m of reg) {
      expect(m.attachments!.length).toBe(2);
      for (const a of m.attachments!) expect((await PDFDocument.load(a.content)).getPageCount()).toBeGreaterThan(0);
    }
    expect(new Set(sub.files.map((f) => f.filename)).size).toBe(42); // no two registrars share a file name
    expect(sub.forms.every((f) => f.unlisted.length === 0)).toBe(true);
  }, 120_000);

  it("live mode sends to each registrar's own address, and PILOT_EMAIL_OVERRIDES can correct one", async () => {
    process.env.PILOT_MODE = "live";
    process.env.PILOT_EMAIL_OVERRIDES = JSON.stringify({ centurion: "customercare@centurionregistrars.com", bad: 5 });
    expect(registrarAddress("centurion")).toBe("customercare@centurionregistrars.com");
    expect(registrarAddress("veritas")).toBe("enquiry@veritasregistrars.com");
    const holdings = [{ registrarId: "centurion", company: companiesFor("centurion")[0].company }, { registrarId: "veritas", company: companiesFor("veritas")[0].company }];
    const mailer = new FakeMailer();
    await submitPilot(parsePilotInput(raw({ holdings })), { store: memoryStore(), mailer });
    expect(mailer.sent.filter((m) => m.attachments?.length).map((m) => m.to).sort()).toEqual(["customercare@centurionregistrars.com", "enquiry@veritasregistrars.com"]);
    delete process.env.PILOT_EMAIL_OVERRIDES;
  }, 60_000);

  it("debit-after submissions owe nothing up front", async () => {
    const sub = await submitPilot(parsePilotInput(raw({ payment: { method: "debit_after", acknowledged: true } })), { store: memoryStore(), mailer: new FakeMailer() });
    expect(sub.payment).toMatchObject({ method: "debit_after", amountDue: 0, status: "debit_pending" });
  }, 60_000);

  it("keeps the record when a send fails, then resends only what failed", async () => {
    const mailer = new FakeMailer();
    mailer.failFor = (m) => !!m.attachments?.length && m.text.includes("First Registrars");
    const store = memoryStore();
    const sub = await submitPilot(parsePilotInput(raw()), { store, mailer });
    expect(sub.sendStatus).toBe("partial");
    expect((await store.get(sub.id))?.emails.find((e) => e.status === "failed")?.error).toContain("550");

    mailer.failFor = () => false;
    const before = mailer.sent.length;
    const again = await resendPilot(sub.id, null, { store, mailer });
    expect(again.sendStatus).toBe("sent");
    expect(mailer.sent.length - before).toBe(1); // only First went again; the shareholder already had a confirmation
    await expect(resendPilot(sub.id, null, { store, mailer })).rejects.toThrow(/Every email went through/);
  }, 60_000);

  it("fills forms for names with Yoruba marks without crashing", async () => {
    const r = raw();
    r.profile.surname = "Ọládẹ̀jọ"; r.profile.firstName = "Adébáyò";
    const sub = await submitPilot(parsePilotInput(r), { store: memoryStore(), mailer: new FakeMailer() });
    expect(sub.sendStatus).toBe("sent");
    expect(sub.profile.surname).toBe("Ọládẹ̀jọ"); // the record keeps the original
  }, 60_000);
});

describe("rate limit", () => {
  it("lets six through an hour per address, then stops", () => {
    for (let i = 0; i < 6; i++) expect(tooMany("1.2.3.4")).toBe(false);
    expect(tooMany("1.2.3.4")).toBe(true);
    expect(tooMany("5.6.7.8")).toBe(false);
  });
});


describe("admin settings", () => {
  it("with nothing saved, behaves like the environment says", () => {
    const e = effectiveSettings(null);
    expect(e.mode).toBe("test");
    expect(e.senderEmail).toBe("dummy@dividendi.com");
    expect(e.senderName).toBe("Dividendi");
    expect(e.testInbox).toBe("tester@example.com");
    expect(Object.keys(e.registrars).length).toBe(21);
    expect(e.registrars.veritas).toEqual({ enabled: true, email: "enquiry@veritasregistrars.com" });
    expect(e.payAheadPerCompany).toBe(200);
    expect(e.debitRatePercent).toBe(10);
  });

  it("rejects bad input in plain words and leaves other settings alone", () => {
    expect(() => parseSettingsPatch({ senderEmail: "not-an-email" })).toThrow(/sending email/);
    expect(() => parseSettingsPatch({ registrars: { veritas: { email: "nope" } } })).toThrow(/Veritas/);
    expect(() => parseSettingsPatch({ payment: { accountNumber: "123" } })).toThrow(/10 digits/);
    expect(() => parseSettingsPatch({ payAheadPerCompany: -5 })).toThrow(/pay-ahead/);
    expect(() => parseSettingsPatch({ debitRatePercent: 90 })).toThrow(/percentage/);
    expect(() => parseSettingsPatch({ brandName: "  " })).toThrow(/business name/);
    const p = parseSettingsPatch({ replyTo: "ops@vendii.ng", registrars: { ghost: { email: "x@y.com" }, veritas: { enabled: false } } });
    expect(p).toEqual({ replyTo: "ops@vendii.ng", registrars: { veritas: { enabled: false } } });
    expect(parseSettingsPatch({ senderName: 'Eve" <evil@x.com>\r\nBcc: a@b.com' }).senderName).not.toMatch(/[<>"\r\n]/);
  });

  it("a saved change is used by the very next submission: sender, brand, registrar address, price, note", async () => {
    process.env.PILOT_MODE = "test";
    const store = memoryStore();
    await store.saveSettings(mergeStored(null, parseSettingsPatch({
      mode: "live", brandName: "Vendii", senderName: "Vendii Team", senderEmail: "hello@vendii.ng", replyTo: "support@vendii.ng", adminCopy: "boss@vendii.ng",
      registrarNote: "Please confirm receipt.", payAheadPerCompany: 500,
      registrars: { centurion: { email: "customercare@centurionregistrars.com" } },
      payment: { bank: "GTBank", accountName: "Vendii Ltd", accountNumber: "0123456789" },
    })));
    const mailer = new FakeMailer();
    const holdings = [{ registrarId: "centurion", company: companiesFor("centurion")[0].company }, { registrarId: "veritas", company: companiesFor("veritas")[0].company }];
    const sub = await submitPilot(parsePilotInput(raw({ holdings })), { store, mailer });
    expect(sub.mode).toBe("live");
    expect(sub.payment).toMatchObject({ amountDue: 1000 });
    const reg = mailer.sent.filter((m) => m.attachments?.length);
    expect(reg.map((m) => m.to).sort()).toEqual(["customercare@centurionregistrars.com", "enquiry@veritasregistrars.com"]);
    for (const m of reg) {
      expect(m.from).toBe("Vendii Team <hello@vendii.ng>");
      expect(m.replyTo).toBe("support@vendii.ng");
      expect(m.bcc).toBe("boss@vendii.ng");
      expect(m.text).toContain("Vendii is sending this on behalf of");
      expect(m.text).toContain("Please confirm receipt.");
      expect(m.text).not.toContain("Dividendi");
    }
    const conf = mailer.sent.find((m) => !m.attachments?.length)!;
    expect(conf.text).toContain("GTBank");
    expect(conf.text).toContain("₦500");
  }, 60_000);

  it("switching a registrar off refuses it, and pausing is reported to the form", () => {
    const e = effectiveSettings({ registrars: { veritas: { enabled: false } }, acceptingSubmissions: false });
    expect(publicConfig(e).registrars.some((r) => r.id === "veritas")).toBe(false);
    expect(publicConfig(e).open).toBe(false);
    expect(() => parsePilotInput(raw({ holdings: [{ registrarId: "veritas", company: companiesFor("veritas")[0].company }] }), { isOpen: (id) => e.registrars[id].enabled }))
      .toThrow(/isn't taking submissions/);
  });

  it("renaming the business renames the sender, unless a sender name was set on purpose", () => {
    expect(effectiveSettings({ brandName: "Vendii" }).senderName).toBe("Vendii");
    expect(effectiveSettings({ brandName: "Vendii", senderName: "Vendii Team" }).senderName).toBe("Vendii Team");
  });

  it("the form's own address is used again when an admin clears the box", () => {
    const e = effectiveSettings({ registrars: { centurion: { email: "" } } });
    expect(e.registrars.centurion.email).toBe(defaultSettings().registrars.centurion.email);
  });
});
