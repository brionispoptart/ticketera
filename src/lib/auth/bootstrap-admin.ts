import { hash } from "bcryptjs";
import { prisma } from "../db";
import { generateTemporaryPassword } from "./password";

const DEFAULT_ADMIN_EMAIL = "admin@local";
const DEFAULT_ADMIN_EMPLOYEE_ID = "ADMIN-0001";
const DEFAULT_ADMIN_FIRST_NAME = "System";
const DEFAULT_ADMIN_LAST_NAME = "Administrator";

export type BootstrapResult = {
  created: boolean;
  email: string;
  temporaryPassword?: string;
  reason?: string;
};

export async function ensureBootstrapAdmin(): Promise<BootstrapResult> {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  if (existingAdmin) {
    return {
      created: false,
      email: existingAdmin.email,
      reason: "admin_already_exists",
    };
  }

  const email = (process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const firstName = process.env.AUTH_BOOTSTRAP_ADMIN_FIRST_NAME || DEFAULT_ADMIN_FIRST_NAME;
  const lastName = process.env.AUTH_BOOTSTRAP_ADMIN_LAST_NAME || DEFAULT_ADMIN_LAST_NAME;
  const employeeId =
    process.env.AUTH_BOOTSTRAP_ADMIN_EMPLOYEE_ID || DEFAULT_ADMIN_EMPLOYEE_ID;

  const providedPassword = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD;
  const temporaryPassword = providedPassword || generateTemporaryPassword();

  const passwordHash = await hash(temporaryPassword, 12);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "ADMIN",
      firstName,
      lastName,
      employeeId,
      technicianLevel: "LEAD",
      isActive: true,
      mustChangePassword: true,
    },
  });

  return {
    created: true,
    email,
    temporaryPassword,
  };
}
