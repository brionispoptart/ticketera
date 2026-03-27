import { NextRequest, NextResponse } from "next/server";

import { ateraJson, ateraPostTicketNote } from "@/lib/atera";
import { jsonWithEntityTag } from "@/lib/api-response-cache";
import { requireApiUser } from "@/lib/auth/api";
import { getCachedTicketComments, invalidateTicketCache } from "@/lib/ticket-response-cache";
import { normalizeRichText } from "@/lib/text";
import { formatTicketNote } from "@/lib/ticket-notes";
import { createWorkLog } from "@/lib/work-logs";
import type { IdRouteContext } from "@/lib/types/api";
import type { AteraComment, AteraCommentsResponse } from "@/lib/types/tickets";
import { getValidationErrorMessage, ticketCommentRequestSchema } from "@/lib/validation";

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

function toSortedDisplayItems(items: AteraComment[]) {
  return items
    .map((item) => {
      const clean = normalizeRichText(item.CommentHtml || item.Comment || "");
      const fullName = `${item.FirstName || ""} ${item.LastName || ""}`.trim();
      return {
        ...item,
        Comment: clean,
        TechnicianFullName: fullName || (item.TechnicianContactID ? `Technician #${item.TechnicianContactID}` : ""),
      };
    })
    .filter((item) => (item.Comment || "").length > 0)
    .sort((a, b) => {
      const at = a.Date ? Date.parse(a.Date) : 0;
      const bt = b.Date ? Date.parse(b.Date) : 0;
      return bt - at;
    });
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
    const payload = await getCachedTicketComments(id, async () => {
      const data = await ateraJson<AteraCommentsResponse>(`/tickets/${id}/comments`);
      return { items: toSortedDisplayItems(Array.isArray(data?.items) ? data.items : []) };
    });
    return jsonWithEntityTag(request, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const parsedBody = ticketCommentRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const message = parsedBody.data.message;
    const hoursWorked = parseHoursWorked(parsedBody.data.hoursWorked);
    const ticketTitle = parsedBody.data.ticketTitle || `Ticket #${id}`;

    const signedMessage = formatTicketNote(message, auth.user, "work", hoursWorked);

    await ateraPostTicketNote(id, signedMessage);

    // Validate that the note is visible in the same comments feed we display.
    const verify = await ateraJson<AteraCommentsResponse>(`/tickets/${id}/comments`);
    const items = Array.isArray(verify?.items) ? verify.items : [];
    const normalizedMessage = normalizeRichText(signedMessage).toLowerCase();
    const found = items.some((item) => {
      const candidate = normalizeRichText(item.Comment || item.CommentHtml || "").toLowerCase();
      return candidate.includes(normalizedMessage);
    });

    if (!found) {
      await createWorkLog({
        userId: auth.user.id,
        ticketId: Number(id),
        ticketTitle,
        entryType: "work_note",
        hoursWorked,
        noteText: message,
        ateraCommentSync: "internal-only",
      });

      return NextResponse.json(
        {
          error:
            "Atera accepted the request, but the note did not appear in the ticket comments feed. This tenant may not support note creation via this API route.",
        },
        { status: 422 },
      );
    }

    await createWorkLog({
      userId: auth.user.id,
      ticketId: Number(id),
      ticketTitle,
      entryType: "work_note",
      hoursWorked,
      noteText: message,
      ateraCommentSync: "synced",
    });

    invalidateTicketCache(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isUpstreamValidation =
      message.includes("Unable to add note") ||
      message.includes("Invalid input") ||
      message.includes("Atera request failed (404)") ||
      message.includes("Atera request failed (400)");

    const friendly = isUpstreamValidation
      ? "This Atera tenant/API key does not support adding ticket comments through the exposed API routes."
      : message;

    return NextResponse.json(
      { error: friendly },
      { status: isUpstreamValidation ? 422 : 500 },
    );
  }
}
