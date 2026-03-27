import { redirect } from "next/navigation";
import { ChatInbox } from "@/components/chat-inbox";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function ChatPage() {
  const session = await requireCurrentUser();

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <main className="h-[100dvh] overflow-hidden px-0 py-0 bg-black">
      <div className="flex h-full w-full flex-col">
        <ChatInbox currentUserId={session.user.id} />
      </div>
    </main>
  );
}