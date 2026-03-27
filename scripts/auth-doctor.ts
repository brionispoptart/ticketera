import { prisma } from "../src/lib/db";
import {
  applyDatabaseRuntimeEnv,
  getDatabaseProvider,
  getPrismaSchemaPath,
  redactDatabaseUrl,
} from "../src/lib/config/database";

async function main() {
  const checks: Array<{ name: string; ok: boolean; details: string }> = [];
  const provider = getDatabaseProvider();
  const schemaPath = getPrismaSchemaPath(provider);
  const { url } = applyDatabaseRuntimeEnv(provider);

  checks.push({
    name: "Database provider",
    ok: true,
    details: provider,
  });

  checks.push({
    name: "Prisma schema",
    ok: true,
    details: schemaPath,
  });

  checks.push({
    name: "DATABASE_URL",
    ok: Boolean(url),
    details: url ? redactDatabaseUrl(url) : "missing",
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: "Database connection", ok: true, details: "reachable" });
  } catch (error) {
    checks.push({
      name: "Database connection",
      ok: false,
      details: error instanceof Error ? error.message : "unknown error",
    });
  }

  try {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    checks.push({
      name: "Admin presence",
      ok: adminCount > 0,
      details: adminCount > 0 ? `${adminCount} admin user(s)` : "no admin user found",
    });
  } catch {
    checks.push({ name: "Admin presence", ok: false, details: "users table unavailable" });
  }

  try {
    await prisma.session.count();
    checks.push({ name: "Session table", ok: true, details: "reachable" });
  } catch {
    checks.push({ name: "Session table", ok: false, details: "session table unavailable" });
  }

  console.log("[auth-doctor] Auth diagnostics");
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.details}`);
  }

  const hasFailure = checks.some((check) => !check.ok);
  if (hasFailure) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[auth-doctor] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
