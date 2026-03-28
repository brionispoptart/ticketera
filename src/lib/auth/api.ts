import { NextRequest, NextResponse } from "next/server";
import { getRequestSessionToken, getSessionUser } from "./session";
import { getSetupStatus } from "@/lib/setup";
import { isLeadOrAdmin } from "@/lib/auth/access";

export async function requireApiUser(request: NextRequest) {
  const token = getRequestSessionToken(request);
  const session = await getSessionUser(token);

  if (session) {
    return session;
  }

  const setup = await getSetupStatus();
  if (!setup.isSetupComplete) {
    return NextResponse.json(
      { error: "Initial setup is incomplete. Finish owner setup first." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: "Your session is missing or expired. Sign in again." },
    { status: 401 },
  );
}

export async function requireAdminUser(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
  }

  return session;
}

export async function requireLeadOrAdminUser(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  if (!isLeadOrAdmin(session.user)) {
    return NextResponse.json({ error: "Lead or admin access is required." }, { status: 403 });
  }

  return session;
}
