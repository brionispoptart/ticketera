import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, getSessionUser } from "./session";
import { getSetupStatus } from "@/lib/setup";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getSessionUser(token);
}

export async function requireCurrentUser() {
  const session = await getCurrentSession();
  if (session) {
    return session;
  }

  const setup = await getSetupStatus();
  if (!setup.isSetupComplete) {
    redirect("/setup");
  }

  redirect("/login");
}
