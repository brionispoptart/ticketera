import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentSession } from "@/lib/auth/server";
import { getAppBranding, getSetupStatus } from "@/lib/setup";

export default async function LoginPage() {
  const [setup, session, branding] = await Promise.all([getSetupStatus(), getCurrentSession(), getAppBranding()]);

  if (!setup.isSetupComplete) {
    redirect("/setup");
  }

  if (session?.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (session) {
    redirect("/");
  }

  return (
    <main className="login-screen-bg relative h-[100svh] min-h-[100svh] overflow-hidden px-4 py-4 text-zinc-100 sm:min-h-screen sm:px-6 sm:py-10 lg:px-8">
      <div className="relative mx-auto flex h-full w-full max-w-md items-center justify-center sm:min-h-[calc(100vh-5rem)] sm:h-auto">
        <section className="w-full">
          <LoginForm branding={branding} />
        </section>
      </div>
    </main>
  );
}
