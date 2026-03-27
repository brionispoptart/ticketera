import { prisma } from "../src/lib/db";
import { createSession } from "../src/lib/auth/session";

const baseUrl = process.env.AUTH_SMOKE_BASE_URL || "http://localhost:3000";
const adminEmail = process.env.AUTH_SMOKE_ADMIN_EMAIL || "admin@local";
const adminPassword = process.env.AUTH_SMOKE_ADMIN_PASSWORD || "";

type LoginResponse = {
  ok?: boolean;
  redirectTo?: string;
  user?: { id: string; email: string };
  error?: string;
};

type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  technicianLevel: string;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
};

async function main() {
  const headers = { "content-type": "application/json" };
  const unique = Date.now();
  const email = `tech.${unique}@local`;
  const employeeId = `EMP-${unique}`;
  let cookie = "";

  if (adminPassword) {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const loginPayload = (await login.json()) as LoginResponse;
    console.log("[auth-smoke-admin] login", login.status, loginPayload);

    const setCookie = login.headers.get("set-cookie") || "";
    cookie = setCookie.split(";")[0];
    if (!login.ok || !cookie) {
      throw new Error(loginPayload.error || "Login failed.");
    }
  } else {
    const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) {
      throw new Error(`Admin user ${adminEmail} was not found.`);
    }
    const session = await createSession(admin.id);
    cookie = `ticketera_session=${session.token}`;
    console.log("[auth-smoke-admin] direct-session", { email: adminEmail, expiresAt: session.expiresAt.toISOString() });
  }

  const authHeaders = {
    ...headers,
    cookie,
  };

  const createResponse = await fetch(`${baseUrl}/api/admin/users`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email,
      firstName: "Test",
      lastName: "Technician",
      employeeId,
      technicianLevel: "L2",
      role: "TECHNICIAN",
      isActive: true,
    }),
  });
  const createPayload = (await createResponse.json()) as {
    item?: AdminUser;
    temporaryPassword?: string;
    error?: string;
  };
  console.log("[auth-smoke-admin] create", createResponse.status, createPayload);
  if (!createResponse.ok || !createPayload.item) {
    throw new Error(createPayload.error || "Create user failed.");
  }

  const userId = createPayload.item.id;

  const updateResponse = await fetch(`${baseUrl}/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({
      email,
      firstName: "Updated",
      lastName: "Technician",
      employeeId,
      technicianLevel: "L3",
      role: "TECHNICIAN",
      isActive: true,
      avatarUrl: "https://example.com/avatar.png",
    }),
  });
  const updatePayload = (await updateResponse.json()) as {
    item?: AdminUser;
    error?: string;
  };
  console.log("[auth-smoke-admin] update", updateResponse.status, updatePayload);
  if (!updateResponse.ok || !updatePayload.item) {
    throw new Error(updatePayload.error || "Update user failed.");
  }

  const resetResponse = await fetch(`${baseUrl}/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  const resetPayload = (await resetResponse.json()) as {
    temporaryPassword?: string;
    error?: string;
  };
  console.log("[auth-smoke-admin] reset", resetResponse.status, resetPayload);
  if (!resetResponse.ok || !resetPayload.temporaryPassword) {
    throw new Error(resetPayload.error || "Reset password failed.");
  }

  const listResponse = await fetch(`${baseUrl}/api/admin/users`, {
    headers: {
      cookie,
    },
  });
  const listPayload = (await listResponse.json()) as {
    items?: AdminUser[];
    error?: string;
  };
  console.log("[auth-smoke-admin] list", listResponse.status, {
    count: listPayload.items?.length,
    found: listPayload.items?.some((item) => item.id === userId),
  });
  if (!listResponse.ok || !listPayload.items?.some((item) => item.id === userId)) {
    throw new Error(listPayload.error || "List users failed.");
  }

  console.log("[auth-smoke-admin] success");
}

main().catch((error) => {
  console.error("[auth-smoke-admin] failed", error instanceof Error ? error.message : error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
