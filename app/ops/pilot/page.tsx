"use client";

import { useEffect, useMemo, useState } from "react";
import { naira } from "@/lib/domain/fees";
import { actOnSubmission, downloadFile, leadsCsv, listLeads, listSubmissions, submissionsCsv } from "@/lib/pilot/client";
import { PILOT_REGISTRARS } from "@/lib/pilot/config";
import type { PilotLeadView, PilotSubmission } from "@/lib/pilot/types";
import { saveBlob } from "@/lib/forms/client";
import { errorMessage } from "@/lib/util";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
const tone = (s: string) => (s === "sent" || s === "paid" ? "teal" : s === "partial" || s === "awaiting_payment" || s === "debit_pending" ? "gold" : "red");
const label: Record<string, string> = { sent: "Sent", partial: "Part sent", failed: "Not sent", paid: "Paid", awaiting_payment: "Awaiting payment", debit_pending: "Debit after" };

export default function PilotAdmin() {
  const [subs, setSubs] = useState<PilotSubmission[] | null>(null);
  const [leads, setLeads] = useState<PilotLeadView[]>([]);
  const [tab, setTab] = useState<"subs" | "leads">("subs");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = () => Promise.all([listSubmissions(), listLeads()]).then(([s, l]) => { setSubs(s); setLeads(l); }).catch((e) => setError(errorMessage(e)));
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (subs ?? []).filter((s) => !t || [s.ref, s.profile.firstName, s.profile.surname, s.profile.email, s.profile.phone1, ...s.holdings.map((h) => h.company)].join(" ").toLowerCase().includes(t));
  }, [subs, q]);

  const shownLeads = useMemo(() => {
    const t = q.trim().toLowerCase();
    return leads.filter((l) => !t || [l.email, l.firstName, l.surname, l.chn, l.submittedRef ?? ""].join(" ").toLowerCase().includes(t));
  }, [leads, q]);

  async function run(id: string, body: Parameters<typeof actOnSubmission>[1], key: string) {
    setBusy(key); setError(null);
    try {
      const updated = await actOnSubmission(id, body);
      setSubs((all) => all?.map((s) => (s.id === id ? updated : s)) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!subs && !error) return <div className="center-note"><span className="spin" /></div>;
  const all = subs ?? [];
  const sel = all.find((s) => s.id === open) ?? null;
  const count = (f: (s: PilotSubmission) => boolean) => all.filter(f).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pilot submissions</h1>
          <p>Everyone who has started or finished the Coronation and First pilot. Leads are people who began step 1, finished or not. Open a submission to see what was sent, resend a failed email, or mark a payment as received.</p>
        </div>
        <button className="btn ghost sm" onClick={() => tab === "leads"
          ? saveBlob(new Blob([leadsCsv(shownLeads)], { type: "text/csv" }), "vendii-pilot-leads.csv")
          : saveBlob(new Blob([submissionsCsv(shown)], { type: "text/csv" }), "vendii-pilot-submissions.csv")}>Export CSV</button>
      </div>

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="k">{leads.length}</div><div className="v">Started (leads)</div></div>
        <div className="stat-card"><div className="k">{all.length}</div><div className="v">Submissions</div></div>
        <div className="stat-card"><div className="k">{count((s) => s.sendStatus === "sent")}</div><div className="v">Fully sent</div></div>
        <div className="stat-card"><div className="k">{count((s) => s.sendStatus !== "sent")}</div><div className="v">Needs a resend</div></div>
        <div className="stat-card"><div className="k">{count((s) => s.payment.status === "awaiting_payment")}</div><div className="v">Awaiting payment</div></div>
        <div className="stat-card"><div className="k">{all.reduce((n, s) => n + s.holdings.length, 0)}</div><div className="v">Companies</div></div>
      </div>

      {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button className="tab" role="tab" aria-selected={tab === "subs"} onClick={() => setTab("subs")}>Submissions ({all.length})</button>
        <button className="tab" role="tab" aria-selected={tab === "leads"} onClick={() => setTab("leads")}>Leads ({leads.length})</button>
      </div>
      <input className="input" placeholder="Search name, email, CHN, phone, reference or company" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} />

      {tab === "leads" && (
        <div className="card" style={{ overflowX: "auto" }}>
          {shownLeads.length === 0 ? <p className="tiny">{leads.length ? "No match." : "Nobody has started yet."}</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
                {["Name", "Email", "CHN / CSCS", "Last activity", "Email confirmed", "Sent forms"].map((h) => <th key={h} style={{ padding: "6px 10px", fontWeight: 500 }}>{h}</th>)}
              </tr></thead>
              <tbody>{shownLeads.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--rule)" }}>
                  <td style={{ padding: "8px 10px" }}><b>{l.firstName} {l.surname}</b>{l.variants.length > 0 && <div className="tiny">Also: {l.variants.join("; ")}</div>}</td>
                  <td style={{ padding: "8px 10px" }}>{l.email}</td>
                  <td style={{ padding: "8px 10px" }}>{l.chn || "Not given"}</td>
                  <td style={{ padding: "8px 10px" }}>{when(l.updatedAt)}</td>
                  <td style={{ padding: "8px 10px" }}><span className={`tag ${l.verifiedAt ? "teal" : ""}`}>{l.verifiedAt ? "Yes" : "No"}</span></td>
                  <td style={{ padding: "8px 10px" }}>{l.submittedRef ? <span className="tag teal">{l.submittedRef}</span> : <span className="tag">Not yet</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === "subs" && <div className="two-col">
        <div className="stack">
          {shown.length === 0 && <div className="card"><p className="tiny">{all.length ? "No match." : "No submissions yet."}</p></div>}
          {shown.map((s) => (
            <button key={s.id} type="button" className="card" onClick={() => { setOpen(s.id); setNote(s.note); }}
              style={{ textAlign: "left", cursor: "pointer", padding: "12px 16px", boxShadow: open === s.id ? "0 0 0 2px var(--navy)" : undefined }}>
              <div className="row-between">
                <b>{s.profile.firstName} {s.profile.surname}</b>
                <span className="tiny">{s.ref} &middot; {when(s.createdAt)}</span>
              </div>
              <div className="tiny">{s.holdings.length} {s.holdings.length === 1 ? "company" : "companies"} &middot; {[...new Set(s.holdings.map((h) => h.registrar))].join(", ")}</div>
              <div className="tags" style={{ marginTop: 8 }}>
                <span className={`tag ${tone(s.sendStatus)}`}>{label[s.sendStatus]}</span>
                <span className={`tag ${tone(s.payment.status)}`}>{label[s.payment.status]}{s.payment.method === "pay_ahead" ? ` ${naira(s.payment.amountDue)}` : ""}</span>
                {s.mode === "test" && <span className="tag">Test</span>}
              </div>
            </button>
          ))}
        </div>

        <aside className="card" style={{ position: "sticky", top: 24 }}>
          {!sel ? <p className="tiny">Pick a submission to see it in full.</p> : (
            <div className="stack">
              <div>
                <h3 style={{ margin: 0 }}>{sel.profile.firstName} {sel.profile.otherNames} {sel.profile.surname}</h3>
                <div className="tiny">{sel.ref} &middot; {when(sel.createdAt)} &middot; {sel.mode === "test" ? "test mode" : "live"}</div>
              </div>
              <div className="ledger">
                <div className="row"><span className="k">Email</span><span className="v">{sel.profile.email}</span></div>
                <div className="row"><span className="k">Mobile</span><span className="v">{sel.profile.phone1}</span></div>
                <div className="row"><span className="k">BVN</span><span className="v">{sel.profile.bvn}</span></div>
                <div className="row"><span className="k">Bank</span><span className="v">{sel.profile.bankName} {sel.profile.accountNumber}</span></div>
                <div className="row"><span className="k">Address now</span><span className="v">{[sel.profile.address, sel.profile.city, sel.profile.state].filter(Boolean).join(", ")}</span></div>
                <div className="row"><span className="k">Address then</span><span className="v">{sel.atPurchase.address}</span></div>
                {sel.atPurchase.phone && <div className="row"><span className="k">Phone then</span><span className="v">{sel.atPurchase.phone}</span></div>}
                <div className="row"><span className="k">Next of kin</span><span className="v">{[sel.atPurchase.nextOfKinName, sel.atPurchase.nextOfKinRelationship, sel.atPurchase.nextOfKinPhone].filter(Boolean).join(", ")}</span></div>
              </div>

              {PILOT_REGISTRARS.filter((r) => sel.holdings.some((h) => h.registrarId === r.id)).map((r) => {
                const form = sel.forms.find((f) => f.registrarId === r.id);
                const last = [...sel.emails].reverse().find((e) => e.kind === "registrar" && e.registrarId === r.id);
                return (
                  <div key={r.id} className="card" style={{ padding: 12 }}>
                    <div className="row-between"><b>{r.name}</b><span className={`tag ${last ? tone(last.status) : "red"}`}>{last ? label[last.status] : "Not sent"}</span></div>
                    <ul className="tiny" style={{ margin: "6px 0", paddingLeft: 16 }}>{sel.holdings.filter((h) => h.registrarId === r.id).map((h) => <li key={h.company}>{h.company}</li>)}</ul>
                    {last && <div className="tiny">To {last.to}{last.wouldHaveGoneTo ? ` (test; real: ${last.wouldHaveGoneTo})` : ""} &middot; {when(last.at)}</div>}
                    {last?.error && <div className="field-error">{last.error}</div>}
                    {form?.unlisted.length ? <div className="tiny">Not on the form, listed in the email: {form.unlisted.join(", ")}</div> : null}
                    {form?.warnings.length ? <div className="tiny">{form.warnings.join(" ")}</div> : null}
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      {(["mandate", "authority"] as const).map((k) => {
                        const f = sel.files.find((x) => x.registrarId === r.id && x.kind === k);
                        return f ? <button key={k} className="btn ghost sm" onClick={() => downloadFile(sel.id, f.name, f.filename).catch((e) => setError(errorMessage(e)))}>{k === "mandate" ? "Mandate PDF" : "Authority PDF"}</button> : null;
                      })}
                      <button className="btn sm" disabled={busy === `r-${r.id}`} onClick={() => run(sel.id, { action: "resend", registrarId: r.id }, `r-${r.id}`)}>{busy === `r-${r.id}` ? "Sending" : last?.status === "sent" ? "Send again" : "Retry send"}</button>
                    </div>
                  </div>
                );
              })}

              <div className="ledger">
                <div className="row"><span className="k">Payment</span><span className="v">{sel.payment.method === "pay_ahead" ? `Pay ahead ${naira(sel.payment.amountDue)}` : "Direct debit after (10%)"}</span></div>
                <div className="row"><span className="k">Status</span><span className="v">{label[sel.payment.status]}{sel.payment.paidAt ? `, ${when(sel.payment.paidAt)}` : ""}</span></div>
              </div>
              {sel.payment.method === "pay_ahead" && (
                <button className="btn ghost sm" disabled={busy === "pay"} onClick={() => run(sel.id, { action: sel.payment.status === "paid" ? "markUnpaid" : "markPaid" }, "pay")}>
                  {sel.payment.status === "paid" ? "Undo: mark as not paid" : "Mark as paid"}
                </button>
              )}

              <div className="field">
                <label htmlFor="pnote">Your note</label>
                <textarea id="pnote" className="input" rows={3} style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Chased on Monday, registrar said..." />
                <button className="btn ghost sm" style={{ marginTop: 6 }} disabled={busy === "note" || note === sel.note} onClick={() => run(sel.id, { action: "note", note }, "note")}>Save note</button>
              </div>

              <details>
                <summary className="tiny">Email log ({sel.emails.length})</summary>
                {sel.emails.map((e, i) => <div key={i} className="tiny">{when(e.at)}: {e.kind}{e.registrarId ? ` (${e.registrarId})` : ""} to {e.to}: {e.status}{e.error ? `, ${e.error}` : ""}</div>)}
              </details>
            </div>
          )}
        </aside>
      </div>}
    </>
  );
}
