import { join } from "path";
import { spawnSync } from "child_process";
import {
  applyDatabaseRuntimeEnv,
  getDatabaseProvider,
  getPrismaSchemaPath,
  redactDatabaseUrl,
} from "../src/lib/config/database";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("[prisma-runner] Missing Prisma command. Example: tsx scripts/prisma.ts generate");
  process.exit(1);
}

const provider = getDatabaseProvider();
const schemaPath = getPrismaSchemaPath(provider);
const { url } = applyDatabaseRuntimeEnv(provider);
const prismaCliPath = join(process.cwd(), "node_modules", "prisma", "build", "index.js");

console.log(`[prisma-runner] provider=${provider}`);
console.log(`[prisma-runner] schema=${schemaPath}`);
console.log(`[prisma-runner] database=${redactDatabaseUrl(url)}`);

const result = spawnSync(process.execPath, [prismaCliPath, ...args, "--schema", schemaPath], {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    DATABASE_URL: url,
  },
});

if (result.error) {
  console.error("[prisma-runner] Failed to execute Prisma:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
