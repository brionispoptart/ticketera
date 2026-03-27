import { NextRequest, NextResponse } from "next/server";
import { jsonWithEntityTag } from "@/lib/api-response-cache";
import { requireApiUser } from "@/lib/auth/api";
import { getOrCreateDirectConversation, listChatConversationsForUser } from "@/lib/chat";
import { createConversationRequestSchema, getValidationErrorMessage } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const items = await listChatConversationsForUser(session.user.id);
    return jsonWithEntityTag(request, { items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const parsedBody = createConversationRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const { userId } = parsedBody.data;
    const item = await getOrCreateDirectConversation(session.user.id, userId);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}