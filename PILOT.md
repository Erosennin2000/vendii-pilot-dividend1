# Pilot: Coronation and First registrars

The Vendii pilot. `/` is the pilot home page and **`/pilot`** is the four-step form (no account to create). The old claim screens
(`/claim`, `/dashboard`, `/forms`, `/sign-in`) still exist but nothing links to them; only a small "Staff sign-in" link remains for you.

| Step | What the person does | What we keep |
| --- | --- | --- |
| 1. You | Name, other spellings, email, CHN/CSCS. Presses Continue, then enters the **email code** (demo code **123456**). | A **lead** is saved the moment they continue, even if they never finish. |
| 2. Your companies | Registrar dropdown, then a **tick-box list** of companies (search, Tick all) and **Add N companies** in one go. Coronation and First only. | |
| 3. Your details | BVN, **bank (dropdown of Nigerian banks, fintechs and microfinance banks)**, **account number (exactly 10 digits)**, address, mobile; address, phone and next of kin **at the time of purchase**. | |
| 4. Sign and send | Photo, signature, payment choice (10% after, or pay now at ₦200 a company), consent tick. | The full **submission**, with both PDFs per registrar. |

On **Send my forms**, two things happen:

1. **Instantly:** the app fills each registrar's real e-dividend mandate form, writes a one-page **Letter of Authority** (with the shareholder's signature, holdings, other spellings and details at purchase), saves the record and PDFs, and shows the reference. The record is in the admin page at once, marked **Queued**.
2. **Right behind it** (a second call, a few seconds): the registrars' emails go out together, each with both PDFs, then the shareholder gets a confirmation (no BVN, no attachments). The status becomes **Sent**.

If the tab is closed between the two, the submission stays **Queued** and shows a **Send now** button in the admin page.

## Staff page: `/admin`

Sign in with a Supabase Auth user whose email is in `PILOT_ADMIN_EMAILS`. The list refreshes every 10 seconds.
- **Submissions:** who, what was sent to each registrar and how many companies, each email's status, search, CSV export, payment status, notes.
- **Preview PDFs:** the exact mandate form and letter of authority that went to a registrar, with the company count and list, beside **Chase this registrar** (sends a follow-up email with both PDFs again and an optional line from you; every chase is logged).
- **Send now / Send again / Retry send**, and **Mark as paid** for pay-ahead.
- **Leads:** email and CHN/CSCS of everyone who started, whether they confirmed their email, whether they sent their forms.

Everything pilot-specific lives in `lib/pilot/`, `components/CompanyPicker.tsx`, `app/pilot/`, `app/admin/`, `app/api/pilot/`, `supabase/pilot.sql`. The look is Vendii brand v1.1.

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

## Set-up

Follow **[SETUP.md](SETUP.md)**: Supabase (database, PDF storage, staff login), SMTP email, Vercel settings, how to test, how to go live.
Where the records go is chosen by `PILOT_STORE`: `supabase`, `firebase` or `memory`. With nothing set it uses Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exist, else Firebase in firebase mode, else server memory (local only; with no `SMTP_HOST`, emails are printed to the terminal in development).

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
- An account number must be exactly 10 digits, checked in the form and again on the server. There is no bank-name lookup yet.
- Public form protections: a hidden honeypot field and six submissions per hour per address (per server instance).
- Names with marks (ọ, ẹ, ń) are simplified on the PDFs so the forms still render; the record keeps exactly what was typed.

## Payment options

- **Direct debit after:** 10% of dividends actually received. Recorded as `debit_pending`; there is no live NIBSS mandate yet (same as the main app).
- **Pay ahead:** ₦200 per company by bank transfer. Recorded as `awaiting_payment`; mark it paid in `/admin` when the transfer lands. Sending to the registrar does not wait for payment.
- Note: First Registrars' own form says the activation service costs **₦150 per approved mandate per company**. That is a registrar charge on top of yours.

## Tests

`npm test` includes `tests/pilot.test.ts` (validation, both modes, both PDFs attached, instant create then send, chase, failed-send and resend, Yoruba names, bank list and 10-digit rule, rate limit, the Supabase store and staff sign-in against a fake Supabase).
