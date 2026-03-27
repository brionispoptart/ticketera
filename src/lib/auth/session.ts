import { createHash, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "../db";

export const SESSION_COOKIE_NAME = "ticketera_session";
const SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || "12");

function sessionExpiryDate() {
  return new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  avatarUrl: string | null;
  technicianLevel: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
};

export function toAuthUser(user: AuthUser) {
  return {
    ...user,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = sessionExpiryDate();

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined) {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          avatarUrl: true,
          technicianLevel: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
        },
      },
    },
  });

  if (!session || !session.user.isActive) {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return {
    sessionId: session.id,
    user: toAuthUser(session.user),
  };
}

export async function deleteSession(token: string | undefined) {
  if (!token) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: hashToken(token),
    },
  });
}

export async function deleteOtherSessionsForUser(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: {
      userId,
      id: exceptSessionId ? { not: exceptSessionId } : undefined,
    },
  });
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, buildCookieOptions(expiresAt));
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...buildCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export function getRequestSessionToken(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export async function recordAuditLog(input: {
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
