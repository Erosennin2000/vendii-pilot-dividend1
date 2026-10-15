import "server-only";
import { DATA_SOURCE } from "@/lib/config";
import type { PilotLead, PilotSubmission } from "./types";

export const PILOT_COLLECTION = "pilotSubmissions";
export const LEADS_COLLECTION = "pilotLeads";

export interface PilotStore {
  /** Writes the record and its files together. The record is saved before any email goes out. */
  save(sub: PilotSubmission, files: { path: string; bytes: Uint8Array; contentType: string }[]): Promise<void>;
  update(id: string, patch: Partial<PilotSubmission>): Promise<void>;
  get(id: string): Promise<PilotSubmission | null>;
  /** Newest first. */
  list(limit?: number): Promise<PilotSubmission[]>;
  readFile(path: string): Promise<Uint8Array>;
  /** Insert or replace a lead (one per email). */
  saveLead(lead: PilotLead): Promise<void>;
  getLead(id: string): Promise<PilotLead | null>;
  /** Newest activity first. */
  listLeads(limit?: number): Promise<PilotLead[]>;
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)); // Firestore rejects undefined fields

/** Local dev with no Firebase: lives in the server process, gone on restart. */
export function memoryStore(): PilotStore {
  const g = globalThis as unknown as { __pilotMem?: { subs: Map<string, PilotSubmission>; files: Map<string, Uint8Array>; leads: Map<string, PilotLead> } };
  const mem = (g.__pilotMem ??= { subs: new Map(), files: new Map(), leads: new Map() });
  mem.leads ??= new Map();
  return {
    async save(sub, files) {
      mem.subs.set(sub.id, plain(sub));
      for (const f of files) mem.files.set(f.path, f.bytes);
    },
    async update(id, patch) {
      const cur = mem.subs.get(id);
      if (!cur) throw new Error("Submission not found.");
      mem.subs.set(id, plain({ ...cur, ...patch }));
    },
    async get(id) { const s = mem.subs.get(id); return s ? plain(s) : null; },
    async list(limit = 500) {
      return [...mem.subs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(plain);
    },
    async readFile(path) {
      const f = mem.files.get(path);
      if (!f) throw new Error("File not found.");
      return f;
    },
    async saveLead(lead) { mem.leads.set(lead.id, plain(lead)); },
    async getLead(id) { const l = mem.leads.get(id); return l ? plain(l) : null; },
    async listLeads(limit = 1000) {
      return [...mem.leads.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit).map(plain);
    },
  };
}

/** Firestore for the record, Storage for the PDFs. Server (service account) only. */
export async function firebaseStore(): Promise<PilotStore> {
  const { adminBucket, adminDb } = await import("@/lib/firebase/admin");
  const col = () => adminDb().collection(PILOT_COLLECTION);
  return {
    async save(sub, files) {
      // Files first: a record must never point at a PDF that isn't there.
      for (const f of files) await adminBucket().file(f.path).save(Buffer.from(f.bytes), { contentType: f.contentType, resumable: false });
      await col().doc(sub.id).set(plain(sub));
    },
    async update(id, patch) { await col().doc(id).update(plain(patch) as Record<string, unknown>); },
    async get(id) {
      const d = await col().doc(id).get();
      return d.exists ? (d.data() as PilotSubmission) : null;
    },
    async list(limit = 500) {
      const snap = await col().orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => d.data() as PilotSubmission);
    },
    async readFile(path) {
      const [buf] = await adminBucket().file(path).download();
      return new Uint8Array(buf);
    },
    async saveLead(lead) { await adminDb().collection(LEADS_COLLECTION).doc(lead.id).set(plain(lead)); },
    async getLead(id) {
      const d = await adminDb().collection(LEADS_COLLECTION).doc(id).get();
      return d.exists ? (d.data() as PilotLead) : null;
    },
    async listLeads(limit = 1000) {
      const snap = await adminDb().collection(LEADS_COLLECTION).orderBy("updatedAt", "desc").limit(limit).get();
      return snap.docs.map((d) => d.data() as PilotLead);
    },
  };
}

export async function getPilotStore(): Promise<PilotStore> {
  return DATA_SOURCE === "firebase" ? firebaseStore() : memoryStore();
}
