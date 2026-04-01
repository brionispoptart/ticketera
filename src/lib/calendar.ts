import { prisma } from "@/lib/db";

type ScheduleEventDelegate = {
  findMany: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  findUnique: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

export const CALENDAR_EVENT_TYPES = ["OUT_OF_OFFICE", "ONSITE"] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export type CalendarUserSummary = {
  id: string;
  label: string;
  employeeId: string;
  role: string;
  technicianLevel: string;
};

export type CalendarEventItem = {
  id: string;
  technicianUserId: string;
  technicianName: string;
  technicianEmployeeId: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmployeeId: string;
  eventType: CalendarEventType;
  startDate: string;
  endDate: string;
  title: string | null;
  notes: string | null;
  tickets: Array<{ ticketId: number; ticketTitle: string | null }>;
  ticketId: number | null;
  ticketTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

type EventRecord = {
  id: string;
  technicianUserId: string;
  createdByUserId: string;
  eventType: string;
  startDate: Date;
  endDate: Date;
  title: string | null;
  notes: string | null;
  scheduleEventTickets: Array<{ ticketId: number; ticketTitle: string | null }>;
  ticketId: number | null;
  ticketTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
  technician: { firstName: string; lastName: string; email: string; employeeId: string };
  createdByUser: { firstName: string; lastName: string; email: string; employeeId: string };
};

function fullName(firstName: string, lastName: string, fallback: string) {
  const value = `${firstName} ${lastName}`.trim();
  return value || fallback;
}

function toEventType(value: string): CalendarEventType {
  return value === "ONSITE" ? "ONSITE" : "OUT_OF_OFFICE";
}

function getScheduleEventDelegate() {
  const delegate = (prisma as typeof prisma & { scheduleEvent?: ScheduleEventDelegate }).scheduleEvent;

  if (!delegate) {
    throw new Error(
      "Calendar events are unavailable because the Prisma client is missing the ScheduleEvent model. Run npm run db:generate and restart the app server.",
    );
  }

  return delegate;
}

function serializeEvent(item: EventRecord): CalendarEventItem {
  const tickets = item.scheduleEventTickets
    .map((ticket) => ({
      ticketId: ticket.ticketId,
      ticketTitle: ticket.ticketTitle || null,
    }))
    .sort((left, right) => left.ticketId - right.ticketId);

  const normalizedTickets =
    tickets.length > 0
      ? tickets
      : item.ticketId
        ? [{ ticketId: item.ticketId, ticketTitle: item.ticketTitle || null }]
        : [];

  return {
    id: item.id,
    technicianUserId: item.technicianUserId,
    technicianName: fullName(item.technician.firstName, item.technician.lastName, item.technician.email),
    technicianEmployeeId: item.technician.employeeId,
    createdByUserId: item.createdByUserId,
    createdByName: fullName(item.createdByUser.firstName, item.createdByUser.lastName, item.createdByUser.email),
    createdByEmployeeId: item.createdByUser.employeeId,
    eventType: toEventType(item.eventType),
    startDate: item.startDate.toISOString(),
    endDate: item.endDate.toISOString(),
    title: item.title,
    notes: item.notes,
    tickets: normalizedTickets,
    ticketId: item.ticketId,
    ticketTitle: item.ticketTitle,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listCalendarUsers(): Promise<CalendarUserSummary[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeId: true,
      role: true,
      technicianLevel: true,
    },
  });

  return users.map((user) => ({
    id: user.id,
    label: fullName(user.firstName, user.lastName, user.email),
    employeeId: user.employeeId,
    role: user.role,
    technicianLevel: user.technicianLevel,
  }));
}

export async function listCalendarEvents(rangeStart: Date, rangeEnd: Date): Promise<CalendarEventItem[]> {
  const events = await getScheduleEventDelegate().findMany({
    where: {
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    include: {
      technician: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      createdByUser: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      scheduleEventTickets: {
        select: {
          ticketId: true,
          ticketTitle: true,
        },
      },
    },
  });

  return (events as unknown as EventRecord[]).map(serializeEvent);
}

export async function createCalendarEvent(input: {
  technicianUserId: string;
  createdByUserId: string;
  eventType: CalendarEventType;
  startDate: Date;
  endDate: Date;
  title?: string;
  notes?: string;
  ticketId?: number;
  ticketTitle?: string;
  tickets?: Array<{ ticketId: number; ticketTitle?: string }>;
}) {
  const normalizedTickets = (input.tickets || [])
    .map((ticket) => ({
      ticketId: ticket.ticketId,
      ticketTitle: ticket.ticketTitle,
    }));
  const firstTicket = normalizedTickets[0];

  const created = await getScheduleEventDelegate().create({
    data: {
      technicianUserId: input.technicianUserId,
      createdByUserId: input.createdByUserId,
      eventType: input.eventType,
      startDate: input.startDate,
      endDate: input.endDate,
      title: input.title,
      notes: input.notes,
      ticketId: firstTicket?.ticketId ?? input.ticketId,
      ticketTitle: firstTicket?.ticketTitle ?? input.ticketTitle,
      scheduleEventTickets: normalizedTickets.length > 0
        ? {
            create: normalizedTickets.map((ticket) => ({
              ticketId: ticket.ticketId,
              ticketTitle: ticket.ticketTitle,
            })),
          }
        : undefined,
    },
    include: {
      technician: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      createdByUser: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      scheduleEventTickets: {
        select: {
          ticketId: true,
          ticketTitle: true,
        },
      },
    },
  });

  return serializeEvent(created as unknown as EventRecord);
}

export async function getCalendarEventById(id: string) {
  const event = await getScheduleEventDelegate().findUnique({
    where: { id },
    include: {
      technician: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      createdByUser: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      scheduleEventTickets: {
        select: {
          ticketId: true,
          ticketTitle: true,
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  return serializeEvent(event as unknown as EventRecord);
}

export async function updateCalendarEvent(
  id: string,
  input: {
    technicianUserId?: string;
    eventType?: CalendarEventType;
    startDate?: Date;
    endDate?: Date;
    title?: string;
    notes?: string;
    ticketId?: number | null;
    ticketTitle?: string;
    tickets?: Array<{ ticketId: number; ticketTitle?: string }>;
  },
) {
  const normalizedTickets = input.tickets?.map((ticket) => ({
    ticketId: ticket.ticketId,
    ticketTitle: ticket.ticketTitle,
  }));
  const firstTicket = normalizedTickets?.[0];

  const updated = await getScheduleEventDelegate().update({
    where: { id },
    data: {
      technicianUserId: input.technicianUserId,
      eventType: input.eventType,
      startDate: input.startDate,
      endDate: input.endDate,
      title: input.title,
      notes: input.notes,
      ticketId: firstTicket?.ticketId ?? input.ticketId,
      ticketTitle: firstTicket?.ticketTitle ?? input.ticketTitle,
      scheduleEventTickets:
        normalizedTickets === undefined
          ? undefined
          : {
              deleteMany: {},
              create: normalizedTickets.map((ticket) => ({
                ticketId: ticket.ticketId,
                ticketTitle: ticket.ticketTitle,
              })),
            },
    },
    include: {
      technician: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      createdByUser: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          employeeId: true,
        },
      },
      scheduleEventTickets: {
        select: {
          ticketId: true,
          ticketTitle: true,
        },
      },
    },
  });

  return serializeEvent(updated as unknown as EventRecord);
}

export async function deleteCalendarEvent(id: string) {
  await getScheduleEventDelegate().delete({ where: { id } });
}
