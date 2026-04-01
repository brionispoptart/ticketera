import { redirect } from "next/navigation";
import { TeamCalendarPanel } from "@/components/team-calendar-panel";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function CalendarPage() {
  const session = await requireCurrentUser();

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <main className="login-screen-bg min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1024px]">
        <TeamCalendarPanel currentUserId={session.user.id} />
      </div>
    </main>
  );
}
