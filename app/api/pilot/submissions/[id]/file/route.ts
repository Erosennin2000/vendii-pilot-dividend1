import { NextResponse } from "next/server";
import { DATA_SOURCE } from "@/lib/config";
import { HttpError, caller, requireOps } from "@/lib/server/http";
import { getPilotStore } from "@/lib/pilot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Staff only: one of the PDFs that went out, e.g. ?name=mandate-coronation or ?name=authority-first. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    if (DATA_SOURCE === "firebase") requireOps(await caller(req));
    const name = new URL(req.url).searchParams.get("name") ?? "";
    const store = await getPilotStore();
    const sub = await store.get(params.id);
    const file = sub?.files.find((f) => f.name === name);
    if (!sub || !file) throw new HttpError(404, "That file isn't on this submission.");
    const bytes = await store.readFile(file.path);
    return new NextResponse(Buffer.from(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${file.filename}"` },
    });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[pilot] file failed", e);
    return NextResponse.json({ error: "Couldn't load that file." }, { status: 500 });
  }
}
