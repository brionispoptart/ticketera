import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function ChangePasswordPage() {
  const session = await requireCurrentUser();

  if (!session.user.mustChangePassword) {
    redirect("/");
  }

  return (
    <main className="login-screen-bg relative min-h-screen overflow-hidden px-4 py-10 text-zinc-100 sm:px-6 lg:px-8">
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
