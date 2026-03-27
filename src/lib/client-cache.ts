export type CachedResource<T> = {
  data: T;
  etag: string | null;
  savedAt: string;
};

export function readCachedJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCachedJson<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

export function getPayloadFingerprint(value: unknown) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

export async function fetchJsonWithEtag<T>(
  input: string,
  options?: RequestInit & { etag?: string | null },
) {
  const headers = new Headers(options?.headers);
  if (options?.etag) {
    headers.set("If-None-Match", options.etag);
  }

  const response = await fetch(input, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (response.status === 304) {
    return {
      response,
      data: null as T | null,
      etag: response.headers.get("etag") || options?.etag || null,
      notModified: true,
    };
  }

  const data = (await response.json().catch(() => null)) as T | null;
  return {
    response,
    data,
    etag: response.headers.get("etag"),
    notModified: false,
  };
}