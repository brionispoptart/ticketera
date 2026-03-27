import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

const APP_CONFIG_ID = "global";
const ENCRYPTED_VALUE_PREFIX = "enc:v1";
const ATERA_API_BASE = process.env.ATERA_API_BASE || "https://app.atera.com/api/v3";

type AppConfigRecord = {
  id: string;
  ateraApiKey: string | null;
  ateraAccountId: string | null;
  ateraCompanyName: string | null;
  ateraHomepageUrl: string | null;
  ateraLocation: string | null;
  ateraPlan: string | null;
  setupCompletedAt: Date | null;
  updatedAt: Date;
};

type AteraAccountBranding = Pick<AppConfigRecord, "ateraAccountId" | "ateraCompanyName" | "ateraHomepageUrl" | "ateraLocation" | "ateraPlan">;

export type AppBranding = {
  displayName: string;
  accountId: string | null;
  homepageUrl: string | null;
  location: string | null;
  plan: string | null;
  hasAteraBranding: boolean;
  storageKey: string;
};

export type SetupStatus = {
  adminCount: number;
  hasAdmin: boolean;
  hasStoredAteraApiKey: boolean;
  hasEnvAteraApiKey: boolean;
  hasAteraApiKey: boolean;
  hasEncryptionKey: boolean;
  configurationError: string | null;
  needsAdminCreation: boolean;
  isSetupComplete: boolean;
};

export type AteraKeySettingsStatus = {
  source: "stored" | "environment" | "missing";
  hasStoredKey: boolean;
  hasEnvFallback: boolean;
  hasEncryptionKey: boolean;
  isStoredEncrypted: boolean;
  updatedAt: string | null;
  maskedValue: string | null;
  configurationError: string | null;
};

export type InitialSetupInput = {
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  password: string;
  ateraApiKey: string;
};

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeEmail(value: string) {
  return normalizeRequired(value, "Email").toLowerCase();
}

function normalizeOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildLocation(city: string | null, country: string | null) {
  const parts = [city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function toStorageKeySegment(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "ticketera";
}

function emptyAteraAccountBranding(): AteraAccountBranding {
  return {
    ateraAccountId: null,
    ateraCompanyName: null,
    ateraHomepageUrl: null,
    ateraLocation: null,
    ateraPlan: null,
  };
}

function normalizeHomepageUrl(value: unknown) {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    return `https://${normalized}`;
  }

  return null;
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function getEncryptionSecret() {
  return process.env.APP_CONFIG_ENCRYPTION_KEY?.trim() || null;
}

function requireEncryptionSecret() {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error("Missing APP_CONFIG_ENCRYPTION_KEY. Configure it before storing the Atera API key.");
  }
  return secret;
}

function deriveEncryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function isEncryptedValue(value: string) {
  return value.startsWith(`${ENCRYPTED_VALUE_PREFIX}:`);
}

function encryptStoredSecret(value: string) {
  const key = deriveEncryptionKey(requireEncryptionSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_VALUE_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptStoredSecret(value: string) {
  if (!isEncryptedValue(value)) {
    return value;
  }

  const [, version, ivPart, tagPart, encryptedPart] = value.split(":");
  if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) {
    throw new Error("Stored Atera API key has an invalid encrypted format.");
  }

  const key = deriveEncryptionKey(requireEncryptionSecret());
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function maskSecret(value: string | null) {
  if (!value) {
    return null;
  }

  const suffix = value.slice(-4);
  return `••••••••${suffix}`;
}

async function fetchAteraAccountBrandingForKey(apiKey: string): Promise<AteraAccountBranding> {
  const response = await fetch(`${ATERA_API_BASE}/account`, {
    headers: {
      "X-API-KEY": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Atera authentication failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const accountId = normalizeOptional(payload?.AccountID);
  const companyName = normalizeOptional(payload?.CompanyName);
  const homepageUrl = normalizeHomepageUrl(
    payload?.WebsiteUrl ?? payload?.Website ?? payload?.Links ?? payload?.Link ?? payload?.Domain,
  );
  const city = normalizeOptional(payload?.City);
  const country = normalizeOptional(payload?.Country);
  const plan = normalizeOptional(payload?.Plan);

  return {
    ateraAccountId: accountId,
    ateraCompanyName: companyName,
    ateraHomepageUrl: homepageUrl,
    ateraLocation: buildLocation(city, country),
    ateraPlan: plan,
  };
}

async function getAppConfigRecord(): Promise<AppConfigRecord | null> {
  const config = await prisma.appConfig.findUnique({
    where: { id: APP_CONFIG_ID },
    select: {
      id: true,
      ateraApiKey: true,
      ateraAccountId: true,
      ateraCompanyName: true,
      ateraHomepageUrl: true,
      ateraLocation: true,
      ateraPlan: true,
      setupCompletedAt: true,
      updatedAt: true,
    },
  });

  return (config as AppConfigRecord | null) ?? null;
}

export async function getConfiguredAteraApiKey() {
  const config = await getAppConfigRecord();
  const storedKey = config?.ateraApiKey?.trim();
  if (storedKey) {
    return decryptStoredSecret(storedKey);
  }

  const envKey = process.env.ATERA_API_KEY?.trim();
  return envKey || null;
}

export async function getAppBranding(): Promise<AppBranding> {
  const config = await getAppConfigRecord();
  let accountId = config?.ateraAccountId?.trim() || null;
  let companyName = config?.ateraCompanyName?.trim() || null;
  let homepageUrl = config?.ateraHomepageUrl?.trim() || null;
  let location = config?.ateraLocation?.trim() || null;
  let plan = config?.ateraPlan?.trim() || null;

  if (!companyName && !accountId) {
    try {
      const configuredKey = await getConfiguredAteraApiKey();
      if (configuredKey) {
        const liveBranding = await fetchAteraAccountBrandingForKey(configuredKey);
        accountId = liveBranding.ateraAccountId;
        companyName = liveBranding.ateraCompanyName;
        homepageUrl = liveBranding.ateraHomepageUrl;
        location = liveBranding.ateraLocation;
        plan = liveBranding.ateraPlan;

        if (config) {
          await prisma.appConfig.update({
            where: { id: config.id },
            data: liveBranding,
          });
        }
      }
    } catch {
      // Leave branding on the Ticketera fallback if the current key cannot be resolved.
    }
  }

  const hasAteraBranding = Boolean(companyName || accountId);
  const displayName = companyName || (accountId ? `Atera Account ${accountId}` : "Ticketera");
  const storageKeyBase = accountId || displayName;

  return {
    displayName,
    accountId,
    homepageUrl,
    location,
    plan,
    hasAteraBranding,
    storageKey: toStorageKeySegment(storageKeyBase),
  };
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const [adminCount, config] = await Promise.all([
    prisma.user.count({ where: { role: "ADMIN" } }),
    getAppConfigRecord(),
  ]);

  const hasStoredAteraApiKey = Boolean(config?.ateraApiKey?.trim());
  const hasEnvAteraApiKey = Boolean(process.env.ATERA_API_KEY?.trim());
  const hasEncryptionKey = Boolean(getEncryptionSecret());
  const hasAdmin = adminCount > 0;
  let configurationError: string | null = null;
  let hasAteraApiKey = hasEnvAteraApiKey;

  if (hasStoredAteraApiKey) {
    try {
      hasAteraApiKey = Boolean(await getConfiguredAteraApiKey());
    } catch (error) {
      configurationError = error instanceof Error ? error.message : "Unable to read stored Atera API key.";
    }
  }

  return {
    adminCount,
    hasAdmin,
    hasStoredAteraApiKey,
    hasEnvAteraApiKey,
    hasAteraApiKey,
    hasEncryptionKey,
    configurationError,
    needsAdminCreation: !hasAdmin,
    isSetupComplete: hasAdmin && hasAteraApiKey && !configurationError,
  };
}

export async function getAteraKeySettingsStatus(): Promise<AteraKeySettingsStatus> {
  const config = await getAppConfigRecord();
  const storedValue = config?.ateraApiKey?.trim() || null;
  const envValue = process.env.ATERA_API_KEY?.trim() || null;
  const hasStoredKey = Boolean(storedValue);
  const hasEnvFallback = !hasStoredKey && Boolean(envValue);
  const hasEncryptionKey = Boolean(getEncryptionSecret());
  let configurationError: string | null = null;
  let maskedValue: string | null = null;

  if (storedValue) {
    try {
      maskedValue = maskSecret(decryptStoredSecret(storedValue));
    } catch (error) {
      configurationError = error instanceof Error ? error.message : "Unable to read stored Atera API key.";
    }
  } else if (envValue) {
    maskedValue = maskSecret(envValue);
  }

  return {
    source: storedValue ? "stored" : envValue ? "environment" : "missing",
    hasStoredKey,
    hasEnvFallback,
    hasEncryptionKey,
    isStoredEncrypted: Boolean(storedValue && isEncryptedValue(storedValue)),
    updatedAt: config?.updatedAt?.toISOString() || null,
    maskedValue,
    configurationError,
  };
}

export async function saveAteraApiKey(ateraApiKey: string, actorUserId?: string) {
  const normalized = normalizeRequired(ateraApiKey, "Atera API key");
  const encryptedValue = encryptStoredSecret(normalized);
  const branding = await fetchAteraAccountBrandingForKey(normalized);

  await prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    update: {
      ateraApiKey: encryptedValue,
      ...branding,
      setupCompletedAt: new Date(),
    },
    create: {
      id: APP_CONFIG_ID,
      ateraApiKey: encryptedValue,
      ...branding,
      setupCompletedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: actorUserId ? "admin.atera_key_rotated" : "app.setup_completed",
      targetType: "app",
      metadata: JSON.stringify({
        source: actorUserId ? "admin_settings" : "setup",
        companyName: branding.ateraCompanyName,
        accountId: branding.ateraAccountId,
      }),
    },
  });
}

export async function clearStoredAteraApiKey(actorUserId: string) {
  const envKey = process.env.ATERA_API_KEY?.trim() || null;
  const fallbackBranding = envKey
    ? await fetchAteraAccountBrandingForKey(envKey).catch(() => emptyAteraAccountBranding())
    : emptyAteraAccountBranding();

  await prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    update: {
      ateraApiKey: null,
      ...fallbackBranding,
      setupCompletedAt: process.env.ATERA_API_KEY?.trim() ? new Date() : null,
    },
    create: {
      id: APP_CONFIG_ID,
      ateraApiKey: null,
      ...fallbackBranding,
      setupCompletedAt: process.env.ATERA_API_KEY?.trim() ? new Date() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "admin.atera_key_cleared",
      targetType: "app",
      metadata: JSON.stringify({ source: "admin_settings" }),
    },
  });
}

export async function completeInitialSetup(input: InitialSetupInput) {
  const ateraApiKey = normalizeRequired(input.ateraApiKey, "Atera API key");
  const branding = await fetchAteraAccountBrandingForKey(ateraApiKey);

  const status = await getSetupStatus();
  if (status.isSetupComplete) {
    throw new Error("Initial setup has already been completed.");
  }

  if (!status.hasAdmin) {
    const email = normalizeEmail(input.email);
    const firstName = normalizeRequired(input.firstName, "First name");
    const lastName = normalizeRequired(input.lastName, "Last name");
    const employeeId = normalizeRequired(input.employeeId, "Employee ID");
    const password = normalizeRequired(input.password, "Password");

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      throw new Error(passwordError);
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash: await hashPassword(password),
            role: "ADMIN",
            firstName,
            lastName,
            employeeId,
            technicianLevel: "LEAD",
            isActive: true,
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
          select: {
            id: true,
            email: true,
          },
        });

        await tx.appConfig.upsert({
          where: { id: APP_CONFIG_ID },
          update: {
            ateraApiKey: encryptStoredSecret(ateraApiKey),
            ...branding,
            setupCompletedAt: new Date(),
          },
          create: {
            id: APP_CONFIG_ID,
            ateraApiKey: encryptStoredSecret(ateraApiKey),
            ...branding,
            setupCompletedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "app.setup_completed",
            targetType: "app",
            metadata: JSON.stringify({
              email: user.email,
              source: "setup",
              companyName: branding.ateraCompanyName,
              accountId: branding.ateraAccountId,
            }),
          },
        });

        return user;
      });

      return result;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("Email or employee ID already exists.");
      }
      throw error;
    }
  }

  await prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    update: {
      ateraApiKey: encryptStoredSecret(ateraApiKey),
      ...branding,
      setupCompletedAt: new Date(),
    },
    create: {
      id: APP_CONFIG_ID,
      ateraApiKey: encryptStoredSecret(ateraApiKey),
      ...branding,
      setupCompletedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "app.setup_completed",
      targetType: "app",
      metadata: JSON.stringify({
        mode: "config_only",
        companyName: branding.ateraCompanyName,
        accountId: branding.ateraAccountId,
      }),
    },
  });

  return { id: "config-only", email: "" };
}