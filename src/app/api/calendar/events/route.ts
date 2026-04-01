import { addDays, endOfDay, startOfDay } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { isLeadOrAdmin } from "@/lib/auth/access";
import {
  CALENDAR_EVENT_TYPES,
  createCalendarEvent,
  listCalendarEvents,
  listCalendarUsers,
  type CalendarEventType,
} from "@/lib/calendar";
import {
  createScheduleEventRequestSchema,
  getValidationErrorMessage,
} from "@/lib/validation";

function parseDateInput(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function normalizeRange(queryValue: string | null, fallback: Date, label: string) {
  if (!queryValue) {
    return fallback;
  }

  return parseDateInput(queryValue, label);
}

function ensureEventType(value: string): CalendarEventType {
  if (CALENDAR_EVENT_TYPES.includes(value as CalendarEventType)) {
    return value as CalendarEventType;
  }
  throw new Error("Event type is invalid.");
}

function normalizeOnsiteTickets(input: { tickets?: Array<{ ticketId: number; ticketTitle?: string }>; ticketId?: number; ticketTitle?: string }) {
  const fromArray = (input.tickets || [])
    .map((ticket) => ({
      ticketId: ticket.ticketId,
      ticketTitle: ticket.ticketTitle,
    }));

  if (fromArray.length > 0) {
    return fromArray;
  }

  if (input.ticketId) {
    return [{ ticketId: input.ticketId, ticketTitle: input.ticketTitle }];
  }

  return [];
}

export async function GET(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const start = startOfDay(normalizeRange(searchParams.get("start"), addDays(now, -45), "Start"));
    const end = endOfDay(normalizeRange(searchParams.get("end"), addDays(now, 90), "End"));

    if (end < start) {
      return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
    }

    const [events, users] = await Promise.all([
      listCalendarEvents(start, end),
      listCalendarUsers(),
    ]);

    return NextResponse.json({
      filters: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      events,
      users,
      canManageAll: isLeadOrAdmin(session.user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const parsedBody = createScheduleEventRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const canManageAll = isLeadOrAdmin(session.user);
    const payload = parsedBody.data;
    const technicianUserId = payload.technicianUserId || session.user.id;

    if (!canManageAll && technicianUserId !== session.user.id) {
      return NextResponse.json({ error: "Only leads and admins can schedule events for other users." }, { status: 403 });
    }

    const eventType = ensureEventType(payload.eventType);
    const startDate = startOfDay(parseDateInput(payload.startDate, "Start date"));
    const endDate = endOfDay(parseDateInput(payload.endDate, "End date"));
    if (endDate < startDate) {
      return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
    }

    const onsiteTickets = eventType === "ONSITE" ? normalizeOnsiteTickets(payload) : [];

    const created = await createCalendarEvent({
      technicianUserId,
      createdByUserId: session.user.id,
      eventType,
      startDate,
      endDate,
      title: payload.title,
      notes: payload.notes,
      tickets: onsiteTickets,
      ticketId: eventType === "ONSITE" ? onsiteTickets[0]?.ticketId : undefined,
      ticketTitle: eventType === "ONSITE" ? onsiteTickets[0]?.ticketTitle : undefined,
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
