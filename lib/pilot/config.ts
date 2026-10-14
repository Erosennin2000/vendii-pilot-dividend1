/**
 * Pilot settings that are safe to import anywhere (browser or server).
 * The pilot covers two registrars only. Everything else about the pilot lives in lib/pilot/.
 */
import { DIRECTORY } from "@/lib/forms/registry";

export const PILOT_BRAND = "Dividendi";

/** Registrars in the pilot, with the address their mandate form says to send to. */
export const PILOT_REGISTRARS = [
  { id: "coronation", name: "Coronation Registrars", email: "customercare@coronationregistrars.com" },
  { id: "first", name: "First Registrars", email: "info@firstregistrarsnigeria.com" },
] as const;
export type PilotRegistrarId = (typeof PILOT_REGISTRARS)[number]["id"];

export const pilotRegistrar = (id: string) => PILOT_REGISTRARS.find((r) => r.id === id) ?? null;

/** Pay-ahead price per company, in naira. */
export const PAY_AHEAD_PER_COMPANY = 200;
/** Direct-debit success fee, on dividends actually received. */
export const DEBIT_RATE = 0.1;

export const MAX_COMPANIES = 40;

/** Companies we won't offer in the pilot even if a form lists something close. */
const NOT_COVERED = [/^FBN HOLDINGS/i];

export interface PilotCompany { registrarId: PilotRegistrarId; registrar: string; company: string }

/** Every company printed on the Coronation and First forms, sorted. Used for the dropdowns and for checking submissions. */
export const PILOT_COMPANIES: PilotCompany[] = DIRECTORY
  .filter((e) => PILOT_REGISTRARS.some((r) => r.id === e.registrarId) && !NOT_COVERED.some((re) => re.test(e.company)))
  .map((e) => ({ registrarId: e.registrarId as PilotRegistrarId, registrar: e.registrar, company: e.company }))
  .sort((a, b) => a.company.localeCompare(b.company));

export const companiesFor = (registrarId: string) => PILOT_COMPANIES.filter((c) => c.registrarId === registrarId);

export const payAheadTotal = (companyCount: number) => Math.max(0, companyCount) * PAY_AHEAD_PER_COMPANY;
