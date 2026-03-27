import { ensureBootstrapAdmin } from "../src/lib/auth/bootstrap-admin";

async function main() {
  const result = await ensureBootstrapAdmin();

  if (!result.created) {
    console.log(`[auth-bootstrap] Admin already exists (${result.email}).`);
    return;
  }

  console.log(`[auth-bootstrap] Created initial admin account: ${result.email}`);
  console.log("[auth-bootstrap] Temporary password (rotate immediately):");
  console.log(result.temporaryPassword);
  console.log("[auth-bootstrap] The account is marked mustChangePassword=true.");
}

main()
  .catch((error) => {
    console.error("[auth-bootstrap] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
