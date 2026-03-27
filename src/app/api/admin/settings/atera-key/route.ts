import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/api";
import { testAteraConnection } from "@/lib/atera";
import { clearStoredAteraApiKey, getAteraKeySettingsStatus, saveAteraApiKey } from "@/lib/setup";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const item = await getAteraKeySettingsStatus();
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const ateraApiKey = typeof body?.ateraApiKey === "string" ? body.ateraApiKey : "";
    await saveAteraApiKey(ateraApiKey, admin.user.id);
    const item = await getAteraKeySettingsStatus();
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const result = await testAteraConnection();
    return NextResponse.json({
      ok: true,
      result,
      message: result.label || result.email
        ? `Connected to Atera${result.label ? ` for ${result.label}` : ""}${result.email ? ` (${result.email})` : ""}.`
        : "Connected to Atera successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    await clearStoredAteraApiKey(admin.user.id);
    const item = await getAteraKeySettingsStatus();
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}