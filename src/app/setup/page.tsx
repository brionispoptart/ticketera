import { redirect } from "next/navigation";
import { SetupForm } from "@/components/setup-form";
import { getCurrentSession } from "@/lib/auth/server";
import { getSetupStatus } from "@/lib/setup";

export default async function SetupPage() {
  const [status, session] = await Promise.all([getSetupStatus(), getCurrentSession()]);

  if (status.isSetupComplete) {
    redirect(session ? "/" : "/login");
  }

  return (
    <main className="login-screen-bg relative min-h-screen overflow-hidden px-4 py-10 text-zinc-100 sm:px-6 lg:px-8">
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl items-center justify-center">
        <section className="w-full">
          <SetupForm needsAdminCreation={status.needsAdminCreation} />
        </section>
      </div>
    </main>
  );
}