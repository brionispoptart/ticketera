import { prisma } from "@/lib/db";
import { hashPassword, validatePasswordStrength, generateTemporaryPassword } from "@/lib/auth/password";
import { deleteOtherSessionsForUser } from "@/lib/auth/session";

export const USER_ROLES = ["ADMIN", "TECHNICIAN"] as const;
export const TECHNICIAN_LEVELS = ["L1", "L2", "L3", "LEAD"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type TechnicianLevel = (typeof TECHNICIAN_LEVELS)[number];

export type ManagedUser = {
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
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ManagedUserRecord = {
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
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const managedUserSelect = {
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
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserDataFallback = {
  email?: string;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  avatarUrl?: string | null;
  technicianLevel?: string;
  role?: string;
  isActive?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
};

export type UserPayload = {
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  employeeId?: unknown;
  avatarUrl?: unknown;
  technicianLevel?: unknown;
  role?: unknown;
  isActive?: unknown;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalUrl(value: unknown) {
  const candidate = normalizeString(value);
  return candidate || null;
}

function normalizeRole(value: unknown): UserRole {
  const candidate = normalizeString(value).toUpperCase();
  if (candidate === "ADMIN") {
    return "ADMIN";
  }
  return "TECHNICIAN";
}

function normalizeTechnicianLevel(value: unknown): TechnicianLevel {
  const candidate = normalizeString(value).toUpperCase();
  if (candidate === "L2" || candidate === "L3" || candidate === "LEAD") {
    return candidate;
  }
  return "L1";
}

function normalizeBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

export function serializeManagedUser(user: ManagedUserRecord): ManagedUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    avatarUrl: user.avatarUrl,
    technicianLevel: user.technicianLevel,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil?.toISOString() || null,
    lastLoginAt: user.lastLoginAt?.toISOString() || null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function listManagedUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: managedUserSelect,
  });

  return (users as unknown as ManagedUserRecord[]).map(serializeManagedUser);
}

export function buildUserData(payload: UserPayload, fallback?: UserDataFallback) {
  const email = normalizeEmail(payload.email ?? fallback?.email);
  const firstName = normalizeString(payload.firstName ?? fallback?.firstName);
  const lastName = normalizeString(payload.lastName ?? fallback?.lastName);
  const employeeId = normalizeString(payload.employeeId ?? fallback?.employeeId);
  const avatarUrl = normalizeOptionalUrl(payload.avatarUrl ?? fallback?.avatarUrl);
  const technicianLevel = normalizeTechnicianLevel(payload.technicianLevel ?? fallback?.technicianLevel);
  const role = normalizeRole(payload.role ?? fallback?.role);
  const isActive = normalizeBoolean(payload.isActive, fallback?.isActive ?? true);

  if (!email) {
    throw new Error("Email is required.");
  }
  if (!firstName) {
    throw new Error("First name is required.");
  }
  if (!lastName) {
    throw new Error("Last name is required.");
  }
  if (!employeeId) {
    throw new Error("Employee ID is required.");
  }

  return {
    email,
    firstName,
    lastName,
    employeeId,
    avatarUrl,
    technicianLevel,
    role,
    isActive,
  };
}

export async function createManagedUser(payload: UserPayload & { password?: unknown }) {
  const data = buildUserData(payload);
  const suppliedPassword = typeof payload.password === "string" ? payload.password : "";
  const temporaryPassword = suppliedPassword || generateTemporaryPassword();
  const passwordError = validatePasswordStrength(temporaryPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  try {
    const user = await prisma.user.create({
      data: {
        ...data,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
      select: managedUserSelect,
    });

    return {
      user: serializeManagedUser(user as unknown as ManagedUserRecord),
      temporaryPassword,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Email or employee ID already exists.");
    }
    throw error;
  }
}

export async function updateManagedUser(userId: string, actorUserId: string, payload: UserPayload) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: managedUserSelect,
  });

  if (!existing) {
    throw new Error("User not found.");
  }

  if (userId === actorUserId) {
    throw new Error("Use the password flow for your own account. Admin self-edit is blocked here.");
  }

  const data = buildUserData(payload, existing);

  try {
    await prisma.user.update({
      where: { id: userId },
      data,
      select: managedUserSelect,
    });

    if (!data.isActive) {
      await deleteOtherSessionsForUser(userId);
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    const refreshedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: managedUserSelect,
    });

    return serializeManagedUser(refreshedUser as unknown as ManagedUserRecord);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Email or employee ID already exists.");
    }
    throw error;
  }
}

export async function resetManagedUserPassword(userId: string, actorUserId: string, password?: string) {
  if (userId === actorUserId) {
    throw new Error("Use the password flow for your own account. Admin self-reset is blocked here.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const temporaryPassword = password?.trim() || generateTemporaryPassword();
  const passwordError = validatePasswordStrength(temporaryPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await deleteOtherSessionsForUser(userId);

  return {
    temporaryPassword,
  };
}
