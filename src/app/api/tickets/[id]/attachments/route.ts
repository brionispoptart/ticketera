import { NextRequest, NextResponse } from "next/server";

import { ateraJson } from "@/lib/atera";
import { jsonWithEntityTag } from "@/lib/api-response-cache";
import { requireApiUser } from "@/lib/auth/api";
import { getCachedTicketAttachments } from "@/lib/ticket-response-cache";
import type { IdRouteContext } from "@/lib/types/api";

type AttachmentsResponse = {
  items?: unknown[];
};

function normalizeAttachments(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.filter((x): x is string => typeof x === "string");
  }

  if (data && typeof data === "object") {
    const maybeItems = (data as AttachmentsResponse).items;
    if (Array.isArray(maybeItems)) {
      return maybeItems
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item && typeof item === "object") {
            const candidate =
              (item as Record<string, unknown>).Url ||
              (item as Record<string, unknown>).url ||
              (item as Record<string, unknown>).Link ||
              (item as Record<string, unknown>).link;
            return typeof candidate === "string" ? candidate : "";
          }
          return "";
        })
        .filter((x) => x.length > 0);
    }
  }

  return [];
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
    const payload = await getCachedTicketAttachments(id, async () => {
      const data = await ateraJson<unknown>(`/tickets/${id}/attachments`);
      return { items: normalizeAttachments(data) };
    });
    return jsonWithEntityTag(request, payload, undefined, `tickets:${id}:attachments`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
