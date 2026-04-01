import { endOfDay, startOfDay } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { isLeadOrAdmin } from "@/lib/auth/access";
import {
  CALENDAR_EVENT_TYPES,
  deleteCalendarEvent,
  getCalendarEventById,
  updateCalendarEvent,
  type CalendarEventType,
} from "@/lib/calendar";
import { updateScheduleEventRequestSchema, getValidationErrorMessage } from "@/lib/validation";
import type { IdRouteContext } from "@/lib/types/api";

function parseDateInput(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
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

export async function PATCH(request: NextRequest, { params }: IdRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id } = await params;
    const existing = await getCalendarEventById(id);
    if (!existing) {
      return NextResponse.json({ error: "Calendar event not found." }, { status: 404 });
    }

    const canManageAll = isLeadOrAdmin(session.user);
    if (!canManageAll && existing.technicianUserId !== session.user.id) {
      return NextResponse.json({ error: "You cannot edit this event." }, { status: 403 });
    }

    const parsedBody = updateScheduleEventRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const payload = parsedBody.data;
    const nextTechnicianUserId = payload.technicianUserId || existing.technicianUserId;

    if (!canManageAll && nextTechnicianUserId !== session.user.id) {
      return NextResponse.json({ error: "Only leads and admins can reassign events." }, { status: 403 });
    }

    const eventType = payload.eventType ? ensureEventType(payload.eventType) : existing.eventType;
    const startDate = payload.startDate ? startOfDay(parseDateInput(payload.startDate, "Start date")) : new Date(existing.startDate);
    const endDate = payload.endDate ? endOfDay(parseDateInput(payload.endDate, "End date")) : new Date(existing.endDate);

    if (endDate < startDate) {
      return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
    }

    const hasTicketPayload = payload.tickets !== undefined || payload.ticketId !== undefined || payload.ticketTitle !== undefined;
    const existingTickets = existing.tickets.map((ticket) => ({
      ticketId: ticket.ticketId,
      ticketTitle: ticket.ticketTitle || undefined,
    }));
    const nextTickets =
      eventType === "ONSITE"
        ? (hasTicketPayload ? normalizeOnsiteTickets(payload) : existingTickets)
        : [];

    const updated = await updateCalendarEvent(id, {
      technicianUserId: nextTechnicianUserId,
      eventType,
      startDate,
      endDate,
      title: payload.title ?? existing.title ?? undefined,
      notes: payload.notes ?? existing.notes ?? undefined,
      tickets: nextTickets,
      ticketId:
        eventType === "ONSITE"
          ? (nextTickets[0]?.ticketId ?? undefined)
          : null,
      ticketTitle:
        eventType === "ONSITE"
          ? (nextTickets[0]?.ticketTitle ?? undefined)
          : undefined,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: IdRouteContext) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  try {
    const { id } = await params;
    const existing = await getCalendarEventById(id);
    if (!existing) {
      return NextResponse.json({ error: "Calendar event not found." }, { status: 404 });
    }

    const canManageAll = isLeadOrAdmin(session.user);
    if (!canManageAll && existing.technicianUserId !== session.user.id) {
      return NextResponse.json({ error: "You cannot delete this event." }, { status: 403 });
    }

    await deleteCalendarEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
