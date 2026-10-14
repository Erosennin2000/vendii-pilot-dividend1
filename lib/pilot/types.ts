import type { FormProfile } from "@/lib/forms/types";
import type { PilotRegistrarId } from "./config";

export type PaymentMethod = "debit_after" | "pay_ahead";

/** What the pilot form posts. */
export interface PilotInput {
  profile: FormProfile;
  /** Next of kin and contact details as they were when the shares were bought. */
  atPurchase: {
    address: string;
    phone: string;
    nextOfKinName: string;
    nextOfKinRelationship: string;
    nextOfKinPhone: string;
  };
  holdings: { registrarId: PilotRegistrarId; company: string }[];
  photo: string | null;
  signature: string | null;
  payment: { method: PaymentMethod; acknowledged: boolean };
  consent: boolean;
  /** Honeypot. Real people leave it empty. */
  website?: string;
}

export type EmailStatus = "sent" | "failed";

export interface EmailRecord {
  kind: "registrar" | "confirmation";
  registrarId?: PilotRegistrarId;
  /** Where it was actually delivered. */
  to: string;
  /** In test mode the registrar's real address, which we did not use. */
  wouldHaveGoneTo?: string;
  status: EmailStatus;
  error?: string;
  messageId?: string;
  at: string;
}

export interface StoredFile {
  /** "forms-coronation", "authority-first" ... */
  name: string;
  registrarId: PilotRegistrarId;
  kind: "mandate" | "authority";
  /** Storage path (Firebase) or in-memory key. */
  path: string;
  filename: string;
}

export type SendStatus = "sent" | "partial" | "failed";
export type PaymentStatus = "debit_pending" | "awaiting_payment" | "paid";

export interface PilotSubmission {
  id: string;
  ref: string;
  createdAt: string;
  mode: "test" | "live";
  profile: FormProfile;
  atPurchase: PilotInput["atPurchase"];
  holdings: { registrarId: PilotRegistrarId; registrar: string; company: string }[];
  /** Per registrar: what got ticked on the form and what the registrar must add by hand. */
  forms: { registrarId: PilotRegistrarId; registrar: string; ticked: string[]; unlisted: string[]; warnings: string[] }[];
  payment: { method: PaymentMethod; amountDue: number; status: PaymentStatus; paidAt: string | null };
  consentAt: string;
  files: StoredFile[];
  emails: EmailRecord[];
  sendStatus: SendStatus;
  note: string;
}

/** The list view leaves out the heavy parts. */
export type PilotSummary = Omit<PilotSubmission, "files">;
