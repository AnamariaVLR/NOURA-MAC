/** Reloads the seed data. Dev tool: refuses to run unless explicitly allowed. */
import { NextResponse } from "next/server";
import { seedEndpointAllowed } from "@/lib/config";
import { prisma } from "@/lib/db";
import { runSeed } from "@/prisma/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!seedEndpointAllowed()) {
    return NextResponse.json(
      { error: "Seeding is disabled. Set ALLOW_SEED_ENDPOINT=1 to enable it." },
      { status: 403 },
    );
  }

  try {
    const summary = await runSeed(prisma);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[api/seed] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Seeding failed." },
      { status: 500 },
    );
  }
}
