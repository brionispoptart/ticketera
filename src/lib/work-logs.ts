import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getDatabaseProvider } from "@/lib/config/database";

type WorkLogSyncState = "synced" | "internal-only";
type WorkLogEntryType = "work_note" | "resolve_note";

type WorkLogUser = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  role: string;
  technicianLevel: string;
};

type CreateWorkLogInput = {
  userId: string;
  ticketId: number;
  ticketTitle: string;
  entryType: WorkLogEntryType;
  hoursWorked: number;
  noteText?: string | null;
  ateraCommentSync: WorkLogSyncState;
};

type WorkLogRecord = {
  id: string;
  ticketId: number;
  ticketTitle: string;
  entryType: string;
  hoursWorked: number;
  noteText: string | null;
  ateraCommentSync: string;
  createdAt: Date;
  user: WorkLogUser;
};

type WorkLogDelegate = {
  create: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown>;
};

type RawWorkLogRow = {
  id: string;
  ticketId: number;
  ticketTitle: string;
  entryType: string;
  hoursWorked: number;
  noteText: string | null;
  ateraCommentSync: string;
  createdAt: string | Date;
  userId: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  role: string;
  technicianLevel: string;
};

export type WorkLogReportUser = {
  id: string;
  label: string;
  employeeId: string;
  role: string;
  technicianLevel: string;
};

export type WorkLogReportEntry = {
  id: string;
  createdAt: string;
  ticketId: number;
  ticketTitle: string;
  entryType: string;
  hoursWorked: number;
  noteText: string | null;
  ateraCommentSync: string;
  user: WorkLogReportUser;
};

export type WorkLogTicketSummary = {
  ticketId: number;
  ticketTitle: string;
  totalHours: number;
  entriesCount: number;
  lastLoggedAt: string;
};

export type WorkLogUserSummary = {
  user: WorkLogReportUser;
  totalHours: number;
  entriesCount: number;
  ticketCount: number;
};

export type WorkLogReport = {
  entries: WorkLogReportEntry[];
  summary: {
    totalHours: number;
    totalEntries: number;
    totalTickets: number;
  };
  tickets: WorkLogTicketSummary[];
  users: WorkLogUserSummary[];
};

function roundHours(value: number) {
  return Number(value.toFixed(2));
}

function toSqliteDateTime(value: Date) {
  return value.toISOString().replace("T", " ").replace("Z", "");
}

function getWorkLogDelegate() {
  const delegate = (prisma as typeof prisma & { workLog?: WorkLogDelegate }).workLog;

  if (!delegate) {
    throw new Error(
      "Work log reporting is unavailable because the Prisma client is missing the WorkLog model. Run npm run db:generate and restart the app server.",
    );
  }

  return delegate;
}

let sqliteStorageReady: Promise<void> | null = null;

async function ensureSqliteWorkLogStorage() {
  if (!sqliteStorageReady) {
    sqliteStorageReady = (async () => {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "WorkLog" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "ticketId" INTEGER NOT NULL, "ticketTitle" TEXT NOT NULL, "entryType" TEXT NOT NULL, "hoursWorked" REAL NOT NULL, "noteText" TEXT, "ateraCommentSync" TEXT NOT NULL DEFAULT 'synced', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`
      );
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WorkLog_userId_createdAt_idx" ON "WorkLog" ("userId", "createdAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WorkLog_ticketId_createdAt_idx" ON "WorkLog" ("ticketId", "createdAt")');
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "WorkLog_entryType_idx" ON "WorkLog" ("entryType")');
    })();
  }

  await sqliteStorageReady;
}

async function createWorkLogWithSqliteFallback(input: CreateWorkLogInput) {
  await ensureSqliteWorkLogStorage();

  const record = {
    id: randomUUID(),
    userId: input.userId,
    ticketId: input.ticketId,
    ticketTitle: input.ticketTitle.trim() || `Ticket #${input.ticketId}`,
    entryType: input.entryType,
    hoursWorked: normalizeHoursWorked(input.hoursWorked),
    noteText: input.noteText?.trim() || null,
    ateraCommentSync: input.ateraCommentSync,
  };

  await prisma.$executeRawUnsafe(
    'INSERT INTO "WorkLog" ("id", "userId", "ticketId", "ticketTitle", "entryType", "hoursWorked", "noteText", "ateraCommentSync", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    record.id,
    record.userId,
    record.ticketId,
    record.ticketTitle,
    record.entryType,
    record.hoursWorked,
    record.noteText,
    record.ateraCommentSync,
  );

  return record;
}

function mapRawWorkLogRow(row: RawWorkLogRow): WorkLogRecord {
  return {
    id: row.id,
    ticketId: Number(row.ticketId),
    ticketTitle: row.ticketTitle,
    entryType: row.entryType,
    hoursWorked: Number(row.hoursWorked),
    noteText: row.noteText,
    ateraCommentSync: row.ateraCommentSync,
    createdAt: new Date(row.createdAt),
    user: {
      id: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      employeeId: row.employeeId,
      role: row.role,
      technicianLevel: row.technicianLevel,
    },
  };
}

async function getWorkLogReportWithSqliteFallback(options: { userId?: string; from?: Date; to?: Date }) {
  await ensureSqliteWorkLogStorage();

  const conditions = ['1 = 1'];
  const params: string[] = [];

  if (options.userId) {
    conditions.push('w."userId" = ?');
    params.push(options.userId);
  }

  if (options.from) {
    conditions.push('w."createdAt" >= datetime(?)');
    params.push(toSqliteDateTime(options.from));
  }

  if (options.to) {
    conditions.push('w."createdAt" <= datetime(?)');
    params.push(toSqliteDateTime(options.to));
  }

  const query = `
    SELECT
      w."id" as id,
      w."ticketId" as ticketId,
      w."ticketTitle" as ticketTitle,
      w."entryType" as entryType,
      w."hoursWorked" as hoursWorked,
      w."noteText" as noteText,
      w."ateraCommentSync" as ateraCommentSync,
      w."createdAt" as createdAt,
      u."id" as userId,
      u."firstName" as firstName,
      u."lastName" as lastName,
      u."employeeId" as employeeId,
      u."role" as role,
      u."technicianLevel" as technicianLevel
    FROM "WorkLog" w
    INNER JOIN "User" u ON u."id" = w."userId"
    WHERE ${conditions.join(" AND ")}
    ORDER BY w."createdAt" DESC
  `;

  const rawRows = await prisma.$queryRawUnsafe<RawWorkLogRow[]>(query, ...params);
  return rawRows.map(mapRawWorkLogRow);
}

function normalizeHoursWorked(hoursWorked: number) {
  if (!Number.isFinite(hoursWorked) || hoursWorked < 0) {
    throw new Error("Hours worked must be zero or greater.");
  }

  return roundHours(hoursWorked);
}

function buildUserLabel(user: WorkLogUser) {
  return `${user.firstName} ${user.lastName}`.trim() || user.employeeId;
}

function toReportUser(user: WorkLogUser): WorkLogReportUser {
  return {
    id: user.id,
    label: buildUserLabel(user),
    employeeId: user.employeeId,
    role: user.role,
    technicianLevel: user.technicianLevel,
  };
}

function toReportEntry(entry: WorkLogRecord): WorkLogReportEntry {
  return {
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    ticketId: entry.ticketId,
    ticketTitle: entry.ticketTitle,
    entryType: entry.entryType,
    hoursWorked: roundHours(entry.hoursWorked),
    noteText: entry.noteText,
    ateraCommentSync: entry.ateraCommentSync,
    user: toReportUser(entry.user),
  };
}

export async function createWorkLog(input: CreateWorkLogInput) {
  const delegate = (prisma as typeof prisma & { workLog?: WorkLogDelegate }).workLog;

  if (delegate) {
    return delegate.create({
      data: {
        userId: input.userId,
        ticketId: input.ticketId,
        ticketTitle: input.ticketTitle.trim() || `Ticket #${input.ticketId}`,
        entryType: input.entryType,
        hoursWorked: normalizeHoursWorked(input.hoursWorked),
        noteText: input.noteText?.trim() || null,
        ateraCommentSync: input.ateraCommentSync,
      },
    });
  }

  if (getDatabaseProvider() === "sqlite") {
    return createWorkLogWithSqliteFallback(input);
  }

  throw new Error(
    "Work log reporting is unavailable because the Prisma client is missing the WorkLog model. Run npm run db:generate and restart the app server.",
  );
}

export async function listWorkLogUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      role: true,
      technicianLevel: true,
    },
  });

  return users.map((user) => ({
    id: user.id,
    label: `${user.firstName} ${user.lastName}`.trim() || user.employeeId,
    employeeId: user.employeeId,
    role: user.role,
    technicianLevel: user.technicianLevel,
  }));
}

export async function getWorkLogReport(options: { userId?: string; from?: Date; to?: Date }) {
  let rows: WorkLogRecord[];

  if ((prisma as typeof prisma & { workLog?: WorkLogDelegate }).workLog) {
    const where = {
      userId: options.userId || undefined,
      createdAt: {
        gte: options.from,
        lte: options.to,
      },
    };

    rows = (await getWorkLogDelegate().findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            role: true,
            technicianLevel: true,
          },
        },
      },
    })) as unknown as WorkLogRecord[];
  } else if (getDatabaseProvider() === "sqlite") {
    rows = await getWorkLogReportWithSqliteFallback(options);
  } else {
    throw new Error(
      "Work log reporting is unavailable because the Prisma client is missing the WorkLog model. Run npm run db:generate and restart the app server.",
    );
  }

  const entries = rows.map(toReportEntry);
  const totalHours = roundHours(entries.reduce((sum, entry) => sum + entry.hoursWorked, 0));
  const ticketIds = new Set(entries.map((entry) => entry.ticketId));

  const ticketMap = new Map<number, WorkLogTicketSummary>();
  for (const entry of entries) {
    const current = ticketMap.get(entry.ticketId);
    if (!current) {
      ticketMap.set(entry.ticketId, {
        ticketId: entry.ticketId,
        ticketTitle: entry.ticketTitle,
        totalHours: entry.hoursWorked,
        entriesCount: 1,
        lastLoggedAt: entry.createdAt,
      });
      continue;
    }

    current.totalHours = roundHours(current.totalHours + entry.hoursWorked);
    current.entriesCount += 1;
    if (entry.createdAt > current.lastLoggedAt) {
      current.lastLoggedAt = entry.createdAt;
    }
  }

  const userMap = new Map<string, WorkLogUserSummary>();
  for (const entry of entries) {
    const current = userMap.get(entry.user.id);
    if (!current) {
      userMap.set(entry.user.id, {
        user: entry.user,
        totalHours: entry.hoursWorked,
        entriesCount: 1,
        ticketCount: 1,
      });
      continue;
    }

    current.totalHours = roundHours(current.totalHours + entry.hoursWorked);
    current.entriesCount += 1;
  }

  for (const summary of userMap.values()) {
    summary.ticketCount = new Set(entries.filter((entry) => entry.user.id === summary.user.id).map((entry) => entry.ticketId)).size;
  }

  return {
    entries,
    summary: {
      totalHours,
      totalEntries: entries.length,
      totalTickets: ticketIds.size,
    },
    tickets: Array.from(ticketMap.values()).sort((a, b) => b.totalHours - a.totalHours),
    users: Array.from(userMap.values()).sort((a, b) => b.totalHours - a.totalHours),
  } satisfies WorkLogReport;
}