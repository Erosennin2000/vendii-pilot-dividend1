import { NextResponse } from "next/server";
import { DATA_SOURCE } from "@/lib/config";
import { HttpError, caller, requireOps } from "@/lib/server/http";
import { PILOT_REGISTRARS } from "@/lib/pilot/config";
import { defaultSettings, effectiveSettings, smtpStatus } from "@/lib/pilot/settings";
import { mergeStored, parseSettingsPatch, type PilotSettings } from "@/lib/pilot/settingsShared";
import { getPilotStore } from "@/lib/pilot/store";
import { DIRECTORY } from "@/lib/forms/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function view(settings: PilotSettings) {
  const d = defaultSettings();
  return {
    settings,
    smtp: smtpStatus(),
    registrars: PILOT_REGISTRARS.map((r) => ({
      id: r.id, name: r.name,
      formEmail: d.registrars[r.id].email, // what the registrar's own form says (or the server override), shown so a blank box makes sense
      companies: DIRECTORY.filter((e) => e.registrarId === r.id).length,
    })),
  };
}

/** Staff only: current settings. */
export async function GET(req: Request) {
  try {
    if (DATA_SOURCE === "firebase") requireOps(await caller(req));
    return NextResponse.json(await view(effectiveSettings(await (await getPilotStore()).getSettings())));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[pilot] settings load failed", e);
    return NextResponse.json({ error: "Couldn't load the settings." }, { status: 500 });
  }
}

/** Staff only: save changes. Only the fields sent are changed. */
export async function PUT(req: Request) {
  try {
    let who = "staff";
    if (DATA_SOURCE === "firebase") { const c = await caller(req); requireOps(c); who = c.uid; }
    let patch;
    try { patch = parseSettingsPatch(await req.json().catch(() => null)); } catch (e) { throw new HttpError(400, (e as Error).message); }
    const store = await getPilotStore();
    const next = { ...mergeStored(await store.getSettings(), patch), updatedAt: new Date().toISOString(), updatedBy: who };
    await store.saveSettings(next);
    return NextResponse.json(await view(effectiveSettings(next)));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[pilot] settings save failed", e);
    return NextResponse.json({ error: "Couldn't save. Nothing was changed. Try again." }, { status: 500 });
  }
}
