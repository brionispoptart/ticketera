"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type CachedResource, fetchJsonWithEtag, getPayloadFingerprint, readCachedJson, writeCachedJson } from "@/lib/client-cache";
import { normalizeRichText } from "@/lib/text";
import type { Ticket, TicketComment } from "@/lib/types/tickets";

type TicketUpdate = {
  TicketTitle: string;
  TicketStatus: string;
  TicketPriority: string;
  TicketImpact: string;
};

type Attachment = string;

type LocalNote = {
  id: string;
  ticketId: number;
  text: string;
  createdAt: string;
};

type StatusType = "info" | "success" | "error";

type LaneId = "new" | "active" | "done";

type TicketAppBranding = {
  displayName: string;
  accountId: string | null;
  homepageUrl: string | null;
  location: string | null;
  plan: string | null;
  hasAteraBranding: boolean;
  storageKey: string;
};

type TicketListCache = CachedResource<Ticket[]>;
type TicketDetailCacheMap = Record<string, CachedResource<Ticket>>;
type TicketCommentsCacheMap = Record<string, CachedResource<TicketComment[]>>;
type TicketAttachmentsCacheMap = Record<string, CachedResource<Attachment[]>>;

const laneTabs: Array<{ id: LaneId; label: string }> = [
  { id: "new", label: "Open" },
  { id: "active", label: "In Progress" },
  { id: "done", label: "Resolved" },
];

const statusOptions = ["Open", "In Progress"];
const priorityOptions = ["Low", "Medium", "High", "Critical"];
const impactOptions = ["NoImpact", "Minor", "Major", "SiteDown"];
const TICKET_POLL_INTERVAL_MS = 90_000;
const TICKET_REFRESH_COOLDOWN_MS = 30_000;
const TICKET_DETAIL_CACHE_LIMIT = 30;

// Map display names to Atera API status values
const statusDisplayToApiMap: Record<string, string> = {
  "Open": "Open",
  "In Progress": "Pending",
  "Done": "Resolved",
};

const statusApiToDisplayMap: Record<string, string> = {
  "Open": "Open",
  "Pending": "In Progress",
  "Resolved": "Done",
  "Closed": "Done",
};

function toDisplayStatus(apiStatus?: string) {
  if (!apiStatus) return "Open";
  return statusApiToDisplayMap[apiStatus] || apiStatus;
}

function toApiStatus(displayStatus: string) {
  return statusDisplayToApiMap[displayStatus] || displayStatus;
}

function formatImpactLabel(value: string) {
  const labels: Record<string, string> = {
    NoImpact: "No Impact",
    Minor: "Minor",
    Major: "Major",
    SiteDown: "Site Down",
  };
  return labels[value] || value;
}

function normalizeStatus(status?: string) {
  return (status || "").trim().toLowerCase();
}

function normalizeHoursInput(value: string) {
  return value.trim();
}

function isValidHoursInput(value: string) {
  const trimmed = normalizeHoursInput(value);
  if (!trimmed) {
    return false;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0;
}

function statusLane(status?: string): LaneId {
  const s = normalizeStatus(status);
  if (s.includes("resolve") || s.includes("close") || s.includes("done") || s.includes("complete")) {
    return "done";
  }
  if (s.includes("open") || s.includes("new") || s.includes("created")) {
    return "new";
  }
  return "active";
}

const OVERVIEW_TAG_BASE_CLASS = "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap";

function statusBadgeClass(status?: string) {
  const lane = statusLane(status);
  if (lane === "done") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
  if (lane === "new") {
    return "border-teal-500/40 bg-teal-500/10 text-teal-300";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-300";
}

function priorityBadgeClass(priority?: string) {
  const p = (priority || "").trim().toLowerCase();
  if (p.includes("critical") || p.includes("urgent")) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  }
  if (p.includes("high")) {
    return "border-orange-500/40 bg-orange-500/10 text-orange-300";
  }
  if (p.includes("medium") || p.includes("normal")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return "border-teal-500/40 bg-teal-500/10 text-teal-300";
}

function impactBadgeClass(impact?: string) {
  const i = (impact || "").trim().toLowerCase();
  if (i.includes("sitedown") || i.includes("site down") || i.includes("major")) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  }
  if (i.includes("minor")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
}

function formatShortDate(value?: string) {
  if (!value) {
    return "";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString();
}

function renderOverviewTag(label: string, toneClass: string) {
  return <span className={`${OVERVIEW_TAG_BASE_CLASS} ${toneClass}`}>{label}</span>;
}

function cleanCommentText(comment?: TicketComment) {
  const flattened = normalizeRichText(comment?.Comment || comment?.CommentHtml || "");
  return flattened || "(No text)";
}

function formatCommentDate(value?: string) {
  if (!value) {
    return "Unknown time";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function TicketApp({ brand }: { brand: TicketAppBranding }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [currentTab, setCurrentTab] = useState<LaneId>("new");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [workNote, setWorkNote] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [resolveHours, setResolveHours] = useState("");
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState<TicketUpdate>({
    TicketTitle: "",
    TicketStatus: "Open",
    TicketPriority: "Low",
    TicketImpact: "NoImpact",
  });
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<{ message: string; type: StatusType } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [isAttachmentsLoading, setIsAttachmentsLoading] = useState(false);
  const [noteWriteUnsupported, setNoteWriteUnsupported] = useState(false);
  const [localNotes, setLocalNotes] = useState<LocalNote[]>([]);
  const [isReopenConfirmOpen, setIsReopenConfirmOpen] = useState(false);
  const lastTicketsSyncAtRef = useRef(0);
  const ticketsFingerprintRef = useRef("");
  const ticketsEtagRef = useRef<string | null>(null);
  const ticketDetailsCacheRef = useRef<TicketDetailCacheMap>({});
  const ticketCommentsCacheRef = useRef<TicketCommentsCacheMap>({});
  const ticketAttachmentsCacheRef = useRef<TicketAttachmentsCacheMap>({});
  const normalizedCommentCacheRef = useRef<Record<string, string>>({});
  const ticketLoadInFlightRef = useRef(false);
  const ticketLoadQueuedRef = useRef(false);
  const ticketSelectionControllerRef = useRef<AbortController | null>(null);
  const isResolvedTicket = useMemo(
    () => statusLane(ticketForm.TicketStatus || selected?.TicketStatus) === "done",
    [selected?.TicketStatus, ticketForm.TicketStatus],
  );

  const LOCAL_NOTES_KEY = useMemo(() => `ticketera.localNotes.${brand.storageKey}.v1`, [brand.storageKey]);
  const TICKETS_CACHE_KEY = useMemo(() => `ticketera.tickets.${brand.storageKey}.v1`, [brand.storageKey]);
  const TICKET_DETAILS_CACHE_KEY = useMemo(() => `ticketera.ticket-details.${brand.storageKey}.v1`, [brand.storageKey]);
  const TICKET_COMMENTS_CACHE_KEY = useMemo(() => `ticketera.ticket-comments.${brand.storageKey}.v1`, [brand.storageKey]);
  const TICKET_ATTACHMENTS_CACHE_KEY = useMemo(() => `ticketera.ticket-attachments.${brand.storageKey}.v1`, [brand.storageKey]);

  function pruneResourceMap<T>(map: Record<string, CachedResource<T>>) {
    const entries = Object.entries(map)
      .sort((left, right) => Date.parse(right[1].savedAt) - Date.parse(left[1].savedAt))
      .slice(0, TICKET_DETAIL_CACHE_LIMIT);

    return Object.fromEntries(entries);
  }

  function updateTicketDetailCache(ticketId: number, resource: CachedResource<Ticket>) {
    const next = pruneResourceMap({
      ...ticketDetailsCacheRef.current,
      [String(ticketId)]: resource,
    });
    ticketDetailsCacheRef.current = next;
    writeCachedJson(TICKET_DETAILS_CACHE_KEY, next);
  }

  function updateTicketCommentsCache(ticketId: number, resource: CachedResource<TicketComment[]>) {
    const next = pruneResourceMap({
      ...ticketCommentsCacheRef.current,
      [String(ticketId)]: resource,
    });
    ticketCommentsCacheRef.current = next;
    writeCachedJson(TICKET_COMMENTS_CACHE_KEY, next);
  }

  function updateTicketAttachmentsCache(ticketId: number, resource: CachedResource<Attachment[]>) {
    const next = pruneResourceMap({
      ...ticketAttachmentsCacheRef.current,
      [String(ticketId)]: resource,
    });
    ticketAttachmentsCacheRef.current = next;
    writeCachedJson(TICKET_ATTACHMENTS_CACHE_KEY, next);
  }

  const filtered = useMemo(() => {
    return tickets
      .filter((ticket) => {
      const q = deferredSearch.trim().toLowerCase();
      if (!q) {
        const lane = statusLane(ticket.TicketStatus);
        return lane === currentTab;
      }

      const haystack = [
        ticket.TicketTitle,
        ticket.TicketNumber,
        ticket.EndUserEmail,
        ticket.EndUserFirstName,
        ticket.EndUserLastName,
        String(ticket.TicketID),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
      })
      .sort((a, b) => {
        const at = a.TicketCreatedDate ? Date.parse(a.TicketCreatedDate) : 0;
        const bt = b.TicketCreatedDate ? Date.parse(b.TicketCreatedDate) : 0;
        return bt - at;
      });
  }, [tickets, currentTab, deferredSearch]);

  const counts = useMemo(() => {
    let open = 0;
    let progress = 0;

    for (const ticket of tickets) {
      const lane = statusLane(ticket.TicketStatus);
      if (lane === "new") {
        open += 1;
      } else if (lane === "active") {
        progress += 1;
      }
    }

    return {
      open,
      progress,
    };
  }, [tickets]);

  const visibleComments = useMemo(() => {
    return comments
      .map((comment) => {
        const cacheKey = `${selected?.TicketID || "unknown"}|${comment.Date || ""}|${comment.Comment || ""}|${comment.CommentHtml || ""}`;
        const cached = normalizedCommentCacheRef.current[cacheKey];
        const normalized = cached ?? normalizeRichText(comment.Comment || comment.CommentHtml || "");
        if (cached === undefined) {
          normalizedCommentCacheRef.current[cacheKey] = normalized;
        }

        return {
          ...comment,
          _clean: normalized,
        };
      })
      .filter((comment) => comment._clean.length > 0)
      .sort((a, b) => {
        const at = a.Date ? Date.parse(a.Date) : 0;
        const bt = b.Date ? Date.parse(b.Date) : 0;
        return bt - at;
      });
  }, [comments, selected?.TicketID]);

  const visibleLocalNotes = useMemo(
    () => localNotes.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [localNotes],
  );

  const activityItems = useMemo(() => {
    const remote = visibleComments.map((comment) => ({
      key: `remote-${comment.Date || "unknown"}-${comment.Comment || comment.CommentHtml || ""}`,
      date: comment.Date,
      author: comment.TechnicianFullName || "Atera",
      text: cleanCommentText(comment),
      source: "remote" as const,
    }));

    const local = visibleLocalNotes.map((note) => ({
      key: `local-${note.id}`,
      date: note.createdAt,
      author: "Local note",
      text: note.text,
      source: "local" as const,
    }));

    return [...remote, ...local].sort((a, b) => {
      const at = a.date ? Date.parse(a.date) : 0;
      const bt = b.date ? Date.parse(b.date) : 0;
      return bt - at;
    });
  }, [visibleComments, visibleLocalNotes]);

  function readAllLocalNotes(): LocalNote[] {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(LOCAL_NOTES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadLocalNotes(ticketId: number) {
    const all = readAllLocalNotes();
    setLocalNotes(all.filter((note) => note.ticketId === ticketId));
  }

  function saveLocalNote(ticketId: number, text: string) {
    const all = readAllLocalNotes();
    const next: LocalNote = {
      id: `${ticketId}-${Date.now()}`,
      ticketId,
      text,
      createdAt: new Date().toISOString(),
    };
    const updated = [...all, next];
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(updated));
    }
    setLocalNotes(updated.filter((note) => note.ticketId === ticketId));
  }

  function applySelectedTicket(detailed: Ticket) {
    setSelected(detailed);
    setTicketForm({
      TicketTitle: detailed.TicketTitle || "",
      TicketStatus: toDisplayStatus(detailed.TicketStatus),
      TicketPriority: detailed.TicketPriority || "Low",
      TicketImpact: detailed.TicketImpact || "NoImpact",
    });
  }

  function syncTicketInList(nextTicket: Ticket) {
    setTickets((current) => current.map((ticket) => (ticket.TicketID === nextTicket.TicketID ? { ...ticket, ...nextTicket } : ticket)));
  }

  async function copyTicketId() {
    if (!selected) {
      return;
    }
    try {
      await navigator.clipboard.writeText(String(selected.TicketID));
      setStatus({ message: `Copied ticket #${selected.TicketID}.`, type: "info" });
    } catch {
      setStatus({ message: "Could not copy ticket ID.", type: "error" });
    }
  }

  async function refreshSelectedTicket() {
    if (!selected) {
      return;
    }
    setStatus(null);
    try {
      await Promise.all([
        loadTicketDetails(selected.TicketID),
        loadTicketComments(selected.TicketID),
        loadAttachments(selected.TicketID),
      ]);
      setStatus({ message: `Refreshed ticket #${selected.TicketID}.`, type: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh selected ticket.";
      setStatus({ message, type: "error" });
    }
  }

  const loadTickets = useCallback(async (options?: { showToast?: boolean }) => {
    if (ticketLoadInFlightRef.current) {
      ticketLoadQueuedRef.current = true;
      return;
    }

    ticketLoadInFlightRef.current = true;
    const showToast = options?.showToast ?? true;
    if (showToast) {
      setStatus(null);
    }

    try {
      const { response, data, etag, notModified } = await fetchJsonWithEtag<{ items?: Ticket[]; error?: string }>("/api/tickets", {
        etag: ticketsEtagRef.current,
      });

      if (notModified) {
        const syncedAt = new Date().toISOString();
        setLastSyncedAt(syncedAt);
        lastTicketsSyncAtRef.current = Date.now();

        if (showToast) {
          setStatus({ message: `Checked ${tickets.length} ticket(s); no changes found.`, type: "success" });
        }

        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load tickets.");
      }

      const items: Ticket[] = Array.isArray(data?.items) ? (data.items as Ticket[]) : [];
      const syncedAt = new Date().toISOString();
      const nextFingerprint = getPayloadFingerprint(items);
      const didChange = nextFingerprint !== ticketsFingerprintRef.current;
      ticketsEtagRef.current = etag;

      if (didChange) {
        ticketsFingerprintRef.current = nextFingerprint;
        setTickets(items);
        writeCachedJson<TicketListCache>(TICKETS_CACHE_KEY, { data: items, etag, savedAt: syncedAt });
      }

      setLastSyncedAt(syncedAt);
      lastTicketsSyncAtRef.current = Date.now();

      if (selected) {
        const updatedSelection = items.find((t) => t.TicketID === selected.TicketID) || null;
        if (!updatedSelection) {
          setSelected(null);
          setComments([]);
          setAttachments([]);
          setLocalNotes([]);
        }
      }

      if (showToast) {
        setStatus({
          message: didChange ? `Loaded ${items.length} ticket(s).` : `Checked ${items.length} ticket(s); no changes found.`,
          type: "success",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load tickets.";
      setStatus({ message, type: "error" });
    } finally {
      ticketLoadInFlightRef.current = false;
      if (ticketLoadQueuedRef.current) {
        ticketLoadQueuedRef.current = false;
        void loadTickets({ showToast: false });
      }
    }
  }, [TICKETS_CACHE_KEY, selected, tickets.length]);

  useEffect(() => {
    const cached = readCachedJson<TicketListCache>(TICKETS_CACHE_KEY);
    if (!cached?.data) {
      return;
    }

    ticketsFingerprintRef.current = getPayloadFingerprint(cached.data);
    ticketsEtagRef.current = cached.etag;
    setTickets(cached.data);
    setLastSyncedAt(cached.savedAt || "");
    lastTicketsSyncAtRef.current = cached.savedAt ? Date.parse(cached.savedAt) || 0 : 0;
  }, [TICKETS_CACHE_KEY]);

  useEffect(() => {
    ticketDetailsCacheRef.current = readCachedJson<TicketDetailCacheMap>(TICKET_DETAILS_CACHE_KEY) || {};
    ticketCommentsCacheRef.current = readCachedJson<TicketCommentsCacheMap>(TICKET_COMMENTS_CACHE_KEY) || {};
    ticketAttachmentsCacheRef.current = readCachedJson<TicketAttachmentsCacheMap>(TICKET_ATTACHMENTS_CACHE_KEY) || {};
  }, [TICKET_ATTACHMENTS_CACHE_KEY, TICKET_COMMENTS_CACHE_KEY, TICKET_DETAILS_CACHE_KEY]);

  useEffect(() => {
    void loadTickets({ showToast: false });
  }, [loadTickets]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadTickets({ showToast: false });
    }, TICKET_POLL_INTERVAL_MS);

    const maybeRefreshTickets = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (Date.now() - lastTicketsSyncAtRef.current < TICKET_REFRESH_COOLDOWN_MS) {
        return;
      }

      void loadTickets({ showToast: false });
    };

    window.addEventListener("focus", maybeRefreshTickets);
    document.addEventListener("visibilitychange", maybeRefreshTickets);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", maybeRefreshTickets);
      document.removeEventListener("visibilitychange", maybeRefreshTickets);
    };
  }, [loadTickets]);

  useEffect(() => {
    setCurrentTab((current) => {
      if (counts.open > 0) {
        return "new";
      }

      return current === "new" ? "active" : current;
    });
  }, [counts.open]);

  async function loadTicketComments(ticketId: number, options?: { signal?: AbortSignal }) {
    setIsCommentsLoading(true);
    try {
      const cached = ticketCommentsCacheRef.current[String(ticketId)];
      const { response, data, etag, notModified } = await fetchJsonWithEtag<{ items?: TicketComment[]; error?: string }>(`/api/tickets/${ticketId}/comments`, {
        etag: cached?.etag,
        signal: options?.signal,
      });

      if (notModified && cached) {
        setComments(cached.data);
        return cached.data;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load ticket notes.");
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setComments(items);
      updateTicketCommentsCache(ticketId, { data: items, etag, savedAt: new Date().toISOString() });
      return items;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return ticketCommentsCacheRef.current[String(ticketId)]?.data || [];
      }

      const cached = ticketCommentsCacheRef.current[String(ticketId)];
      if (!cached) {
        setComments([]);
      }
      return cached?.data || [];
    } finally {
      setIsCommentsLoading(false);
    }
  }

  async function loadAttachments(ticketId: number, options?: { signal?: AbortSignal }) {
    setIsAttachmentsLoading(true);
    try {
      const cached = ticketAttachmentsCacheRef.current[String(ticketId)];
      const { response, data, etag, notModified } = await fetchJsonWithEtag<{ items?: Attachment[]; error?: string }>(`/api/tickets/${ticketId}/attachments`, {
        etag: cached?.etag,
        signal: options?.signal,
      });

      if (notModified && cached) {
        setAttachments(cached.data);
        return cached.data;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load attachments.");
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setAttachments(items);
      updateTicketAttachmentsCache(ticketId, { data: items, etag, savedAt: new Date().toISOString() });
      return items;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return ticketAttachmentsCacheRef.current[String(ticketId)]?.data || [];
      }

      const cached = ticketAttachmentsCacheRef.current[String(ticketId)];
      if (!cached) {
        setAttachments([]);
      }
      return cached?.data || [];
    } finally {
      setIsAttachmentsLoading(false);
    }
  }

  async function loadTicketDetails(ticketId: number, options?: { signal?: AbortSignal }) {
    const cached = ticketDetailsCacheRef.current[String(ticketId)];
    const { response, data, etag, notModified } = await fetchJsonWithEtag<Ticket & { error?: string }>(`/api/tickets/${ticketId}`, {
      etag: cached?.etag,
      signal: options?.signal,
    });

    if (notModified && cached) {
      applySelectedTicket(cached.data);
      return cached.data;
    }

    if (!response.ok) {
      throw new Error(data?.error || "Failed to load ticket details.");
    }

    const detailed = data as Ticket;
    applySelectedTicket(detailed);
    updateTicketDetailCache(ticketId, { data: detailed, etag, savedAt: new Date().toISOString() });
    return detailed;
  }

  async function selectTicket(ticket: Ticket) {
    if (ticketSelectionControllerRef.current) {
      ticketSelectionControllerRef.current.abort();
    }
    const controller = new AbortController();
    ticketSelectionControllerRef.current = controller;

    setWorkNote("");
    setStatus(null);
    loadLocalNotes(ticket.TicketID);

    const cachedDetail = ticketDetailsCacheRef.current[String(ticket.TicketID)];
    if (cachedDetail) {
      applySelectedTicket(cachedDetail.data);
    } else {
      applySelectedTicket(ticket);
    }

    const cachedComments = ticketCommentsCacheRef.current[String(ticket.TicketID)];
    if (cachedComments) {
      setComments(cachedComments.data);
    }

    const cachedAttachments = ticketAttachmentsCacheRef.current[String(ticket.TicketID)];
    if (cachedAttachments) {
      setAttachments(cachedAttachments.data);
    }

    try {
      await Promise.all([
        loadTicketDetails(ticket.TicketID, { signal: controller.signal }),
        loadTicketComments(ticket.TicketID, { signal: controller.signal }),
        loadAttachments(ticket.TicketID, { signal: controller.signal }),
      ]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      const message = error instanceof Error ? error.message : "Failed to load ticket details.";
      setStatus({ message, type: "error" });
    }
  }

  useEffect(() => {
    return () => {
      if (ticketSelectionControllerRef.current) {
        ticketSelectionControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    normalizedCommentCacheRef.current = {};
  }, [selected?.TicketID]);

  async function saveTicketChanges(options?: { overrideStatus?: string; overridePriority?: string; overrideImpact?: string; autosave?: boolean }) {
    if (!selected) {
      return;
    }

    setIsUpdatingTicket(true);
    setStatus(null);
    try {
      const previousStatus = selected.TicketStatus || "";
      const payload = {
        TicketTitle: ticketForm.TicketTitle,
        TicketStatus: toApiStatus(options?.overrideStatus ?? ticketForm.TicketStatus),
        TicketPriority: options?.overridePriority ?? ticketForm.TicketPriority,
        TicketImpact: options?.overrideImpact ?? ticketForm.TicketImpact,
      };

      const res = await fetch(`/api/tickets/${selected.TicketID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update ticket.");
      }

      const statusChanged = normalizeStatus(payload.TicketStatus) !== normalizeStatus(previousStatus);

      const detailed = await loadTicketDetails(selected.TicketID);
      syncTicketInList(detailed);
      await Promise.all([
        loadTicketComments(selected.TicketID),
        loadAttachments(selected.TicketID),
      ]);

      setStatus({
        message: options?.autosave
          ? "Ticket changed and dashboard resynced."
          : statusChanged
            ? "Ticket status updated and dashboard resynced."
            : "Ticket updated and dashboard resynced.",
        type: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update ticket.";
      setStatus({ message, type: "error" });
    } finally {
      setIsUpdatingTicket(false);
    }
  }

  async function saveNote() {
    if (!selected) {
      setStatus({ message: "Select a ticket first.", type: "error" });
      return;
    }

    const message = workNote.trim();
    if (!message) {
      setStatus({ message: "Enter a note before saving.", type: "error" });
      return;
    }

    if (!isValidHoursInput(workHours)) {
      setStatus({ message: "Enter hours worked before saving the note.", type: "error" });
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/tickets/${selected.TicketID}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          hoursWorked: normalizeHoursInput(workHours),
          ticketTitle: selected.TicketTitle,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 422) {
          setNoteWriteUnsupported(true);
          saveLocalNote(selected.TicketID, message);
          setWorkNote("");
          setWorkHours("");
          setStatus({
            message:
              "Atera comment write is unsupported for this tenant/key. Note saved locally in this app.",
            type: "info",
          });
          return;
        }
        throw new Error(data?.error || "Failed to save note.");
      }

      setNoteWriteUnsupported(false);
      setWorkNote("");
      setWorkHours("");
      setStatus({ message: "Note saved.", type: "success" });
      await loadTicketComments(selected.TicketID);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to save note.";
      setStatus({ message: text, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  function openResolveDialog() {
    if (!selected) {
      setStatus({ message: "Select a ticket first.", type: "error" });
      return;
    }

    setResolveNote(workNote.trim());
    setResolveHours(normalizeHoursInput(workHours));
    setIsResolveDialogOpen(true);
  }

  function closeResolveDialog() {
    if (isSaving) {
      return;
    }

    setIsResolveDialogOpen(false);
  }

  async function resolveTicket() {
    if (!selected) {
      setStatus({ message: "Select a ticket first.", type: "error" });
      return;
    }

    if (!isValidHoursInput(resolveHours)) {
      setStatus({ message: "Enter hours worked before resolving the ticket.", type: "error" });
      return;
    }

    setIsSaving(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/tickets/${selected.TicketID}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: resolveNote.trim(),
          hoursWorked: normalizeHoursInput(resolveHours),
          ticketTitle: selected.TicketTitle,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to resolve ticket.");
      }

      setIsResolveDialogOpen(false);
      setResolveNote("");
        setResolveHours("");
        syncTicketInList({ ...selected, TicketStatus: "Resolved" });
      setSelected(null);
      setWorkNote("");
        setWorkHours("");
      setStatus({ message: "Ticket marked as resolved.", type: "success" });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to resolve ticket.";
      setStatus({ message: text, type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function reopenTicket() {
    if (!selected) {
      setStatus({ message: "Select a ticket first.", type: "error" });
      return;
    }

    setIsReopenConfirmOpen(false);
    await saveTicketChanges({ overrideStatus: "Open", autosave: true });
    setCurrentTab("new");
  }

  function handleStatusChange(nextStatus: string) {
    setTicketForm((prev) => ({ ...prev, TicketStatus: nextStatus }));

    if (!selected || isUpdatingTicket) {
      return;
    }

    if (normalizeStatus(nextStatus) === normalizeStatus(selected.TicketStatus)) {
      return;
    }

    void saveTicketChanges({ overrideStatus: nextStatus, autosave: true });
  }

  function handlePriorityChange(nextPriority: string) {
    setTicketForm((prev) => ({ ...prev, TicketPriority: nextPriority }));

    if (!selected || isUpdatingTicket) {
      return;
    }

    if (normalizeStatus(nextPriority) === normalizeStatus(selected.TicketPriority)) {
      return;
    }

    void saveTicketChanges({ overridePriority: nextPriority, autosave: true });
  }

  function handleImpactChange(nextImpact: string) {
    setTicketForm((prev) => ({ ...prev, TicketImpact: nextImpact }));

    if (!selected || isUpdatingTicket) {
      return;
    }

    if (normalizeStatus(nextImpact) === normalizeStatus(selected.TicketImpact)) {
      return;
    }

    void saveTicketChanges({ overrideImpact: nextImpact, autosave: true });
  }

  function handleTabClick(nextTab: LaneId) {
    setCurrentTab(nextTab);
    setSearch("");
  }

  function closeSelectedTicket() {
    setSelected(null);
    setComments([]);
    setAttachments([]);
    setLocalNotes([]);
    setIsReopenConfirmOpen(false);
    setResolveNote("");
    setResolveHours("");
    setIsResolveDialogOpen(false);
    setWorkNote("");
    setWorkHours("");
    setStatus(null);
  }

  return (
    <div
      className={[
        "ticket-shell grid gap-6 transition-[grid-template-columns] duration-300 ease-in-out",
        selected ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1",
      ].join(" ")}
    >
      <Card
        className={[
          "ticket-card ticket-card--list shadow-xl shadow-black/40 transition-all duration-300 ease-out",
          selected ? "hidden xl:block" : "block",
        ].join(" ")}
      >
        <CardContent className="p-4">
          <div className="ticket-panel mb-4 rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3">
            <div className="mb-3 border-b border-zinc-800 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    {brand.hasAteraBranding ? "Atera Workspace Queue" : "Ticket Queue"}
                  </div>
                  <div className="text-sm font-semibold text-zinc-100">{brand.displayName}</div>
                  <div className="text-xs text-zinc-500">
                    {[brand.location, brand.plan].filter(Boolean).join(" · ") || "Current operator workspace"}
                  </div>
                </div>
                <div className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-300">
                  {brand.hasAteraBranding ? "Brand Synced" : "Ticketera"}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="ticket-action-strip flex flex-wrap gap-1.5">
                {laneTabs.map((tab) => (
                  <Button
                    key={tab.id}
                    size="sm"
                    variant={search.trim() ? "secondary" : currentTab === tab.id ? "default" : "secondary"}
                    onClick={() => handleTabClick(tab.id)}
                    className="ticket-action-btn ticket-tab-btn flex-shrink-0"
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>

              <div className="flex min-w-0 w-full flex-1 gap-2 sm:max-w-72">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tickets..."
                  className="h-9"
                />
                {search ? (
                  <Button size="sm" variant="outline" onClick={() => setSearch("")} className="ticket-action-btn shrink-0">Clear</Button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 border-t border-zinc-800 pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {lastSyncedAt ? (
                  <div className="text-[11px] text-zinc-500">Synced {formatShortDate(lastSyncedAt)}</div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Badge className="ticket-chip" variant={counts.open > 0 ? "success" : "secondary"}>Open {counts.open}</Badge>
                  <Badge className="ticket-chip" variant={counts.progress > 0 ? "success" : "secondary"}>In Progress {counts.progress}</Badge>
                </div>
              </div>
            </div>
          </div>

        {status ? (
          <div
            className={[
              "ticket-fade-in mb-4 rounded-md border px-3 py-2 text-sm transition-all duration-200 ease-out",
              status.type === "success"
                ? "border-lime-500/40 bg-lime-500/10 text-lime-300"
                : status.type === "error"
                  ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300",
            ].join(" ")}
          >
            {status.message}
          </div>
        ) : null}

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
              No matching tickets found.
            </div>
          ) : (
            filtered.map((ticket) => (
              <Button
                key={ticket.TicketID}
                type="button"
                onClick={() => void selectTicket(ticket)}
                variant="outline"
                className="ticket-row h-auto w-full justify-start rounded-lg border-zinc-800 bg-zinc-950 p-3 text-left hover:bg-zinc-950"
              >
                <div className="w-full">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-zinc-300">#{ticket.TicketID}</div>
                    <div className="mt-1 truncate text-sm font-semibold text-zinc-100">{ticket.TicketTitle}</div>
                  </div>
                  <div className="flex flex-wrap justify-start gap-1 sm:max-w-60 sm:justify-end">
                    {renderOverviewTag(ticket.TicketPriority || "Low", priorityBadgeClass(ticket.TicketPriority))}
                    {renderOverviewTag(formatImpactLabel(ticket.TicketImpact || "NoImpact"), impactBadgeClass(ticket.TicketImpact))}
                    {renderOverviewTag(ticket.TicketStatus || "Unknown", statusBadgeClass(ticket.TicketStatus))}
                  </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500 truncate">
                    {(ticket.EndUserFirstName || ticket.EndUserLastName) && (ticket.EndUserFirstName || "") + " " + (ticket.EndUserLastName || "")}
                    {ticket.EndUserEmail && ` • ${ticket.EndUserEmail}`}
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
        </CardContent>
      </Card>

      {selected ? (
      <Card className="ticket-card ticket-card--details ticket-fade-in shadow-xl shadow-black/40 transition-all duration-300 ease-out xl:block">
        <CardHeader className="gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
            <Button
              onClick={closeSelectedTicket}
              size="sm"
              variant="outline"
              className="ticket-action-btn h-10 w-10 p-0 sm:h-8 sm:w-8"
              title="Close ticket view"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex min-w-0 flex-1 items-stretch">
              <Button
                onClick={() => void copyTicketId()}
                variant="outline"
                className="ticket-action-btn h-10 min-w-0 flex-1 justify-start rounded-r-none border-pink-400/45 bg-pink-400/15 px-3 text-sm font-semibold text-pink-300 hover:bg-pink-400/25 sm:h-8"
                title="Copy ticket ID"
              >
                <span className="sm:hidden truncate">#{selected.TicketID}</span>
                <span className="hidden sm:inline truncate">Ticket #{selected.TicketID}</span>
              </Button>
              <Button
                onClick={() => void copyTicketId()}
                size="sm"
                variant="outline"
                className="ticket-action-btn h-10 w-10 rounded-l-none border-l-0 border-pink-400/45 bg-pink-400/15 p-0 text-pink-300 hover:bg-pink-400/25 sm:h-8 sm:w-8"
                title="Copy ID"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                onClick={() => void refreshSelectedTicket()}
                disabled={isCommentsLoading || isAttachmentsLoading}
                size="sm"
                variant="outline"
                className="ticket-action-btn h-10 w-10 p-0 sm:h-8 sm:w-8"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {!isResolvedTicket ? (
                <Button
                  onClick={openResolveDialog}
                  disabled={isSaving}
                  size="sm"
                  variant="outline"
                  className="ticket-action-btn h-10 w-10 border-lime-500/40 bg-lime-500/10 p-0 text-lime-300 hover:bg-lime-500/20 sm:h-8 sm:w-8"
                  title="Resolve ticket"
                >
                  <Check className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/55 p-3">
            <div className="flex flex-wrap gap-1.5">
              {renderOverviewTag(ticketForm.TicketStatus || selected.TicketStatus || "Unknown", statusBadgeClass(ticketForm.TicketStatus || selected.TicketStatus))}
              {renderOverviewTag(ticketForm.TicketPriority || selected.TicketPriority || "Low", priorityBadgeClass(ticketForm.TicketPriority || selected.TicketPriority))}
              {renderOverviewTag(formatImpactLabel(ticketForm.TicketImpact || selected.TicketImpact || "NoImpact"), impactBadgeClass(ticketForm.TicketImpact || selected.TicketImpact))}
            </div>
            <div className="mt-3 text-base font-semibold leading-6 text-zinc-100">
              {selected.TicketTitle}
            </div>
            <div className="mt-1 text-sm leading-6 text-zinc-400">
              {selected.TicketDescription || "No description provided."}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 sm:p-4 sm:pt-0">

          <div className="space-y-3 sm:space-y-4">
            {isResolvedTicket ? (
              <section className="ticket-panel rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3 sm:p-4">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ticket Status</h3>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="text-sm font-semibold text-zinc-100">This ticket is resolved.</div>
                  <div className="mt-1 text-sm leading-6 text-zinc-400">
                    Reopen it to move it back into the active queue and restore editable ticket fields.
                  </div>

                  {isReopenConfirmOpen ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                        Reopen ticket #{selected.TicketID}?
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => setIsReopenConfirmOpen(false)}
                          variant="outline"
                          className="ticket-action-btn"
                          disabled={isUpdatingTicket}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => void reopenTicket()}
                          className="ticket-action-btn bg-zinc-100 text-zinc-950 hover:bg-white"
                          disabled={isUpdatingTicket}
                        >
                          {isUpdatingTicket ? "Reopening..." : "Confirm reopen"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setIsReopenConfirmOpen(true)}
                      variant="outline"
                      className="ticket-action-btn mt-4 w-full border-zinc-700 bg-zinc-950/70 text-zinc-100 hover:bg-zinc-900"
                      disabled={isUpdatingTicket}
                    >
                      Reopen ticket
                    </Button>
                  )}
                </div>
              </section>
            ) : (
              <section className="ticket-panel rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3 sm:p-4">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ticket Fields</h3>
                <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ticketStatus">Status</Label>
                    <Select
                      value={ticketForm.TicketStatus}
                      onValueChange={handleStatusChange}
                      disabled={isUpdatingTicket}
                    >
                      <SelectTrigger id="ticketStatus" className="h-10">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set([ticketForm.TicketStatus, ...statusOptions])).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="ticketPriority">Priority</Label>
                    <Select value={ticketForm.TicketPriority} onValueChange={handlePriorityChange}>
                      <SelectTrigger id="ticketPriority" className="h-10">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set([ticketForm.TicketPriority, ...priorityOptions])).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="ticketImpact">Impact</Label>
                  <Select value={ticketForm.TicketImpact} onValueChange={handleImpactChange}>
                    <SelectTrigger id="ticketImpact" className="h-10">
                      <SelectValue placeholder="Select impact" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([ticketForm.TicketImpact, ...impactOptions])).map((opt) => (
                        <SelectItem key={opt} value={opt}>{formatImpactLabel(opt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                </div>
              </section>
            )}

            <section className="ticket-panel rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3 sm:p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Work Notes</h3>
              <Textarea
                value={workNote}
                onChange={(event) => setWorkNote(event.target.value)}
                rows={4}
                placeholder="Describe the work performed, update made, or next action taken on this ticket."
              />

              <div className="mt-3 space-y-2">
                <Label htmlFor="workHours">Hours worked</Label>
                <Input
                  id="workHours"
                  type="text"
                  inputMode="decimal"
                  pattern="^\d*(\.\d+)?$"
                  value={workHours}
                  onChange={(event) => setWorkHours(event.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
                <Button onClick={() => void loadTicketComments(selected.TicketID)} variant="outline" disabled={isCommentsLoading} size="sm" className="ticket-action-btn">
                  Refresh
                </Button>
                <Button onClick={saveNote} variant="secondary" disabled={isSaving || noteWriteUnsupported} size="sm" className="ticket-action-btn">
                  Save Note
                </Button>
              </div>

              {noteWriteUnsupported ? (
                <p className="mt-2 text-xs text-amber-300">
                  Note writing is currently unsupported by this Atera API tenant/key. You can still resolve tickets.
                </p>
              ) : null}
            </section>

            <section className="ticket-panel rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3 sm:p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Attachments</h3>
              {isAttachmentsLoading ? (
                <div className="ticket-fade-in rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400 transition-all duration-200 ease-out">Loading...</div>
              ) : attachments.length === 0 ? (
                <div className="ticket-fade-in rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400 transition-all duration-200 ease-out">None</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {attachments.map((url, idx) => (
                    <a
                      key={`${url}-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate rounded-md border border-zinc-800 bg-zinc-900 p-2 text-xs text-lime-300 hover:text-lime-200"
                      title={url}
                    >
                      {url.split('/').pop() || url}
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="ticket-panel rounded-lg border border-zinc-800/90 bg-zinc-950/40 p-3 sm:p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Activity Notes
              </h3>

              {isCommentsLoading ? (
                <div className="ticket-fade-in rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400 transition-all duration-200 ease-out">
                  Loading...
                </div>
              ) : activityItems.length === 0 ? (
                <div className="ticket-fade-in rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400 transition-all duration-200 ease-out">
                  No notes
                </div>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
                  {activityItems.map((item) => (
                    <div key={item.key} className="rounded-md border border-zinc-800 bg-zinc-900 p-2 sm:p-3">
                      <div className="mb-1 text-[11px] text-zinc-500 truncate">
                        <span>{formatCommentDate(item.date)}</span>
                        {item.author && <span className="hidden sm:inline"> • {item.author}</span>}
                        {item.source === "local" && <span className="text-amber-600"> local</span>}
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-200 break-words">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {selected && isResolveDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Resolve Ticket
                </div>
                <div className="mt-1 text-base font-semibold text-zinc-100">
                  Ticket #{selected.TicketID}
                </div>
              </div>
              <Button
                onClick={closeResolveDialog}
                size="sm"
                variant="outline"
                className="ticket-action-btn h-10 w-10 p-0"
                disabled={isSaving}
                title="Close resolve dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Add an optional resolution note before marking this ticket as resolved.
            </p>

            <div className="mt-4 space-y-2">
              <Label htmlFor="resolveNote">Resolution note</Label>
              <Textarea
                id="resolveNote"
                value={resolveNote}
                onChange={(event) => setResolveNote(event.target.value)}
                rows={5}
                placeholder="What was done to resolve this ticket?"
              />
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="resolveHours">Hours worked</Label>
              <Input
                id="resolveHours"
                type="text"
                inputMode="decimal"
                pattern="^\d*(\.\d+)?$"
                value={resolveHours}
                onChange={(event) => setResolveHours(event.target.value)}
                placeholder="0"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                onClick={closeResolveDialog}
                variant="outline"
                className="ticket-action-btn"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void resolveTicket()}
                variant="default"
                className="ticket-action-btn bg-lime-400 text-black hover:bg-lime-300"
                disabled={isSaving}
              >
                {isSaving ? "Resolving..." : "Resolve ticket"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
