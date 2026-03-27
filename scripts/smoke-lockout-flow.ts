import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

const baseUrl = process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000";
const maxFailedAttempts = Number(process.env.AUTH_MAX_FAILED_LOGIN_ATTEMPTS || "5");
const lockoutMinutes = Number(process.env.AUTH_LOCKOUT_MINUTES || "15");

async function main() {
  const unique = Date.now();
  const email = `lockout.${unique}@local`;
  const employeeId = `LOCK-${unique}`;
  const correctPassword = "CorrectHorseBattery9";

  const user = await prisma.user.create({
    data: {
      email,
      firstName: "Lockout",
      lastName: "Tester",
      employeeId,
      role: "TECHNICIAN",
      technicianLevel: "L1",
      isActive: true,
      mustChangePassword: false,
      passwordHash: await hashPassword(correctPassword),
    },
  });

  try {
    for (let attempt = 1; attempt <= maxFailedAttempts; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password" }),
      });
      const payload = await response.json();
      console.log("[auth-smoke-lockout] wrong-attempt", attempt, response.status, payload);
      if (attempt < maxFailedAttempts && response.status !== 401) {
        throw new Error(`Expected 401 before lockout, got ${response.status}`);
      }
      if (attempt === maxFailedAttempts && response.status !== 423) {
        throw new Error(`Expected 423 on lockout threshold, got ${response.status}`);
      }
    }

    const lockedResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: correctPassword }),
    });
    const lockedPayload = await lockedResponse.json();
    console.log("[auth-smoke-lockout] locked-correct-password", lockedResponse.status, lockedPayload);
    if (lockedResponse.status !== 423) {
      throw new Error(`Expected 423 while locked, got ${lockedResponse.status}`);
    }

    console.log("[auth-smoke-lockout] success", { maxFailedAttempts, lockoutMinutes });
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[auth-smoke-lockout] failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
