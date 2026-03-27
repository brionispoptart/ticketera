import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock3, Settings } from "lucide-react";
import { TicketApp } from "@/components/ticket-app";
import { LogoutButton } from "@/components/logout-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireCurrentUser } from "@/lib/auth/server";
import { getAppBranding } from "@/lib/setup";

export default async function Home() {
  const [session, branding] = await Promise.all([requireCurrentUser(), getAppBranding()]);

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
