import { NextRequest, NextResponse } from "next/server";
import { deleteSession, clearSessionCookie, getRequestSessionToken, recordAuditLog } from "@/lib/auth/session";
import { requireApiUser } from "@/lib/auth/api";

export async function POST(request: NextRequest) {
  const session = await requireApiUser(request);
  const token = getRequestSessionToken(request);

  if (!(session instanceof NextResponse)) {
    await recordAuditLog({
      actorUserId: session.user.id,
      action: "auth.logout",
      targetType: "user",
      targetId: session.user.id,
    });
  }

  await deleteSession(token);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
