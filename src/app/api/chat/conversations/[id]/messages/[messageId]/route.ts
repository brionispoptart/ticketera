import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { deleteConversationMessage, setConversationMessagePinned } from "@/lib/chat";

type MessageRouteContext = {
  params: Promise<{
    id: string;
    messageId: string;
  }>;
};

export async function PATCH(request: NextRequest, { params }: MessageRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id, messageId } = await params;
    const body = (await request.json().catch(() => null)) as { pinned?: boolean } | null;

    if (typeof body?.pinned !== "boolean") {
      return NextResponse.json({ error: "Pinned state is required." }, { status: 400 });
    }

    const item = await setConversationMessagePinned(session.user.id, id, messageId, body.pinned);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Conversation not found." || message === "Message not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: MessageRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id, messageId } = await params;
    await deleteConversationMessage(session.user.id, id, messageId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message === "Conversation not found." || message === "Message not found." ? 404
      : message === "You can only delete your own messages." ? 403
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}