import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function normalizeEntityTag(value: string) {
  return value.trim();
}

function matchEntityTag(headerValue: string | null, etag: string) {
  if (!headerValue) {
    return false;
  }

  if (headerValue.trim() === "*") {
    return true;
  }

  const candidates = headerValue.split(",").map(normalizeEntityTag);
  return candidates.includes(etag) || candidates.includes(`W/${etag}`) || candidates.includes(etag.replace(/^W\//, ""));
}

export function createJsonEntityTag(payload: unknown) {
  const serialized = JSON.stringify(payload) || "";
  const digest = createHash("sha1").update(serialized).digest("base64url");
  return `W/"${digest}"`;
}

export function jsonWithEntityTag(request: NextRequest, payload: unknown, init?: ResponseInit) {
  const startedAt = Date.now();
  const etag = createJsonEntityTag(payload);
  const headers = new Headers(init?.headers);
  headers.set("Server-Timing", `etag;dur=${Date.now() - startedAt}`);
  headers.set("ETag", etag);
  headers.set("Cache-Control", "private, no-cache, must-revalidate");

  if (matchEntityTag(request.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers,
    });
  }

  return NextResponse.json(payload, {
    ...init,
    headers,
  });
}