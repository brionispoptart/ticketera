import { redirect } from "next/navigation";
import { AdminWorkLogsPanel } from "@/components/admin-work-logs-panel";
import { isLeadOrAdmin } from "@/lib/auth/access";
import { requireCurrentUser } from "@/lib/auth/server";

export default async function AdminHoursPage() {
  const session = await requireCurrentUser();

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const canViewAll = isLeadOrAdmin(session.user);

  return (
    <main className="login-screen-bg min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <AdminWorkLogsPanel currentUser={session.user} canViewAll={canViewAll} />
      </div>
    </main>
  );
}