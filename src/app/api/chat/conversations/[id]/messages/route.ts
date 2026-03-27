import { NextRequest, NextResponse } from "next/server";
import { jsonWithEntityTag } from "@/lib/api-response-cache";
import { requireApiUser } from "@/lib/auth/api";
import { listMessagesForConversation, sendConversationMessage } from "@/lib/chat";
import type { IdRouteContext } from "@/lib/types/api";

export async function GET(request: NextRequest, { params }: IdRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id } = await params;
    const items = await listMessagesForConversation(session.user.id, id);
    return jsonWithEntityTag(request, { items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Conversation not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: IdRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { body?: string } | null;
    const item = await sendConversationMessage(session.user.id, id, typeof body?.body === "string" ? body.body : "");
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Message is required." ? 400 : message === "Conversation not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}