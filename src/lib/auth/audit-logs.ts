import { prisma } from "@/lib/db";

export type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogPage = {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

function parseMetadata(metadata: string | null) {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildUserLabel(user?: { firstName: string; lastName: string; email: string } | null) {
  if (!user) {
    return "Unknown user";
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return fullName ? `${fullName} (${user.email})` : user.email;
}

export async function listAuditLogsPage(page = 1, pageSize = 20): Promise<AuditLogPage> {
  const normalizedPageSize = Math.max(1, Math.min(pageSize, 100));
  const totalCount = await prisma.auditLog.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const normalizedPage = Math.max(1, Math.min(page, totalPages));

  const items = await prisma.auditLog.findMany({
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      actorUserId: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const userIds = Array.from(
    new Set(
      items
        .flatMap((item: (typeof items)[number]) => [item.actorUserId, item.targetType === "user" ? item.targetId : null])
        .filter((value: string | null): value is string => Boolean(value)),
    ),
  );

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      })
    : [];

  const userMap = new Map<string, { firstName: string; lastName: string; email: string }>(
    users.map((user: (typeof users)[number]) => [
      user.id,
      {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    ]),
  );

  const mappedItems = items.map((item: (typeof items)[number]) => ({
    id: item.id,
    actorUserId: item.actorUserId,
    actorLabel: buildUserLabel(item.actorUserId ? userMap.get(item.actorUserId) : null),
    action: item.action,
    targetType: item.targetType,
    targetId: item.targetId,
    targetLabel:
      item.targetType === "user" && item.targetId
        ? buildUserLabel(userMap.get(item.targetId))
        : item.targetId || item.targetType,
    metadata: parseMetadata(item.metadata),
    createdAt: item.createdAt.toISOString(),
  }));

  return {
    items: mappedItems,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    totalPages,
    hasNext: normalizedPage < totalPages,
    hasPrevious: normalizedPage > 1,
  };
}

export async function listAuditLogs(limit = 100): Promise<AuditLogItem[]> {
  const page = await listAuditLogsPage(1, limit);
  return page.items;
}
