import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDatabaseProvider } from "@/lib/config/database";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  const startedAt = Date.now();
  const provider = getDatabaseProvider();

  const response = {
    ok: false,
    checks: {
      database: false,
      usersTable: false,
      sessionsTable: false,
      appConfigTable: false,
      adminPresent: false,
      ateraConfigured: false,
      configEncryptionReady: false,
    },
    details: {
      provider,
      adminCount: 0,
      hasStoredAteraApiKey: false,
      hasEnvAteraApiKey: false,
      hasEncryptionKey: false,
      configError: null as string | null,
      elapsedMs: 0,
    },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    response.checks.database = true;

    const [adminCount, sessionCount, appConfigCount, setup] = await Promise.all([
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.session.count(),
      prisma.appConfig.count(),
      getSetupStatus(),
    ]);

    response.checks.usersTable = true;
    response.checks.sessionsTable = sessionCount >= 0;
    response.checks.appConfigTable = appConfigCount >= 0;
    response.checks.adminPresent = adminCount > 0;
    response.details.adminCount = adminCount;

    response.checks.ateraConfigured = setup.hasAteraApiKey;
    response.checks.configEncryptionReady = setup.hasEncryptionKey || !setup.hasStoredAteraApiKey;
    response.details.hasStoredAteraApiKey = setup.hasStoredAteraApiKey;
    response.details.hasEnvAteraApiKey = setup.hasEnvAteraApiKey;
    response.details.hasEncryptionKey = setup.hasEncryptionKey;
    response.details.configError = setup.configurationError;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        ...response,
        error: message,
        details: {
          ...response.details,
          elapsedMs: Date.now() - startedAt,
        },
      },
      { status: 503 },
    );
  }

  response.ok =
    response.checks.database &&
    response.checks.usersTable &&
    response.checks.sessionsTable &&
    response.checks.appConfigTable &&
    response.checks.adminPresent &&
    response.checks.ateraConfigured &&
    response.checks.configEncryptionReady;
  response.details.elapsedMs = Date.now() - startedAt;

  return NextResponse.json(response, {
    status: response.ok ? 200 : 503,
  });
}
