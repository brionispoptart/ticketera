import { NextRequest, NextResponse } from "next/server";

import { ateraFetch, ateraJson, ateraPostTicketNote } from "@/lib/atera";
import { jsonWithEntityTag } from "@/lib/api-response-cache";
import { requireApiUser } from "@/lib/auth/api";
import { getCachedTicketDetail, invalidateTicketCache } from "@/lib/ticket-response-cache";
import { formatTicketActionComment } from "@/lib/ticket-notes";
import type { IdRouteContext } from "@/lib/types/api";
import type { EditableTicket, Ticket } from "@/lib/types/tickets";

function normalizeValue(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isResolvedStatus(value?: string | null) {
  const normalized = normalizeValue(value);
  return normalized.includes("resolved") || normalized.includes("closed") || normalized.includes("done");
}

function formatImpactLabel(value?: string | null) {
  const normalized = (value || "").trim();
  const labels: Record<string, string> = {
    NoImpact: "No Impact",
    Minor: "Minor",
    Major: "Major",
    SiteDown: "Site Down",
  };

  return labels[normalized] || normalized || "Unknown";
}

function priorityRank(value?: string | null) {
  const normalized = normalizeValue(value);

  if (normalized.includes("critical") || normalized.includes("urgent")) {
    return 4;
  }
  if (normalized.includes("high")) {
    return 3;
  }
  if (normalized.includes("medium") || normalized.includes("normal")) {
    return 2;
  }
  if (normalized.includes("low")) {
    return 1;
  }

  return 0;
}

function buildTicketActionComments(current: Ticket, payload: EditableTicket, actor: Parameters<typeof formatTicketActionComment>[1]) {
  const comments: string[] = [];

  if (typeof payload.TicketStatus === "string") {
    const previousStatus = current.TicketStatus || "Unknown";
    const nextStatus = payload.TicketStatus || "Unknown";
    const statusChanged = normalizeValue(previousStatus) !== normalizeValue(nextStatus);

    if (statusChanged) {
      if (isResolvedStatus(previousStatus) && !isResolvedStatus(nextStatus)) {
        comments.push(formatTicketActionComment("Ticket was reopened", actor));
      } else if (!isResolvedStatus(previousStatus) && isResolvedStatus(nextStatus)) {
        comments.push(formatTicketActionComment("Ticket status was changed to Resolved", actor));
      } else {
        comments.push(formatTicketActionComment(`Ticket status was changed to ${nextStatus}`, actor));
      }
    }
  }

  if (typeof payload.TicketPriority === "string") {
    const previousPriority = current.TicketPriority || "";
    const nextPriority = payload.TicketPriority || "";
    if (normalizeValue(previousPriority) !== normalizeValue(nextPriority)) {
      const previousRank = priorityRank(previousPriority);
      const nextRank = priorityRank(nextPriority);

      if (previousRank > 0 && nextRank > 0) {
        if (nextRank > previousRank) {
          comments.push(formatTicketActionComment(`Ticket priority was increased to ${nextPriority || "Unknown"}`, actor));
        } else if (nextRank < previousRank) {
          comments.push(formatTicketActionComment(`Ticket priority was decreased to ${nextPriority || "Unknown"}`, actor));
        } else {
          comments.push(formatTicketActionComment(`Ticket priority was changed to ${nextPriority || "Unknown"}`, actor));
        }
      } else {
        comments.push(formatTicketActionComment(`Ticket priority was changed to ${nextPriority || "Unknown"}`, actor));
      }
    }
  }

  if (typeof payload.TicketImpact === "string") {
    const previousImpact = current.TicketImpact || "";
    const nextImpact = payload.TicketImpact || "";
    if (normalizeValue(previousImpact) !== normalizeValue(nextImpact)) {
      comments.push(formatTicketActionComment(`Ticket impact was changed to ${formatImpactLabel(nextImpact)}`, actor));
    }
  }

  return comments;
}

export async function GET(
  request: NextRequest,
  { params }: IdRouteContext,
) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await params;
    const ticket = await getCachedTicketDetail(id, () => ateraJson<Ticket>(`/tickets/${id}`));
    return jsonWithEntityTag(request, ticket, undefined, `tickets:${id}:detail`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: IdRouteContext,
) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as EditableTicket;
    const currentTicket = await ateraJson<Ticket>(`/tickets/${id}`);

    const payload: EditableTicket = {};
    if (typeof body.TicketTitle === "string") {
      payload.TicketTitle = body.TicketTitle.trim();
    }
    if (typeof body.TicketStatus === "string") {
      payload.TicketStatus = body.TicketStatus.trim();
    }
    if (typeof body.TicketType === "string") {
      payload.TicketType = body.TicketType.trim();
    }
    if (typeof body.TicketPriority === "string") {
      payload.TicketPriority = body.TicketPriority.trim();
    }
    if (typeof body.TicketImpact === "string") {
      payload.TicketImpact = body.TicketImpact.trim();
    }
    if (typeof body.TechnicianContactID === "number" && Number.isInteger(body.TechnicianContactID)) {
      payload.TechnicianContactID = body.TechnicianContactID;
    }
    if (typeof body.TechnicianEmail === "string") {
      payload.TechnicianEmail = body.TechnicianEmail.trim();
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }

    const actionComments = buildTicketActionComments(currentTicket, payload, auth.user);

    const res = await ateraFetch(`/tickets/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = { ok: true };
    }

    const actionCommentWarnings: string[] = [];
    for (const comment of actionComments) {
      try {
        await ateraPostTicketNote(id, comment);
      } catch (error) {
        actionCommentWarnings.push(error instanceof Error ? error.message : "Failed to post action comment.");
      }
    }

    if (actionCommentWarnings.length > 0) {
      data.actionCommentWarning = "Ticket updated, but one or more action comments could not be posted to Atera.";
    }

    invalidateTicketCache(id);

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
