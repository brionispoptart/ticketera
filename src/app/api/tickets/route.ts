import { NextRequest, NextResponse } from "next/server";

import { ateraJson } from "@/lib/atera";
import { jsonWithEntityTag } from "@/lib/api-response-cache";
import { requireApiUser } from "@/lib/auth/api";
import { getCachedTicketList } from "@/lib/ticket-response-cache";
import type { Ticket, TicketsResponse } from "@/lib/types/tickets";

function toTicketListItem(ticket: Ticket): Ticket {
  return {
    TicketID: ticket.TicketID,
    TicketTitle: ticket.TicketTitle,
    TicketNumber: ticket.TicketNumber,
    TicketPriority: ticket.TicketPriority,
    TicketImpact: ticket.TicketImpact,
    TicketStatus: ticket.TicketStatus,
    EndUserEmail: ticket.EndUserEmail,
    EndUserFirstName: ticket.EndUserFirstName,
    EndUserLastName: ticket.EndUserLastName,
    TechnicianContactID: ticket.TechnicianContactID,
    TechnicianFullName: ticket.TechnicianFullName,
    TicketCreatedDate: ticket.TicketCreatedDate,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const payload = await getCachedTicketList(async () => {
      const data = await ateraJson<TicketsResponse>("/tickets");
      const items = Array.isArray(data.items) ? data.items.map(toTicketListItem) : [];
      return { items };
    });
    return jsonWithEntityTag(request, payload, undefined, "tickets:list");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
