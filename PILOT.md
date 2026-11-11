# Pilot: all 21 registrars

A separate, public page at **`/pilot`** (no sign-in). The shareholder picks their companies, fills in their details,
ticks their consent and presses **Send my forms**. The app then:

1. fills each registrar's real e-dividend mandate form (all 21: Africa Prudential, Apel, Atlas, CardinalStone, Carnation, Centurion, Cordros, Coronation, Datamax, EDC, First, Flour Mills, Greenwich, Lancelot, Lighthouse, Mainstreet, Meristem, PAC, Pace, Unity, Veritas) and ticks the companies;
2. writes a one-page **Letter of Authority** (limited power of attorney) with the shareholder's drawn signature;
3. saves the full record and the PDFs;
4. emails **each registrar** one message with both PDFs attached, with the address at purchase, phone and next of kin in the body;
5. emails the **shareholder** a confirmation (no BVN, no attachments).

Staff see everything at **`/ops/pilot`** (sign in as an ops user): who submitted, what was ticked, whether each email went,
the PDFs, a resend button, mark-as-paid for pay-ahead, a note box, and CSV export for chasing.

The main app is untouched. Everything pilot-specific lives in `lib/pilot/`, `app/pilot/`, `app/ops/pilot/`, `app/api/pilot/`.

## Pilot settings page (no code needed)

Staff open **Pilot settings** in the top menu (`/ops/pilot/settings`). Changes apply to the very next submission and never alter emails already sent.

- **Test or Live**, with a tick-box confirmation before switching to Live, and a switch to **pause the public form**.
- **Sending email**: business name, sender name, From address, reply-to, blind-copy ("copy me") and test inbox, plus a **Send test email** button that checks the saved sender works.
- **Registrars**: switch any of the 21 on or off, and set each one's email address (clear the box to go back to the address printed on its form). Known problem addresses are flagged.
- **Prices and bank details**: pay-ahead price per company, direct-debit percentage, and the account people pay into.
- **Extra note** added to every registrar email.

Values saved here win over the `.env` ones; anything left blank falls back to `.env`, so nothing has to be filled in. Stored in Firestore collection `pilotSettings` (deploy the updated rules: `npm run deploy:rules`). The mail **password** and server (`SMTP_*`) stay in `.env` on purpose and are never shown or stored in the database. Sending from a new address only works if your mail provider allows it, so use the test button after changing it.

## Test mode and live mode

`PILOT_MODE` in `.env` is the starting default; once someone saves the Pilot settings page, the mode chosen there is used instead. **If it isn't `live`, it is test.**

| Mode | Registrar emails go to | Admin copy |
| --- | --- | --- |
| `test` (default) | `PILOT_TEST_EMAIL`, subject starts `[TEST, would go to ...]`, banner at the top | n/a |
| `live` | The registrar's own address, as printed on its form (see `lib/pilot/config.ts`; override one with `PILOT_EMAIL_OVERRIDES`) | `PILOT_ADMIN_EMAIL` is blind-copied; registrar replies go to `PILOT_REPLY_TO` |

The shareholder's confirmation always goes to the address they typed. Every record notes which mode it was sent in.

## Set-up (about 15 minutes)

1. `npm install` (adds `nodemailer`).
2. Copy the pilot block of `.env.example` into `.env.local` (and into Vercel's environment variables):
   `PILOT_MODE`, `PILOT_TEST_EMAIL`, `PILOT_ADMIN_EMAIL`, `PILOT_REPLY_TO`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   and the three `PILOT_PAY_*` lines for people who choose pay-ahead.
3. **Mailbox.** `MAIL_FROM` is `Dividendi <dummy@dividendi.com>`. You need an SMTP login for that address (Zoho, Google Workspace, Brevo, Resend, Postmark...) and the
   domain's SPF/DKIM records set up by that provider, or the mail will land in spam.
4. **Database.** Nothing to create by hand. With `NEXT_PUBLIC_DATA_SOURCE=firebase`, submissions are written to a Firestore collection called
   **`pilotSubmissions`** (created on the first submission) and PDFs to Storage under **`pilot-submissions/<id>/`**. Deploy the updated rules so only ops can read the collection:
   `npm run deploy:rules`. Make yourself ops if you haven't: `npm run set-role -- you@dividendi.ng ops`.
5. Without Firebase (`NEXT_PUBLIC_DATA_SOURCE=mock`, local only), records live in server memory until restart and, with no `SMTP_HOST`, emails are logged to the terminal instead of sent. Good for a look around, not for the real test.
6. `npm run dev`, open `/pilot`. Submit with your own details. The emails arrive at `PILOT_TEST_EMAIL`. Check `/ops/pilot`.

## Going live checklist

- **Check each registrar address in `lib/pilot/config.ts`.** They are copied from the forms. Known problems: Centurion's form prints `cusomercare@` (typo, probably `customercare@`); EDC's is a complaints mailbox; Mainstreet's is a Yahoo address. Fix any without a code change: `PILOT_EMAIL_OVERRIDES={"centurion":"customercare@centurionregistrars.com"}`.
- Africa Prudential's form has 10 BVN boxes for an 11-digit BVN, and Cordros's address line has 19 boxes. Long values are cut or run over; the full details are in the email body.
- Do a test-mode run with one company on each registrar and read every PDF.
- Check with Coronation and First that they accept e-mandates **by email**, and whether they need the bank's stamp or a wet signature. Their printed forms ask for a bank stamp and authorised bank signatory, which this flow cannot supply.
- Have a lawyer read the Letter of Authority wording in `lib/pilot/authority.ts`.
- Send one real submission yourself in test mode and read both PDFs.
- Set `PILOT_MODE=live`, redeploy. Remember `NEXT_PUBLIC_` values and env changes need a redeploy.

## Rules the pilot enforces

- Only companies printed on the chosen registrar's own form are accepted; FBN Holdings is excluded. The server rechecks every name, not just the dropdown.
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
