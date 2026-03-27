import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getDatabaseProvider } from "@/lib/config/database";
import { recordAuditLog } from "@/lib/auth/session";
import type { ChatConversationSummary, ChatMessageItem, ChatUserSummary } from "@/lib/types/chat";

type RawChatConversationRow = {
  conversationId: string;
  conversationCreatedAt: string | Date;
  lastReadAt: string | Date | null;
  isPinned: number | boolean;
  pinnedAt: string | Date | null;
  otherUserId: string | null;
  otherFirstName: string | null;
  otherLastName: string | null;
  otherEmail: string | null;
  otherRole: string | null;
  otherTechnicianLevel: string | null;
  otherAvatarUrl: string | null;
  lastMessageBody: string | null;
  lastMessageAt: string | Date | null;
  unreadCount: number | bigint;
};

type RawChatMessageRow = {
  id: string;
  body: string;
  createdAt: string | Date;
  senderUserId: string | null;
  isPinned: number | boolean;
  pinnedAt: string | Date | null;
  senderFirstName: string | null;
  senderLastName: string | null;
  senderEmail: string | null;
};

type RawParticipantRow = {
  conversationId: string;
  userId: string;
};

let sqliteChatStorageReady: Promise<void> | null = null;

export function canUseChatRuntime() {
  return true;
}

const CHAT_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  technicianLevel: true,
  avatarUrl: true,
} as const;

function toChatUserSummary(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  technicianLevel: string;
  avatarUrl: string | null;
}): ChatUserSummary {
  return {
    id: user.id,
    fullName: `${user.firstName} ${user.lastName}`.trim() || user.email,
    email: user.email,
    role: user.role,
    technicianLevel: user.technicianLevel,
    avatarUrl: user.avatarUrl,
  };
}

function toSenderLabel(sender?: { firstName: string; lastName: string; email: string } | null) {
  if (!sender) {
    return "System";
  }

  return `${sender.firstName} ${sender.lastName}`.trim() || sender.email;
}

function toSqliteDateTime(value: Date) {
  return value.toISOString();
}

function parseDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function boolFromSqlite(value: number | boolean) {
  return value === true || value === 1;
}

function ensureSqliteChatFallback() {
  if (getDatabaseProvider() !== "sqlite") {
    throw new Error("Chat requires a generated Prisma client when using PostgreSQL.");
  }
}

async function addSqliteColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${tableName}")`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`);
}

async function ensureSqliteChatStorage() {
  ensureSqliteChatFallback();

  if (!sqliteChatStorageReady) {
    sqliteChatStorageReady = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "ChatConversation" ("id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL DEFAULT 'direct', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
      );
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "ChatConversationParticipant" ("id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastReadAt" DATETIME, "isPinned" BOOLEAN NOT NULL DEFAULT 0, "pinnedAt" DATETIME, CONSTRAINT "ChatConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ChatConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`
      );
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "ChatMessage" ("id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL, "senderUserId" TEXT, "body" TEXT NOT NULL, "messageType" TEXT NOT NULL DEFAULT 'user', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "isPinned" BOOLEAN NOT NULL DEFAULT 0, "pinnedAt" DATETIME, CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE)`
      );

      await addSqliteColumnIfMissing("ChatConversationParticipant", "isPinned", "BOOLEAN NOT NULL DEFAULT 0");
      await addSqliteColumnIfMissing("ChatConversationParticipant", "pinnedAt", "DATETIME");
      await addSqliteColumnIfMissing("ChatMessage", "isPinned", "BOOLEAN NOT NULL DEFAULT 0");
      await addSqliteColumnIfMissing("ChatMessage", "pinnedAt", "DATETIME");

      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversationParticipant_conversationId_userId_key" ON "ChatConversationParticipant" ("conversationId", "userId")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatConversationParticipant_userId_lastReadAt_idx" ON "ChatConversationParticipant" ("userId", "lastReadAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatConversationParticipant_userId_isPinned_pinnedAt_idx" ON "ChatConversationParticipant" ("userId", "isPinned", "pinnedAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatConversation_kind_idx" ON "ChatConversation" ("kind")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatConversation_updatedAt_idx" ON "ChatConversation" ("updatedAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage" ("conversationId", "createdAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_isPinned_pinnedAt_idx" ON "ChatMessage" ("conversationId", "isPinned", "pinnedAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatMessage_senderUserId_idx" ON "ChatMessage" ("senderUserId")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ChatMessage_messageType_idx" ON "ChatMessage" ("messageType")');
    })();
  }

  await sqliteChatStorageReady;
}

async function ensureConversationParticipant(userId: string, conversationId: string) {
  await ensureSqliteChatStorage();

  const rows = await prisma.$queryRawUnsafe<RawParticipantRow[]>(
    'SELECT "conversationId", "userId" FROM "ChatConversationParticipant" WHERE "conversationId" = ? AND "userId" = ? LIMIT 1',
    conversationId,
    userId,
  );

  if (!rows[0]) {
    throw new Error("Conversation not found.");
  }
}

function buildConversationTitle(baseTitle: string, createdAt: string | null, duplicateCount: number) {
  if (duplicateCount <= 1 || !createdAt) {
    return baseTitle;
  }

  const parsed = new Date(createdAt);
  const stamp = Number.isNaN(parsed.getTime())
    ? createdAt
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return `${baseTitle} · ${stamp}`;
}

async function buildConversationSummary(
  userId: string,
  participant: RawChatConversationRow,
): Promise<ChatConversationSummary> {
  const otherUser = participant.otherUserId && participant.otherEmail && participant.otherRole && participant.otherTechnicianLevel
    ? {
        id: participant.otherUserId,
        fullName: `${participant.otherFirstName || ""} ${participant.otherLastName || ""}`.trim() || participant.otherEmail,
        email: participant.otherEmail,
        role: participant.otherRole,
        technicianLevel: participant.otherTechnicianLevel,
        avatarUrl: participant.otherAvatarUrl,
      }
    : null;
  const unreadCount = Number(participant.unreadCount || 0);

  return {
    id: participant.conversationId,
    title: otherUser?.fullName || "Conversation",
    otherUser,
    lastMessageBody: participant.lastMessageBody || null,
    lastMessageAt: parseDate(participant.lastMessageAt)?.toISOString() || null,
    unreadCount,
    isPinned: boolFromSqlite(participant.isPinned),
    pinnedAt: parseDate(participant.pinnedAt)?.toISOString() || null,
  };
}

export async function listChatUsers(currentUserId: string): Promise<ChatUserSummary[]> {
  const users = await prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      isActive: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: CHAT_USER_SELECT,
  });

  return users.map(toChatUserSummary);
}

export async function listChatConversationsForUser(userId: string): Promise<ChatConversationSummary[]> {
  await ensureSqliteChatStorage();

  const rows = await prisma.$queryRawUnsafe<RawChatConversationRow[]>(
    `
      SELECT
        p."conversationId" as conversationId,
        CAST(c."createdAt" AS TEXT) as conversationCreatedAt,
        CAST(p."lastReadAt" AS TEXT) as lastReadAt,
        p."isPinned" as isPinned,
        CAST(p."pinnedAt" AS TEXT) as pinnedAt,
        u."id" as otherUserId,
        u."firstName" as otherFirstName,
        u."lastName" as otherLastName,
        u."email" as otherEmail,
        u."role" as otherRole,
        u."technicianLevel" as otherTechnicianLevel,
        u."avatarUrl" as otherAvatarUrl,
        (
          SELECT m."body"
          FROM "ChatMessage" m
          WHERE m."conversationId" = p."conversationId"
          ORDER BY CAST(m."createdAt" AS TEXT) DESC
          LIMIT 1
        ) as lastMessageBody,
        (
          SELECT CAST(m."createdAt" AS TEXT)
          FROM "ChatMessage" m
          WHERE m."conversationId" = p."conversationId"
          ORDER BY CAST(m."createdAt" AS TEXT) DESC
          LIMIT 1
        ) as lastMessageAt,
        (
          SELECT COUNT(*)
          FROM "ChatMessage" m
          WHERE m."conversationId" = p."conversationId"
            AND COALESCE(m."senderUserId", '') <> p."userId"
            AND CAST(m."createdAt" AS TEXT) > COALESCE(CAST(p."lastReadAt" AS TEXT), '1970-01-01T00:00:00.000Z')
        ) as unreadCount
      FROM "ChatConversationParticipant" p
      INNER JOIN "ChatConversation" c ON c."id" = p."conversationId"
      LEFT JOIN "ChatConversationParticipant" otherP ON otherP."conversationId" = p."conversationId" AND otherP."userId" <> p."userId"
      LEFT JOIN "User" u ON u."id" = otherP."userId"
      WHERE p."userId" = ?
      ORDER BY p."isPinned" DESC, COALESCE(CAST(p."pinnedAt" AS TEXT), '1970-01-01T00:00:00.000Z') DESC, COALESCE((
        SELECT CAST(m."createdAt" AS TEXT)
        FROM "ChatMessage" m
        WHERE m."conversationId" = p."conversationId"
        ORDER BY CAST(m."createdAt" AS TEXT) DESC
        LIMIT 1
      ), CAST(c."updatedAt" AS TEXT), CAST(c."createdAt" AS TEXT)) DESC
    `,
    userId,
  );

  const duplicateCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.otherUserId || row.conversationId;
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }

  const items = await Promise.all(rows.map((row) => buildConversationSummary(userId, row)));
  return items.map((item, index) => ({
    ...item,
    title: buildConversationTitle(item.title, parseDate(rows[index].conversationCreatedAt)?.toISOString() || null, duplicateCounts.get(rows[index].otherUserId || rows[index].conversationId) || 1),
  }));
}

export async function countUnreadMessagesForUser(userId: string): Promise<number> {
  const conversations = await listChatConversationsForUser(userId);
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
}

export async function listUnreadChatConversationsForUser(userId: string): Promise<ChatConversationSummary[]> {
  const conversations = await listChatConversationsForUser(userId);

  return conversations
    .filter((conversation) => conversation.unreadCount > 0)
    .sort((left, right) => {
      const leftTime = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
      const rightTime = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
      return rightTime - leftTime;
    });
}

export async function getOrCreateDirectConversation(userId: string, otherUserId: string): Promise<ChatConversationSummary> {
  await ensureSqliteChatStorage();

  if (userId === otherUserId) {
    throw new Error("You cannot start a conversation with yourself.");
  }

  const otherUser = await prisma.user.findFirst({
    where: {
      id: otherUserId,
      isActive: true,
    },
    select: CHAT_USER_SELECT,
  });

  if (!otherUser) {
    throw new Error("User not found.");
  }

  const conversationId = randomUUID();
  const nowSqlite = toSqliteDateTime(new Date());

  await prisma.$executeRawUnsafe(
    'INSERT INTO "ChatConversation" ("id", "kind", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)',
    conversationId,
    "direct",
    nowSqlite,
    nowSqlite,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO "ChatConversationParticipant" ("id", "conversationId", "userId", "joinedAt") VALUES (?, ?, ?, ?)',
    randomUUID(),
    conversationId,
    userId,
    nowSqlite,
  );
  await prisma.$executeRawUnsafe(
    'INSERT INTO "ChatConversationParticipant" ("id", "conversationId", "userId", "joinedAt") VALUES (?, ?, ?, ?)',
    randomUUID(),
    conversationId,
    otherUserId,
    nowSqlite,
  );

  await recordAuditLog({
    actorUserId: userId,
    action: "chat.conversation_started",
    targetType: "chat_conversation",
    targetId: conversationId,
    metadata: { kind: "direct", otherUserId },
  }).catch(() => undefined);

  const items = await listChatConversationsForUser(userId);
  const item = items.find((entry) => entry.id === conversationId) || null;
  if (!item) {
    throw new Error("Conversation not found.");
  }

  return item;
}

export async function setConversationPinned(userId: string, conversationId: string, pinned: boolean): Promise<ChatConversationSummary> {
  await ensureConversationParticipant(userId, conversationId);

  await prisma.$executeRawUnsafe(
    'UPDATE "ChatConversationParticipant" SET "isPinned" = ?, "pinnedAt" = ? WHERE "conversationId" = ? AND "userId" = ?',
    pinned ? 1 : 0,
    pinned ? toSqliteDateTime(new Date()) : null,
    conversationId,
    userId,
  );

  await recordAuditLog({
    actorUserId: userId,
    action: pinned ? "chat.conversation_pinned" : "chat.conversation_unpinned",
    targetType: "chat_conversation",
    targetId: conversationId,
  }).catch(() => undefined);

  const items = await listChatConversationsForUser(userId);
  const item = items.find((entry) => entry.id === conversationId) || null;
  if (!item) {
    throw new Error("Conversation not found.");
  }

  return item;
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  await ensureConversationParticipant(userId, conversationId);

  await prisma.$executeRawUnsafe(
    'DELETE FROM "ChatConversation" WHERE "id" = ?',
    conversationId,
  );

  await recordAuditLog({
    actorUserId: userId,
    action: "chat.conversation_deleted",
    targetType: "chat_conversation",
    targetId: conversationId,
  }).catch(() => undefined);
}

export async function deleteConversationMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
  await ensureConversationParticipant(userId, conversationId);

  const rows = await prisma.$queryRawUnsafe<{ senderUserId: string | null }[]>(
    'SELECT "senderUserId" FROM "ChatMessage" WHERE "id" = ? AND "conversationId" = ? LIMIT 1',
    messageId,
    conversationId,
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Message not found.");
  }
  if (row.senderUserId !== userId) {
    throw new Error("You can only delete your own messages.");
  }

  await prisma.$executeRawUnsafe(
    'DELETE FROM "ChatMessage" WHERE "id" = ? AND "conversationId" = ?',
    messageId,
    conversationId,
  );

  await recordAuditLog({
    actorUserId: userId,
    action: "chat.message_deleted",
    targetType: "chat_message",
    targetId: messageId,
    metadata: { conversationId },
  }).catch(() => undefined);
}

export async function listMessagesForConversation(userId: string, conversationId: string): Promise<ChatMessageItem[]> {
  await ensureConversationParticipant(userId, conversationId);

  const rows = await prisma.$queryRawUnsafe<RawChatMessageRow[]>(
    `
      SELECT
        m."id" as id,
        m."body" as body,
        CAST(m."createdAt" AS TEXT) as createdAt,
        m."senderUserId" as senderUserId,
        m."isPinned" as isPinned,
        CAST(m."pinnedAt" AS TEXT) as pinnedAt,
        u."firstName" as senderFirstName,
        u."lastName" as senderLastName,
        u."email" as senderEmail
      FROM "ChatMessage" m
      LEFT JOIN "User" u ON u."id" = m."senderUserId"
      WHERE m."conversationId" = ?
      ORDER BY CAST(m."createdAt" AS TEXT) ASC
    `,
    conversationId,
  );

  await prisma.$executeRawUnsafe(
    'UPDATE "ChatConversationParticipant" SET "lastReadAt" = ? WHERE "conversationId" = ? AND "userId" = ?',
    toSqliteDateTime(new Date()),
    conversationId,
    userId,
  );

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: parseDate(row.createdAt)?.toISOString() || new Date().toISOString(),
    senderUserId: row.senderUserId,
    senderLabel: toSenderLabel({
      firstName: row.senderFirstName || "",
      lastName: row.senderLastName || "",
      email: row.senderEmail || "",
    }),
    isPinned: boolFromSqlite(row.isPinned),
    pinnedAt: parseDate(row.pinnedAt)?.toISOString() || null,
  }));
}

export async function setConversationMessagePinned(
  userId: string,
  conversationId: string,
  messageId: string,
  pinned: boolean,
): Promise<ChatMessageItem> {
  await ensureConversationParticipant(userId, conversationId);

  const pinnedAt = pinned ? toSqliteDateTime(new Date()) : null;

  await prisma.$executeRawUnsafe(
    'UPDATE "ChatMessage" SET "isPinned" = ?, "pinnedAt" = ? WHERE "id" = ? AND "conversationId" = ?',
    pinned ? 1 : 0,
    pinnedAt,
    messageId,
    conversationId,
  );

  const rows = await prisma.$queryRawUnsafe<RawChatMessageRow[]>(
    `
      SELECT
        m."id" as id,
        m."body" as body,
        CAST(m."createdAt" AS TEXT) as createdAt,
        m."senderUserId" as senderUserId,
        m."isPinned" as isPinned,
        CAST(m."pinnedAt" AS TEXT) as pinnedAt,
        u."firstName" as senderFirstName,
        u."lastName" as senderLastName,
        u."email" as senderEmail
      FROM "ChatMessage" m
      LEFT JOIN "User" u ON u."id" = m."senderUserId"
      WHERE m."id" = ? AND m."conversationId" = ?
      LIMIT 1
    `,
    messageId,
    conversationId,
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Message not found.");
  }

  await recordAuditLog({
    actorUserId: userId,
    action: pinned ? "chat.message_pinned" : "chat.message_unpinned",
    targetType: "chat_message",
    targetId: messageId,
    metadata: { conversationId },
  }).catch(() => undefined);

  return {
    id: row.id,
    body: row.body,
    createdAt: parseDate(row.createdAt)?.toISOString() || new Date().toISOString(),
    senderUserId: row.senderUserId,
    senderLabel: toSenderLabel({
      firstName: row.senderFirstName || "",
      lastName: row.senderLastName || "",
      email: row.senderEmail || "",
    }),
    isPinned: boolFromSqlite(row.isPinned),
    pinnedAt: parseDate(row.pinnedAt)?.toISOString() || null,
  };
}

export async function sendConversationMessage(userId: string, conversationId: string, body: string): Promise<ChatMessageItem> {
  await ensureConversationParticipant(userId, conversationId);
  const normalized = body.trim();

  if (!normalized) {
    throw new Error("Message is required.");
  }

  const messageId = randomUUID();
  const now = new Date();
  const nowSqlite = toSqliteDateTime(now);

  await prisma.$executeRawUnsafe(
    'INSERT INTO "ChatMessage" ("id", "conversationId", "senderUserId", "body", "messageType", "createdAt") VALUES (?, ?, ?, ?, ?, ?)',
    messageId,
    conversationId,
    userId,
    normalized,
    "user",
    nowSqlite,
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "ChatConversation" SET "updatedAt" = ? WHERE "id" = ?',
    nowSqlite,
    conversationId,
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "ChatConversationParticipant" SET "lastReadAt" = ? WHERE "conversationId" = ? AND "userId" = ?',
    nowSqlite,
    conversationId,
    userId,
  );

  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  await recordAuditLog({
    actorUserId: userId,
    action: "chat.message_sent",
    targetType: "chat_conversation",
    targetId: conversationId,
    metadata: {
      messageId,
    },
  }).catch(() => undefined);

  return {
    id: messageId,
    body: normalized,
    createdAt: now.toISOString(),
    senderUserId: userId,
    senderLabel: toSenderLabel(sender || null),
    isPinned: false,
    pinnedAt: null,
  };
}