import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listUnreadChatConversationsForUser } from "@/lib/chat";

export async function GET(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const items = await listUnreadChatConversationsForUser(session.user.id);
    const unreadCount = items.reduce((total, conversation) => total + conversation.unreadCount, 0);
    return NextResponse.json({ unreadCount, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}