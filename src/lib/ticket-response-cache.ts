type CacheRecord<T> = {
  value?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
};

const cache = new Map<string, CacheRecord<unknown>>();

const TICKET_LIST_TTL_MS = 15_000;
const TICKET_RESOURCE_TTL_MS = 10_000;

function isFresh(record: CacheRecord<unknown> | undefined) {
  return Boolean(record?.value !== undefined && record.expiresAt > Date.now());
}

async function loadThroughCache<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const existing = cache.get(key) as CacheRecord<T> | undefined;
  if (existing && isFresh(existing)) {
    return existing.value as T;
  }

  if (existing?.inFlight) {
    return existing.inFlight;
  }

  const inFlight = loader()
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    value: existing?.value,
    expiresAt: existing?.expiresAt || 0,
    inFlight,
  });

  return inFlight;
}

export function getCachedTicketList<T>(loader: () => Promise<T>) {
  return loadThroughCache("tickets:list", TICKET_LIST_TTL_MS, loader);
}

export function getCachedTicketDetail<T>(ticketId: string, loader: () => Promise<T>) {
  return loadThroughCache(`tickets:${ticketId}:detail`, TICKET_RESOURCE_TTL_MS, loader);
}

export function getCachedTicketComments<T>(ticketId: string, loader: () => Promise<T>) {
  return loadThroughCache(`tickets:${ticketId}:comments`, TICKET_RESOURCE_TTL_MS, loader);
}

export function getCachedTicketAttachments<T>(ticketId: string, loader: () => Promise<T>) {
  return loadThroughCache(`tickets:${ticketId}:attachments`, TICKET_RESOURCE_TTL_MS, loader);
}

export function invalidateTicketCache(ticketId?: string) {
  cache.delete("tickets:list");

  if (!ticketId) {
    return;
  }

  cache.delete(`tickets:${ticketId}:detail`);
  cache.delete(`tickets:${ticketId}:comments`);
  cache.delete(`tickets:${ticketId}:attachments`);
}

export function clearTicketCache() {
  cache.clear();
}