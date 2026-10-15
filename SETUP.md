# Vendii pilot: what to set up outside the code

Do these in order. Each part ends with a check, so you know it worked before moving on.
You need three accounts: **Supabase** (database and PDF storage), an **email account** that can send (SMTP), and **Vercel** (hosts the site).
Everything stays in test mode until you switch it, so nothing reaches a registrar by accident.

---

## Part 1. Supabase (the database)

**1. Create the project.**
- Go to supabase.com, sign in, press **New project**.
- Name: `vendii-pilot`. Choose a strong database password and save it in a password manager. Region: the closest to Lagos you're offered (Europe or South Africa). Press **Create**. Wait about two minutes.

**2. Create the tables and the private PDF bucket.**
- Left menu: **SQL Editor** > **New query**.
- Open the file `supabase/pilot.sql` from this project, copy all of it, paste it in, press **Run**. You should see "Success".
- *Check:* **Table Editor** now lists `pilot_submissions` and `pilot_leads`. **Storage** lists a bucket `pilot-submissions` marked private.

**3. Copy your three keys.**
- Left menu: **Project Settings** (cog) > **API** (or **API Keys**).
- Copy **Project URL** (looks like `https://abcd1234.supabase.co`) = `SUPABASE_URL`.
- Copy **anon / public** key = `SUPABASE_ANON_KEY`.
- Copy **service_role** key (press Reveal) = `SUPABASE_SERVICE_ROLE_KEY`. This one is a secret. It can read everything. Never paste it in WhatsApp, email, or any file that goes on GitHub.

**4. Make your staff login.**
- Left menu: **Authentication** > **Users** > **Add user** > **Create new user**.
- Email: your own (for example `info@rinwahospitality.com`). Choose a password. Tick **Auto Confirm User**. Create.
- Add anyone else who should see submissions the same way (your partner, for example).
- Then **Authentication** > **Sign In / Providers** (or **Settings**) and turn **off** "Allow new users to sign up", so nobody else can make an account.
- You'll put the same email addresses in `PILOT_ADMIN_EMAILS` (Part 3). A Supabase user who isn't in that list cannot open the admin page.

---

## Part 2. Email (SMTP)

The app sends from `Vendii <dami@dividendii.com>`. Confirm that spelling is your real domain (two i's) before you start. Pick one route.

**Route A (simplest): a real mailbox on the domain.** Create the mailbox `dami@dividendii.com` with Zoho Mail (free and cheap plans), Google Workspace, or your domain host's email. Registrar replies then land in a mailbox someone can read. Get these four values from the provider's "SMTP settings" page:

| Setting | Typical value |
| --- | --- |
| `SMTP_HOST` | Zoho: `smtp.zoho.com` (or `smtp.zoho.eu`). Google: `smtp.gmail.com` |
| `SMTP_PORT` | `587` (or `465`) |
| `SMTP_USER` | the full address, `dami@dividendii.com` |
| `SMTP_PASS` | the mailbox password. On Google and Zoho with two-step sign-in, make an **app password** and use that |

**Route B: a sending service** (Brevo, Resend, Postmark). Better at volume. Verify the domain `dividendii.com` in their dashboard, then copy the SMTP host, port, user and password they show. Registrar replies still go to `PILOT_REPLY_TO`, so set that to a mailbox you read.

**Both routes need three DNS records on `dividendii.com`**, or the registrars' mail servers will put your emails in spam. Your email provider shows them step by step; you add them where the domain is managed:
1. **SPF**, a TXT record.
2. **DKIM**, a TXT record (long text, from the provider).
3. **DMARC**, a TXT record named `_dmarc`, for example `v=DMARC1; p=none; rua=mailto:info@rinwahospitality.com`.

*Check:* in the provider's dashboard, all three show as verified. Send a normal email from that mailbox to a Gmail address and confirm it lands in the inbox, not spam.

Each registrar email carries two PDFs, about 0.6 MB together, so any normal SMTP account allows it.

---

## Part 3. Hosting and settings (Vercel)

**1.** Put the project on GitHub (private repository). Run `npm install` once locally first and commit `package-lock.json`.
**2.** vercel.com > **Add New** > **Project** > import the repository. Framework: Next.js (auto-detected).
**3.** Before pressing Deploy, open **Environment Variables** and add every line below. (Local testing: put the same lines in a file called `.env.local`.)

| Name | Value | Where it comes from |
| --- | --- | --- |
| `SUPABASE_URL` | `https://....supabase.co` | Part 1, step 3 |
| `SUPABASE_ANON_KEY` | anon key | Part 1, step 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | Part 1, step 3 |
| `PILOT_ADMIN_EMAILS` | your staff emails, comma separated | Part 1, step 4 |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | from your email provider | Part 2 |
| `MAIL_FROM` | `Vendii <dami@dividendii.com>` | Part 2 |
| `PILOT_REPLY_TO` | a mailbox you read | you choose |
| `PILOT_TEST_EMAIL` | where test registrar emails land (your inbox) | you choose |
| `PILOT_ADMIN_EMAIL` | gets a blind copy of live emails | you choose |
| `PILOT_MODE` | `test` | leave as test for now |
| `PILOT_OTP` | `demo` | leave as demo for now (code 123456) |
| `PILOT_SECRET` | 32+ random characters | make one: in a terminal run `openssl rand -hex 32` |
| `PILOT_PAY_BANK`, `PILOT_PAY_ACCOUNT_NAME`, `PILOT_PAY_ACCOUNT_NUMBER` | the account people pay ₦200 per company into | your business account |

Do **not** set `NEXT_PUBLIC_DATA_SOURCE` or any Firebase value. The pilot doesn't use Firebase.
**4.** Press **Deploy**. (After any later change to an environment variable, press **Redeploy**; changes only apply to new deployments.)
**5.** Point your domain at it if you want a custom address: Vercel > Settings > Domains.

---

## Part 4. Test it (test mode)

1. Open the site, press **Start the pilot**, and fill in all four steps with your own details. The email code is **123456**.
2. On the last step, press **Send my forms**. The reference appears at once ("Sending your forms now"), then switches to "on their way" in a few seconds.
3. In your `PILOT_TEST_EMAIL` inbox you should find, within a minute: one email **per registrar** (subject starts `[TEST, would go to ...]`) with **two PDFs**, plus a confirmation sent to the email you typed in step 1.
4. Go to `/admin` and sign in with your Supabase user. You should see your submission, the companies per registrar, each email's status. Press **Preview PDFs**, then **Chase this registrar**, and check the chase email arrives.
5. In Supabase **Table Editor** you can see the same record, and under **Storage** the PDFs.

If step 3 fails, the admin page shows the exact email error on the submission, and **Retry send** tries again.

---

## Part 5. Going live (only when you're ready)

1. Ask Coronation and First, in writing, that they accept e-dividend mandates **by email**, and whether they also want the bank's stamp or a wet signature. Their printed forms ask for both. Our flow can't supply a bank stamp.
2. Have a lawyer read the Letter of Authority (`lib/pilot/authority.ts`).
3. Change `PILOT_OTP` to `email` (real codes are emailed from `MAIL_FROM`) and confirm `PILOT_SECRET` is set.
4. Change `PILOT_MODE` to `live` and Redeploy. Registrar emails now go to their real addresses, with `PILOT_ADMIN_EMAIL` blind-copied.

---

## If something goes wrong

| What you see | Likely cause |
| --- | --- |
| Admin page says "Staff sign-in isn't configured" | the Supabase keys aren't set on Vercel, or you didn't redeploy after adding them |
| "That email isn't on the staff list" | add it to `PILOT_ADMIN_EMAILS` and redeploy |
| "Wrong email or password" | the user wasn't created in Supabase > Authentication > Users, or Auto Confirm wasn't ticked |
| Submission saved but "Not sent" | the SMTP values are wrong or the provider blocked it; read the error on the submission, fix, press **Retry send** |
| Emails arrive in spam | SPF, DKIM or DMARC records missing (Part 2) |
| "Supabase write failed (404)" | the SQL in Part 1, step 2 didn't run |
| Preview shows blank | use **Open in a tab** or **Download this PDF**; some phone browsers can't show PDFs inline |

## Not built yet (on purpose)

- **Account-number lookup.** For now the form only checks the account number is exactly 10 digits. A real name-check needs a paid bank-verification API (Paystack, Flutterwave, Mono or Nubapi). When you pick one, tell me and I'll wire it in beside that field.
- **A live direct-debit mandate.** The "pay when you're paid" choice is recorded; no debit is set up with a bank.
