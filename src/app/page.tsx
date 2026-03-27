import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock3, MessageSquareMore, Settings } from "lucide-react";
import { TicketApp } from "@/components/ticket-app";
import { LogoutButton } from "@/components/logout-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireCurrentUser } from "@/lib/auth/server";
import { countUnreadMessagesForUser } from "@/lib/chat";
import { getAppBranding } from "@/lib/setup";

export default async function Home() {
  const [session, branding] = await Promise.all([requireCurrentUser(), getAppBranding()]);
  const unreadMessages = await countUnreadMessagesForUser(session.user.id);

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <main className="min-h-screen bg-black px-4 py-4 sm:px-6 sm:py-8 lg:px-0">
      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4 sm:gap-6">
      <section className="rounded-[28px] border border-zinc-800 bg-zinc-950/80 px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.3)] sm:px-5 sm:py-5">
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
            {branding.hasAteraBranding ? "Connected workspace" : "Signed in"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xl font-semibold text-zinc-50">{session.user.fullName || session.user.email}</div>
            {branding.hasAteraBranding && session.user.role === "ADMIN" ? (
              <div className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                {branding.displayName}
              </div>
            ) : null}
          </div>
          <div className="text-sm leading-6 text-zinc-400">
            {session.user.role} · {session.user.employeeId} · {session.user.technicianLevel}
            {branding.hasAteraBranding && branding.location ? ` · ${branding.location}` : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 w-full">
          <Link
            href="/chat"
            className={cn(
              buttonVariants({ size: "icon" }),
              "ticket-action-btn relative h-11 w-11 rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-300 hover:border-sky-300/40 hover:bg-sky-400/15 hover:text-sky-200",
            )}
            aria-label={unreadMessages > 0 ? `Message center with ${unreadMessages} unread messages` : "Message center"}
            title={unreadMessages > 0 ? `${unreadMessages} unread messages` : "Message center"}
          >
            <MessageSquareMore className="h-5 w-5 stroke-[2.1]" />
            {unreadMessages > 0 ? (
              <span
                className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-zinc-950 bg-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.28)]"
                aria-hidden="true"
              />
            ) : null}
          </Link>
          {session.user.role === "ADMIN" ? (
            <Link
              href="/admin/users"
              className={cn(
                buttonVariants({ size: "icon" }),
                "ticket-action-btn h-11 w-11 rounded-xl border border-zinc-700 bg-zinc-900/85 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-50",
              )}
              aria-label="Admin panel"
              title="Admin panel"
            >
              <Settings className="h-[18px] w-[18px] stroke-[2.15]" />
            </Link>
          ) : null}
          <Link
            href="/admin/hours"
            className={cn(
              buttonVariants({ size: "icon" }),
              "ticket-action-btn h-11 w-11 rounded-xl border border-zinc-700 bg-zinc-900/85 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-50",
            )}
            aria-label="Hours"
            title="Hours"
          >
            <Clock3 className="h-[18px] w-[18px] stroke-[2.15]" />
          </Link>
          <LogoutButton className="ml-auto" />
          </div>
        </div>
      </section>

      <TicketApp brand={branding} />
      </div>
    </main>
  );
}
