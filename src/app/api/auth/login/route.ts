import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getSetupStatus } from "@/lib/setup";
import { getValidationErrorMessage, loginRequestSchema } from "@/lib/validation";
import {
  createSession,
  recordAuditLog,
  setSessionCookie,
} from "@/lib/auth/session";

type LoginUserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  employeeId: string;
  technicianLevel: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS || "5");
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES || "15");

function lockoutExpiration() {
  return new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
}

export async function POST(request: NextRequest) {
  try {
    const setup = await getSetupStatus();
    if (!setup.isSetupComplete) {
      return NextResponse.json(
        { error: "Initial setup is incomplete. Finish setup before signing in." },
        { status: 503 },
      );
    }

    const parsedBody = loginRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const { email, password } = parsedBody.data;
    const clientIp = getClientIp(request);
    const ipLimit = checkRateLimit({
      scope: "auth.login.ip",
      key: clientIp,
      limit: 25,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts from this address. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      );
    }

    const credentialLimit = checkRateLimit({
      scope: "auth.login.credential",
      key: `${clientIp}:${email}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!credentialLimit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts for this account. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(credentialLimit.retryAfterSeconds) } },
      );
    }

    const user = (await prisma.user.findUnique({
      where: { email },
    })) as LoginUserRecord | null;

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "This account is inactive. Contact an administrator." },
        { status: 403 },
      );
    }

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      await recordAuditLog({
        actorUserId: user.id,
        action: "auth.login_blocked_locked",
        targetType: "user",
        targetId: user.id,
        metadata: { lockedUntil: user.lockedUntil.toISOString() },
      });

      return NextResponse.json(
        {
          error: `This account is temporarily locked until ${user.lockedUntil.toLocaleString()}. Contact an administrator if you need immediate access.`,
        },
        { status: 423 },
      );
    }

    let failedLoginAttemptsBase = user.failedLoginAttempts;
    if (user.lockedUntil && user.lockedUntil.getTime() <= now) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      failedLoginAttemptsBase = 0;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      const failedLoginAttempts = failedLoginAttemptsBase + 1;
      const shouldLock = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock ? lockoutExpiration() : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts,
          lockedUntil,
        },
      });

      await recordAuditLog({
        actorUserId: user.id,
        action: "auth.login_failed",
        targetType: "user",
        targetId: user.id,
        metadata: {
          email,
          failedLoginAttempts,
          shouldLock,
          lockedUntil: lockedUntil?.toISOString() || null,
        },
      });

      if (shouldLock && lockedUntil) {
        await recordAuditLog({
          actorUserId: user.id,
          action: "auth.account_locked",
          targetType: "user",
          targetId: user.id,
          metadata: { lockedUntil: lockedUntil.toISOString() },
        });

        return NextResponse.json(
          {
            error: `Too many failed sign-in attempts. This account is locked until ${lockedUntil.toLocaleString()}.`,
          },
          { status: 423 },
        );
      }

      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const { token, expiresAt } = await createSession(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await recordAuditLog({
      actorUserId: user.id,
      action: "auth.login_succeeded",
      targetType: "user",
      targetId: user.id,
      metadata: { mustChangePassword: user.mustChangePassword },
    });

    const response = NextResponse.json({
      ok: true,
      redirectTo: user.mustChangePassword ? "/change-password" : "/",
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
