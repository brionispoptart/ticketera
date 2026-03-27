import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listManagedUsers } from "@/lib/auth/admin-users";
import { isLeadOrAdmin } from "@/lib/auth/access";
import { getWorkLogReport, type WorkLogReport } from "@/lib/work-logs";

function emptyWorkLogReport(): WorkLogReport {
  return {
    entries: [],
    summary: {
      totalHours: 0,
      totalEntries: 0,
      totalTickets: 0,
    },
    tickets: [],
    users: [],
  };
}

function parseDateQuery(value: string | null, fallback?: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date filter.");
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { searchParams } = new URL(request.url);
    const canViewAll = isLeadOrAdmin(session.user);
    const requestedUserId = searchParams.get("userId") || undefined;
    const effectiveUserId = canViewAll ? requestedUserId : session.user.id;
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 13);
    defaultFrom.setHours(0, 0, 0, 0);
    const from = parseDateQuery(searchParams.get("from"), defaultFrom);
    const to = parseDateQuery(searchParams.get("to"), now);
    to?.setHours(23, 59, 59, 999);

    const users = canViewAll
      ? await listManagedUsers()
      : [
          {
            id: session.user.id,
            firstName: session.user.firstName,
            lastName: session.user.lastName,
            employeeId: session.user.employeeId,
            role: session.user.role,
            technicianLevel: session.user.technicianLevel,
          },
        ];
    let warning: string | null = null;
    let report = emptyWorkLogReport();

    try {
      report = await getWorkLogReport({ userId: effectiveUserId, from, to });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (!message.includes("Prisma client is missing the WorkLog model")) {
        throw error;
      }

      warning = message;
    }

    return NextResponse.json({
      filters: {
        userId: effectiveUserId || null,
        from: from?.toISOString() || null,
        to: to?.toISOString() || null,
      },
      users: users.map((user) => ({
        id: user.id,
        label: `${user.firstName} ${user.lastName}`.trim() || user.employeeId,
        employeeId: user.employeeId,
        role: user.role,
        technicianLevel: user.technicianLevel,
      })),
      report,
      warning,
      canViewAll,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}