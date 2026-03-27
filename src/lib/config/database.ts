export type DatabaseProvider = "sqlite" | "postgresql";

const DEFAULT_SQLITE_URL = "file:./dev.db";
const DEFAULT_POSTGRES_URL =
  "postgresql://ticketera:ticketera_local_password@localhost:5432/ticketera?schema=public";

export function getDatabaseProvider(): DatabaseProvider {
  const provider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();

  if (provider === "postgres" || provider === "postgresql") {
    return "postgresql";
  }

  return "sqlite";
}

export function resolveDatabaseUrl(provider = getDatabaseProvider()): string {
  if (provider === "postgresql") {
    return (
      process.env.POSTGRES_DATABASE_URL ||
      process.env.DATABASE_URL ||
      DEFAULT_POSTGRES_URL
    );
  }

  return process.env.SQLITE_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_SQLITE_URL;
}

export function applyDatabaseRuntimeEnv(provider = getDatabaseProvider()) {
  const url = resolveDatabaseUrl(provider);
  process.env.DATABASE_URL = url;

  return {
    provider,
    url,
  };
}

export function getPrismaSchemaPath(provider = getDatabaseProvider()) {
  return provider === "postgresql"
    ? "prisma/schema.postgres.prisma"
    : "prisma/schema.prisma";
}

export function redactDatabaseUrl(url: string) {
  return url.replace(/:\/\/([^:\s]+):([^@\s]+)@/, "://$1:****@");
}
