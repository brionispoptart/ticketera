import { getConfiguredAteraApiKey } from "@/lib/setup";

const ATERA_API_BASE = process.env.ATERA_API_BASE || "https://app.atera.com/api/v3";
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_SAFE_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(value: string | null) {
  if (!value) {
    return null;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber * 1000;
  }

  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) {
    return null;
  }

  return Math.max(0, asDate - Date.now());
}

async function getApiKey() {
  const key = await getConfiguredAteraApiKey();
  if (!key) {
    throw new Error("Missing Atera API key. Complete setup before using ticket APIs.");
  }
  return key;
}

export async function ateraFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-API-KEY", await getApiKey());
  const method = (init.method || "GET").toUpperCase();
  const canRetrySafely = method === "GET" || method === "HEAD";

  for (let attempt = 0; attempt <= MAX_SAFE_RETRIES; attempt += 1) {
    const response = await fetch(`${ATERA_API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });

    if (response.ok) {
      return response;
    }

    const shouldRetry = canRetrySafely && RETRYABLE_STATUS_CODES.has(response.status) && attempt < MAX_SAFE_RETRIES;
    if (shouldRetry) {
      const retryDelay = parseRetryAfterSeconds(response.headers.get("retry-after")) ?? 1000 * (attempt + 1);
      await sleep(Math.min(retryDelay, 5000));
      continue;
    }

    const body = await response.text();
    throw new Error(`Atera request failed (${response.status}): ${body || response.statusText}`);
  }

  throw new Error("Atera request failed after exhausting retry attempts.");
}

export async function ateraJson<T>(path: string, init: RequestInit = {}) {
  const res = await ateraFetch(path, init);
  return (await res.json()) as T;
}

type AteraConnectionTestResult = {
  label: string | null;
  email: string | null;
};

function getStringField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export async function testAteraConnection(): Promise<AteraConnectionTestResult> {
  const response = await ateraFetch("/account");
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!payload) {
    return { label: null, email: null };
  }

  return {
    label: getStringField(payload, ["AccountName", "CompanyName", "Name"]),
    email: getStringField(payload, ["AccountEmail", "Email"]),
  };
}

const ticketDetailCache = new Map<string, { data: { TechnicianContactID?: number; TechnicianEmail?: string; EndUserID?: number }; expiresAt: number }>();
const TICKET_DETAIL_CACHE_TTL_MS = 30_000;

export async function ateraPostTicketNote(ticketId: string, message: string) {
  const note = message.trim();
  if (!note) {
    throw new Error("Message is required.");
  }

  const cached = ticketDetailCache.get(ticketId);
  let ticket: { TechnicianContactID?: number; TechnicianEmail?: string; EndUserID?: number };

  if (cached && cached.expiresAt > Date.now()) {
    ticket = cached.data;
  } else {
    ticket = await ateraJson<typeof ticket>(`/tickets/${ticketId}`);
    ticketDetailCache.set(ticketId, { data: ticket, expiresAt: Date.now() + TICKET_DETAIL_CACHE_TTL_MS });
  }

  const envTechIdRaw = process.env.ATERA_TECHNICIAN_ID;
  const envTechId = envTechIdRaw ? Number(envTechIdRaw) : undefined;

  const technicianIdCandidates = [ticket.TechnicianContactID, envTechId].filter(
    (value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0,
  );

  const attempts: Array<{ body: Record<string, unknown> }> = [];

  for (const technicianId of technicianIdCandidates) {
    attempts.push({
      body: {
        CommentText: note,
        CommentTimestampUTC: new Date().toISOString(),
        TechnicianCommentDetails: {
          TechnicianId: technicianId,
          IsInternal: true,
          ...(ticket.TechnicianEmail ? { TechnicianEmail: ticket.TechnicianEmail } : {}),
        },
      },
    });

    // Try without timestamp/email in case tenant validation is strict.
    attempts.push({
      body: {
        CommentText: note,
        TechnicianCommentDetails: {
          TechnicianId: technicianId,
          IsInternal: true,
        },
      },
    });
  }

  if (ticket.EndUserID && Number.isInteger(ticket.EndUserID) && ticket.EndUserID > 0) {
    attempts.push({
      body: {
        CommentText: note,
        EnduserCommentDetails: {
          EnduserId: ticket.EndUserID,
        },
      },
    });
  }

  if (attempts.length === 0) {
    throw new Error(
      "Unable to add note: no valid TechnicianContactID found. Set ATERA_TECHNICIAN_ID in your environment.",
    );
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      await ateraFetch(`/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(attempt.body),
      });
      return;
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown error";
      errors.push(text);
      // Continue probing when endpoint or payload shape is rejected.
      const isRetriable = text.includes("(404)") || text.includes("(400)");
      if (!isRetriable) {
        throw error;
      }
    }
  }

  throw new Error(
    `Unable to add note. Tried documented comment payload variants: ${errors.join(" | ")}`,
  );
}
