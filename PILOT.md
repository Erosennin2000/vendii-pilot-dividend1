# Pilot: Coronation and First registrars

The Vendii pilot. `/` is the pilot home page and **`/pilot`** is the four-step form (no account to create). The old claim screens
(`/claim`, `/dashboard`, `/forms`, `/sign-in`) still exist but nothing links to them; only a small "Staff sign-in" link remains for you.

| Step | What the person does | What we keep |
| --- | --- | --- |
| 1. You | Name, other spellings, email, CHN/CSCS. Presses Continue, then enters the **email code** (demo code **123456**). | A **lead** is saved the moment they continue, even if they never finish. |
| 2. Your companies | Registrar dropdown, company dropdown, **+ Add company**, repeat. Coronation and First only. | |
| 3. Your details | BVN, bank, account, address, mobile; address, phone and next of kin **at the time of purchase**. | |
| 4. Sign and send | Photo, signature, payment choice (10% after, or pay now at ₦200 a company), consent tick. | The full **submission**, with both PDFs per registrar. |

On **Send my forms** the app then:

1. fills each registrar's real e-dividend mandate form and ticks the companies;
2. writes a one-page **Letter of Authority** with the shareholder's signature, naming the holdings, other spellings, and details at purchase;
3. saves the record and the PDFs;
4. emails **each registrar** one message with both PDFs attached;
5. emails the **shareholder** a confirmation (no BVN, no attachments).

Staff see everything at **`/ops/pilot`** (sign in as an ops user): a **Submissions** tab (what was sent, each email's status, the PDFs, resend,
mark-as-paid, notes) and a **Leads** tab (email and CHN/CSCS of everyone who started, whether they confirmed their email, and whether they sent their forms), both with CSV export.

Everything pilot-specific lives in `lib/pilot/`, `app/pilot/`, `app/ops/pilot/`, `app/api/pilot/`. The look is Vendii brand v1.1 (logo, colours, self-hosted Space Grotesk, in `public/brand` and `public/fonts`).

## The email check (step 1)

- **Demo (default, `PILOT_OTP=demo`):** the code is always `123456`; no email is sent.
- **Real (`PILOT_OTP=email`):** a random 6-digit code is emailed from `MAIL_FROM`, valid for 15 minutes, five wrong tries then they must ask again.
- Either way, the server hands back a signed token (`PILOT_SECRET`) that the submit route requires. The email on the forms is always the confirmed one.

## Test mode and live mode

`PILOT_MODE` decides where registrar emails go. **If it isn't set to `live`, it is test.**

| Mode | Registrar emails go to | Admin copy |
| --- | --- | --- |
| `test` (default) | `PILOT_TEST_EMAIL`, subject starts `[TEST, would go to ...]`, banner at the top | n/a |
| `live` | The registrar's own address (Coronation `customercare@coronationregistrars.com`, First `info@firstregistrarsnigeria.com`) | `PILOT_ADMIN_EMAIL` is blind-copied; registrar replies go to `PILOT_REPLY_TO` |

The shareholder's confirmation always goes to the address they typed. Every record notes which mode it was sent in.

## Set-up (about 15 minutes)

1. `npm install` (adds `nodemailer`).
2. Copy the pilot block of `.env.example` into `.env.local` (and into Vercel's environment variables):
   `PILOT_MODE`, `PILOT_OTP`, `PILOT_SECRET`, `PILOT_TEST_EMAIL`, `PILOT_ADMIN_EMAIL`, `PILOT_REPLY_TO`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   and the three `PILOT_PAY_*` lines for people who choose pay-ahead.
3. **Mailbox.** `MAIL_FROM` is `Vendii <dami@dividendii.com>` (the group address; check the spelling matches your real domain). You need an SMTP login for that address (Zoho, Google Workspace, Brevo, Resend, Postmark...) and the
   domain's SPF/DKIM records set up by that provider, or the mail will land in spam.
4. **Database.** Nothing to create by hand. With `NEXT_PUBLIC_DATA_SOURCE=firebase`, submissions are written to a Firestore collection called
   **`pilotSubmissions`** and **`pilotLeads`** (created on first use) and PDFs to Storage under **`pilot-submissions/<id>/`**. Deploy the updated rules so only ops can read the collection:
   `npm run deploy:rules`. Make yourself ops if you haven't: `npm run set-role -- you@dividendi.ng ops`.
5. Without Firebase (`NEXT_PUBLIC_DATA_SOURCE=mock`, local only), records live in server memory until restart and, with no `SMTP_HOST`, emails are logged to the terminal instead of sent. Good for a look around, not for the real test.
6. `npm run dev`, open `/pilot`. Submit with your own details. The emails arrive at `PILOT_TEST_EMAIL`. Check `/ops/pilot`.

## Going live checklist

- Check with Coronation and First that they accept e-mandates **by email**, and whether they need the bank's stamp or a wet signature. Their printed forms ask for a bank stamp and authorised bank signatory, which this flow cannot supply.
- Have a lawyer read the Letter of Authority wording in `lib/pilot/authority.ts`.
- Send one real submission yourself in test mode and read both PDFs.
- Switch `PILOT_OTP=email` and set a `PILOT_SECRET`, so the email check is real.
- Set `PILOT_MODE=live`, redeploy. Remember `NEXT_PUBLIC_` values and env changes need a redeploy.

## Rules the pilot enforces

- Only companies printed on the Coronation and First forms are accepted; FBN Holdings is excluded. The server rechecks every name, not just the dropdown.
- The shareholder must tick consent and the payment terms; the server refuses a submission without them and lists everything missing.
- The record is saved **before** any email is sent. If an email fails, the record shows "Not sent" and the error, and **Retry send** resends from the stored PDFs.
- Public form protections: a hidden honeypot field and six submissions per hour per address (per server instance).
- Names with marks (ọ, ẹ, ń) are simplified on the PDFs so the forms still render; the record keeps exactly what was typed.

## Payment options

- **Direct debit after:** 10% of dividends actually received. Recorded as `debit_pending`; there is no live NIBSS mandate yet (same as the main app).
- **Pay ahead:** ₦200 per company by bank transfer. Recorded as `awaiting_payment`; mark it paid in `/ops/pilot` when the transfer lands. Sending to the registrar does not wait for payment.
- Note: First Registrars' own form says the activation service costs **₦150 per approved mandate per company**. That is a registrar charge on top of yours.

## Tests

`npm test` includes `tests/pilot.test.ts` (validation, both modes, both PDFs attached, failed-send and resend, Yoruba names, rate limit).
