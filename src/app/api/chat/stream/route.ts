import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listChatConversationsForUser } from "@/lib/chat";
import type { ChatConversationSummary } from "@/lib/types/chat";

const STREAM_TICK_MS = 2500;

type StreamPayload = {
  unreadCount: number;
  unreadItems?: ChatConversationSummary[];
  conversationSignature: string;
  selectedConversationId: string | null;
  selectedConversationState: string;
  timestamp: number;
};

function createConversationSignature(items: Array<{ id: string; lastMessageAt: string | null; unreadCount: number; isPinned: boolean; pinnedAt: string | null }>) {
  return items
    .map((item) => `${item.id}:${item.lastMessageAt || ""}:${item.unreadCount}:${item.isPinned ? 1 : 0}:${item.pinnedAt || ""}`)
    .join("|");
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  const url = new URL(request.url);
  const selectedConversationId = url.searchParams.get("conversationId");
  const includeUnreadItems = url.searchParams.get("includeUnread") === "1";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let previousSignature = "";
      let previousSelectedState = "";
      let isClosed = false;

      const emit = (event: string, payload: StreamPayload) => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const emitHeartbeat = () => {
        if (isClosed) {
          return;
        }

        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      };

      const tick = async () => {
        if (isClosed) {
          return;
        }

        try {
          const items = await listChatConversationsForUser(session.user.id);
          const unreadCount = items.reduce((total, conversation) => total + conversation.unreadCount, 0);
          const unreadItems = includeUnreadItems
            ? items
                .filter((conversation) => conversation.unreadCount > 0)
                .sort((left, right) => {
                  const leftTime = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
                  const rightTime = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
                  return rightTime - leftTime;
                })
            : undefined;
          const signature = createConversationSignature(items);
          const selectedConversation = selectedConversationId ? items.find((item) => item.id === selectedConversationId) : null;
          const selectedState = selectedConversation
            ? `${selectedConversation.lastMessageAt || ""}:${selectedConversation.unreadCount}:${selectedConversation.isPinned ? 1 : 0}`
            : "none";

          if (signature !== previousSignature || selectedState !== previousSelectedState) {
            previousSignature = signature;
            previousSelectedState = selectedState;

            emit("chat-update", {
              unreadCount,
              unreadItems,
              conversationSignature: signature,
              selectedConversationId,
              selectedConversationState: selectedState,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Keep the stream open and rely on the next tick.
        }
      };

      const intervalId = setInterval(() => {
        void tick();
        emitHeartbeat();
      }, STREAM_TICK_MS);

      const abortHandler = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;
        clearInterval(intervalId);
        request.signal.removeEventListener("abort", abortHandler);
        controller.close();
      };

      request.signal.addEventListener("abort", abortHandler);

      void tick();
    },
    cancel() {
      // No-op: abort handler handles interval cleanup.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}