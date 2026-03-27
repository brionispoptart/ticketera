import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { validatePasswordStrength, verifyPassword, hashPassword } from "@/lib/auth/password";
import { deleteOtherSessionsForUser, recordAuditLog } from "@/lib/auth/session";
import { changePasswordRequestSchema, getValidationErrorMessage } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const parsedBody = changePasswordRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const { currentPassword, newPassword, confirmPassword } = parsedBody.data;
    const rateLimit = checkRateLimit({
      scope: "auth.change-password",
      key: `${session.user.id}:${getClientIp(request)}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many password change attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "New password confirmation does not match." }, { status: 400 });
    }

    if (newPassword === currentPassword) {
      return NextResponse.json({ error: "New password must be different from the current password." }, { status: 400 });
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentMatches = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentMatches) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    const nextHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: nextHash,
        mustChangePassword: false,
      },
    });

    await deleteOtherSessionsForUser(user.id, session.sessionId);
    await recordAuditLog({
      actorUserId: user.id,
      action: "auth.password_changed",
      targetType: "user",
      targetId: user.id,
    });

    return NextResponse.json({ ok: true, redirectTo: "/" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
