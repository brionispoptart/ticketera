"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareMore, X } from "lucide-react";
import type { ChatConversationSummary } from "@/lib/types/chat";

type WorkspaceInboxBadgeProps = {
  initialUnreadCount: number;
  initialUnreadItems: ChatConversationSummary[];
  interactive: boolean;
};

const UNREAD_POLL_INTERVAL_MS = 20_000;
const UNREAD_REFRESH_MIN_GAP_MS = 1200;
const NOTIFICATION_STAGGER_MS = 420;
const NOTIFICATION_TRANSITION_MS = 650;
const NOTIFICATION_POST_STACK_DELAY_MS = 3_000;

type NotificationPhase = "hidden" | "visible" | "exiting";

function getNotificationKey(conversation: ChatConversationSummary) {
  return `${conversation.id}:${conversation.lastMessageAt || "none"}:${conversation.unreadCount}`;
}

function buildUnreadSignature(items: ChatConversationSummary[], unreadCount: number) {
  return `${unreadCount}|${items.map((conversation) => getNotificationKey(conversation)).join(",")}`;
}

function buildMessagePreview(body: string | null) {
  if (!body) {
    return "New unread message";
  }

  const normalized = body
    .replace(/```([\s\S]*?)```/g, "[code]")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "New unread message";
  }

  return normalized.length > 110 ? `${normalized.slice(0, 107)}...` : normalized;
}

function formatNotificationTime(value: string | null) {
  if (!value) {
    return "Now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Now";
  }

  const now = new Date();
  if (parsed.toDateString() === now.toDateString()) {
    return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function WorkspaceInboxBadge({
  initialUnreadCount,
  initialUnreadItems,
  interactive,
}: WorkspaceInboxBadgeProps) {
  const pathname = usePathname();
  const notificationsEnabled = interactive && pathname !== "/chat";
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [unreadItems, setUnreadItems] = useState<ChatConversationSummary[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, true>>({});
  const [notificationPhases, setNotificationPhases] = useState<Record<string, NotificationPhase>>({});
  const enterTimeoutsRef = useRef<Record<string, number>>({});
  const hideTimeoutsRef = useRef<Record<string, number>>({});
  const removeTimeoutsRef = useRef<Record<string, number>>({});
  const unreadSignatureRef = useRef("");

  const clearNotificationTimers = useCallback((key: string) => {
    if (enterTimeoutsRef.current[key] !== undefined) {
      window.clearTimeout(enterTimeoutsRef.current[key]);
      delete enterTimeoutsRef.current[key];
    }

    if (hideTimeoutsRef.current[key] !== undefined) {
      window.clearTimeout(hideTimeoutsRef.current[key]);
      delete hideTimeoutsRef.current[key];
    }

    if (removeTimeoutsRef.current[key] !== undefined) {
      window.clearTimeout(removeTimeoutsRef.current[key]);
      delete removeTimeoutsRef.current[key];
    }
  }, []);

  const beginExit = useCallback((key: string) => {
    clearNotificationTimers(key);
    setNotificationPhases((current) => (current[key] === "exiting" ? current : { ...current, [key]: "exiting" }));
    removeTimeoutsRef.current[key] = window.setTimeout(() => {
      setDismissedKeys((current) => ({ ...current, [key]: true }));
      setNotificationPhases((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      delete removeTimeoutsRef.current[key];
    }, NOTIFICATION_TRANSITION_MS);
  }, [clearNotificationTimers]);

  const syncUnreadState = useCallback((items: ChatConversationSummary[], nextUnreadCount?: number) => {
    const nextUnreadItems = items
      .filter((conversation) => conversation.unreadCount > 0)
      .sort((left, right) => {
        const leftTime = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
        const rightTime = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
        return rightTime - leftTime;
      });
    const computedUnreadCount =
      typeof nextUnreadCount === "number"
        ? nextUnreadCount
        : nextUnreadItems.reduce((total, conversation) => total + conversation.unreadCount, 0);
    const signature = buildUnreadSignature(nextUnreadItems, computedUnreadCount);
    if (signature === unreadSignatureRef.current) {
      return;
    }
    unreadSignatureRef.current = signature;

    const nextKeys = new Set(nextUnreadItems.map(getNotificationKey));

    setUnreadItems(nextUnreadItems);
    setUnreadCount(computedUnreadCount);
    setDismissedKeys((current) => {
      const next: Record<string, true> = {};

      for (const key of Object.keys(current)) {
        if (nextKeys.has(key)) {
          next[key] = true;
        }
      }

      return next;
    });
    setNotificationPhases((current) => {
      const next: Record<string, NotificationPhase> = {};

      for (const conversation of nextUnreadItems) {
        const key = getNotificationKey(conversation);
        next[key] = current[key] || "hidden";
      }

      return next;
    });
  }, []);

  const dismissNotification = useCallback((key: string) => {
    beginExit(key);
  }, [beginExit]);

  const visibleUnreadItems = useMemo(
    () => unreadItems.filter((conversation) => !dismissedKeys[getNotificationKey(conversation)]),
    [dismissedKeys, unreadItems],
  );

  useEffect(() => {
    syncUnreadState(initialUnreadItems, initialUnreadCount);
  }, [initialUnreadCount, initialUnreadItems, syncUnreadState]);

  useEffect(() => {
    return () => {
      for (const timeoutId of Object.values(enterTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }

      for (const timeoutId of Object.values(hideTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }

      for (const timeoutId of Object.values(removeTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }

      enterTimeoutsRef.current = {};
      hideTimeoutsRef.current = {};
      removeTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    const activeKeys = new Set(unreadItems.map(getNotificationKey));

    for (const key of Object.keys(enterTimeoutsRef.current)) {
      if (!activeKeys.has(key) || dismissedKeys[key]) {
        clearNotificationTimers(key);
      }
    }

    for (const key of Object.keys(hideTimeoutsRef.current)) {
      if (!activeKeys.has(key) || dismissedKeys[key]) {
        clearNotificationTimers(key);
      }
    }

    for (const key of Object.keys(removeTimeoutsRef.current)) {
      if (!activeKeys.has(key) || dismissedKeys[key]) {
        clearNotificationTimers(key);
      }
    }

    const stackAppearanceDuration = Math.max(0, unreadItems.length - 1) * NOTIFICATION_STAGGER_MS;

    unreadItems.forEach((conversation, index) => {
      const key = getNotificationKey(conversation);
      const enterDelay = index * NOTIFICATION_STAGGER_MS;
      const exitDelay = stackAppearanceDuration + NOTIFICATION_TRANSITION_MS + NOTIFICATION_POST_STACK_DELAY_MS + index * NOTIFICATION_STAGGER_MS;

      if (dismissedKeys[key]) {
        clearNotificationTimers(key);
        return;
      }

      if (!notificationPhases[key]) {
        setNotificationPhases((current) => ({ ...current, [key]: "hidden" }));
      }

      if (notificationPhases[key] === "hidden" && enterTimeoutsRef.current[key] === undefined) {
        enterTimeoutsRef.current[key] = window.setTimeout(() => {
          setNotificationPhases((current) => ({ ...current, [key]: "visible" }));
          delete enterTimeoutsRef.current[key];
        }, enterDelay);
      }

      if (hideTimeoutsRef.current[key] === undefined && notificationPhases[key] !== "exiting") {
        hideTimeoutsRef.current[key] = window.setTimeout(() => {
          delete hideTimeoutsRef.current[key];
          beginExit(key);
        }, exitDelay);
      }
    });
  }, [beginExit, clearNotificationTimers, dismissedKeys, notificationPhases, unreadItems]);

  useEffect(() => {
    if (!notificationsEnabled) {
      return;
    }

    let disposed = false;
    let requestInFlight = false;
    let refreshQueued = false;
    let queuedTimeoutId: number | null = null;
    let lastRequestAt = 0;

    const scheduleRefresh = (immediate = false) => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      const gap = now - lastRequestAt;
      if (!immediate && gap < UNREAD_REFRESH_MIN_GAP_MS) {
        if (queuedTimeoutId === null) {
          queuedTimeoutId = window.setTimeout(() => {
            queuedTimeoutId = null;
            scheduleRefresh(true);
          }, UNREAD_REFRESH_MIN_GAP_MS - gap);
        }
        return;
      }

      if (requestInFlight) {
        refreshQueued = true;
        return;
      }

      requestInFlight = true;
      lastRequestAt = Date.now();
      void loadUnreadNotifications();
    };

    async function loadUnreadNotifications() {
      if (document.visibilityState !== "visible") {
        requestInFlight = false;
        return;
      }

      try {
        const response = await fetch("/api/chat/unread", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as {
          unreadCount?: number;
          items?: ChatConversationSummary[];
        } | null;

        if (!response.ok || disposed) {
          return;
        }

        syncUnreadState(
          Array.isArray(payload?.items) ? payload.items : [],
          typeof payload?.unreadCount === "number" ? payload.unreadCount : undefined,
        );
      } catch {
        // Ignore notification refresh failures and keep the last known count.
      } finally {
        requestInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          scheduleRefresh(true);
        }
      }
    }

    const syncFromStreamPayload = (payload: { unreadCount?: number; unreadItems?: ChatConversationSummary[] } | null) => {
      if (!payload) {
        return;
      }

      if (!Array.isArray(payload.unreadItems)) {
        return;
      }

      syncUnreadState(payload.unreadItems, typeof payload.unreadCount === "number" ? payload.unreadCount : undefined);
    };

    let stream: EventSource | null = null;
    if ("EventSource" in window) {
      stream = new EventSource("/api/chat/stream?includeUnread=1");
      stream.addEventListener("chat-update", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent<string>).data) as {
            unreadCount?: number;
            unreadItems?: ChatConversationSummary[];
          };
          syncFromStreamPayload(payload);
        } catch {
          scheduleRefresh();
        }
      });
    }

    const intervalId = window.setInterval(() => {
      scheduleRefresh();
    }, UNREAD_POLL_INTERVAL_MS);
    scheduleRefresh(true);

    const onVisible = () => {
      scheduleRefresh(true);
    };

    const onUnreadUpdated = () => {
      scheduleRefresh(true);
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("chat:unread-updated", onUnreadUpdated);

    return () => {
      disposed = true;
      if (queuedTimeoutId !== null) {
        window.clearTimeout(queuedTimeoutId);
      }
      if (stream) {
        stream.close();
      }
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("chat:unread-updated", onUnreadUpdated);
    };
  }, [notificationsEnabled, syncUnreadState]);

  if (!notificationsEnabled || unreadCount <= 0 || visibleUnreadItems.length === 0) {
    return null;
  }

  return (
    <div className="flex max-h-[calc(100dvh-1.5rem)] w-[320px] max-w-full flex-col gap-3 overflow-y-auto pr-1">
      {visibleUnreadItems.map((conversation, index) => {
        const notificationKey = getNotificationKey(conversation);
        const preview = buildMessagePreview(conversation.lastMessageBody);

        return (
          <div
            key={notificationKey}
            className={[
              "overflow-hidden transition-[max-height,opacity,transform,margin] ease-out",
              notificationPhases[notificationKey] === "visible"
                ? "max-h-48 translate-y-0 opacity-100"
                : notificationPhases[notificationKey] === "exiting"
                  ? "max-h-0 -translate-y-3 opacity-0"
                  : "max-h-0 translate-y-2 opacity-0",
            ].join(" ")}
            style={{ transitionDuration: `${NOTIFICATION_TRANSITION_MS}ms` }}
          >
            <div className="relative">
            <button
              type="button"
              onClick={() => dismissNotification(notificationKey)}
              className="absolute right-1.5 top-1.5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full text-sky-300/80 transition hover:bg-sky-400/10 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 sm:right-3 sm:top-3"
              aria-label={`Dismiss notification for ${conversation.title}`}
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <Link
              href={{ pathname: "/chat", query: { conversation: conversation.id } }}
              className="block rounded-[22px] border border-sky-400/30 bg-zinc-950/92 px-4 py-3 text-zinc-100 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              aria-label={`Open chat with ${conversation.title}. ${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? "" : "s"}. Preview: ${preview}`}
              title={`${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? "" : "s"}`}
            >
              <div className="flex items-start gap-3 pr-8">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-400/10 text-sky-300">
                  <MessageSquareMore className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        {index === 0 ? "Message Notification" : "Unread Message"}
                      </div>
                      <div className="truncate text-sm font-semibold text-zinc-50">{conversation.title}</div>
                    </div>
                    <div className="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-sky-200">
                      {conversation.unreadCount}
                    </div>
                  </div>

                  <div className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-200">{preview}</div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
                    <span>{formatNotificationTime(conversation.lastMessageAt)}</span>
                    <span>Open message</span>
                  </div>
                </div>
              </div>
            </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}