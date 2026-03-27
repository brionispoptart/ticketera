import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { deleteConversation, setConversationPinned } from "@/lib/chat";
import type { IdRouteContext } from "@/lib/types/api";

export async function PATCH(request: NextRequest, { params }: IdRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { pinned?: boolean } | null;

    if (typeof body?.pinned !== "boolean") {
      return NextResponse.json({ error: "Pinned state is required." }, { status: 400 });
    }

    const item = await setConversationPinned(session.user.id, id, body.pinned);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Conversation not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: IdRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id } = await params;
    await deleteConversation(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Conversation not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}