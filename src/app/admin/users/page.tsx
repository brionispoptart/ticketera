import { redirect } from "next/navigation";
import { AdminUsersPanel } from "@/components/admin-users-panel";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function AdminUsersPage() {
  const session = await requireCurrentUser();

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <main className="login-screen-bg min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1024px]">
        <AdminUsersPanel currentUserId={session.user.id} />
      </div>
    </main>
  );
}
