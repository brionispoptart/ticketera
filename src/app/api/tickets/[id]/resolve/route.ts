import { NextRequest, NextResponse } from "next/server";

import { ateraFetch, ateraPostTicketNote } from "@/lib/atera";
import { requireApiUser } from "@/lib/auth/api";
import { invalidateTicketCache } from "@/lib/ticket-response-cache";
import { formatTicketActionComment, formatTicketNote } from "@/lib/ticket-notes";
import { createWorkLog } from "@/lib/work-logs";
import type { IdRouteContext } from "@/lib/types/api";

function parseHoursWorked(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error("Hours worked is required.");
  }

  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Hours worked must be zero or greater.");
  }

  return parsed;
}

export async function POST(
  request: NextRequest,
  { params }: IdRouteContext,
) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const note = typeof body?.message === "string" ? body.message.trim() : "";
    const hoursWorked = parseHoursWorked(body?.hoursWorked);
    const ticketTitle = typeof body?.ticketTitle === "string" ? body.ticketTitle.trim() : `Ticket #${id}`;
    let actionCommentWarning: string | null = null;

    if (note) {
      await ateraPostTicketNote(id, formatTicketNote(note, auth.user, "resolve", hoursWorked));
    }

    await ateraFetch(`/tickets/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ TicketStatus: "Resolved" }),
    });

    try {
      await ateraPostTicketNote(id, formatTicketActionComment("Ticket was resolved", auth.user));
    } catch (error) {
      actionCommentWarning = error instanceof Error ? error.message : "Failed to post action comment.";
    }

    await createWorkLog({
      userId: auth.user.id,
      ticketId: Number(id),
      ticketTitle,
      entryType: "resolve_note",
      hoursWorked,
      noteText: note || null,
      ateraCommentSync: note ? "synced" : "internal-only",
    });

    invalidateTicketCache(id);

    return NextResponse.json({
      ok: true,
      ...(actionCommentWarning
        ? { actionCommentWarning: "Ticket was resolved, but the action comment could not be posted to Atera." }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
