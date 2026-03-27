"use client";

import { type FormEvent, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Code2, Copy, MessageSquareMore, PenSquare, Pin, Plus, Search, SendHorizonal, TerminalSquare, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatConversationSummary, ChatMessageItem, ChatUserSummary } from "@/lib/types/chat";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type CachedResource, fetchJsonWithEtag, getPayloadFingerprint, readCachedJson, writeCachedJson } from "@/lib/client-cache";
import { cn } from "@/lib/utils";

type ChatInboxProps = {
  currentUserId: string;
};

type StatusBanner = {
  type: "error" | "info";
  message: string;
};

type ChatCollectionCache<T> = CachedResource<T>;

type ChatConversationCache = CachedResource<ChatConversationSummary[]> & {
  currentConversationId: string | null;
};

type ChatMessageIndexEntry = CachedResource<ChatMessageItem[]>;
type ChatMessageIndexCache = {
  entries: Record<string, ChatMessageIndexEntry>;
  savedAt: string;
};

type ConversationSearchResult = {
  conversation: ChatConversationSummary;
  preview: string;
  rank: number;
};

type LoadOptions = {
  background?: boolean;
};

type MessageSegment = {
  type: "markdown" | "code";
  content: string;
  language?: string;
};

type ComposerMode = "message" | "code" | "command";

type PendingHiddenConversation = {
  conversationId: string;
  title: string;
};

const OPEN_CHAT_POLL_INTERVAL_MS = 1_500;
const IDLE_CHAT_POLL_INTERVAL_MS = 5_000;
const MESSAGE_WINDOW_STEP = 120;
const CHAT_MESSAGE_INDEX_MAX_CONVERSATIONS = 40;
const CHAT_MESSAGE_INDEX_MAX_MESSAGES_PER_CONVERSATION = 120;
const CHAT_MESSAGE_INDEX_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const PHONE_VIEWPORT_QUERY = "(max-width: 767px)";
const HIDE_UNDO_TIMEOUT_MS = 6000;

function normalizeCodeLines(code: string) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  return lines.length > 0 ? lines : [""];
}

function isShellLanguage(language: string) {
  return ["bash", "sh", "shell", "zsh", "powershell", "pwsh", "cmd"].includes(language.toLowerCase());
}

type CodePanelProps = {
  code: string;
  language?: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
};

function CodePanel({ code, language = "text", copied, onCopy, className }: CodePanelProps) {
  const lines = normalizeCodeLines(code);
  const shellLike = isShellLanguage(language);
  const languageLabel = language === "text" ? "code" : language;

  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onCopy();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCopy}
      onKeyDown={handlePanelKeyDown}
      aria-label={`Copy ${languageLabel} block`}
      className={cn(
        "relative my-2 overflow-hidden rounded-md border border-zinc-700/80 bg-[#111318] shadow-[0_14px_36px_rgba(0,0,0,0.22)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60",
        shellLike ? "ml-auto w-fit max-w-[640px]" : "w-full max-w-[640px]",
        copied
          ? "border-emerald-400/45 bg-[#141a16]"
          : "hover:border-zinc-500/80 hover:bg-[#141820] active:border-zinc-400/80 active:bg-[#171c25]",
        className,
      )}
      style={shellLike ? undefined : { backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.02) 0 28px, transparent 28px 56px)" }}
    >
      {shellLike ? (
        <div className="grid max-w-[640px] grid-cols-[minmax(0,max-content)_2.75rem] items-start">
          <div className="min-w-0 max-w-[calc(640px-2.75rem)] overflow-x-auto">
            <pre className="min-w-full bg-transparent text-[13px] leading-6 text-zinc-100">
              <code className="block font-mono">
                {lines.map((line, index) => (
                  <div
                    key={`${language}-${index}-${line}`}
                    className="grid min-w-max grid-cols-[1.75rem_1fr] px-4 py-0.5"
                  >
                    <span className="select-none text-emerald-400">$</span>
                    <span className="text-zinc-100">{line || " "}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>

          <div className="flex items-start justify-center pt-2">
            <span className="pointer-events-none inline-flex items-center justify-center p-0 text-zinc-500 transition">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            </span>
          </div>
        </div>
      ) : (
        <>
          <span className="pointer-events-none absolute right-3 top-2 z-10 inline-flex items-center justify-center p-0 text-zinc-500 transition">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          </span>

          <div className="min-w-0 w-[calc(100%-2.75rem)] overflow-x-auto">
            <pre className="min-w-full bg-transparent text-[13px] leading-6 text-zinc-100">
              <code className="block font-mono">
                {lines.map((line, index) => (
                  <div
                    key={`${language}-${index}-${line}`}
                    className="grid min-w-full grid-cols-[3rem_1fr] px-4 py-0.5"
                  >
                    <span className="select-none pr-4 text-right text-[11px] text-zinc-500/80">
                      {index + 1}
                    </span>
                    <span className="text-zinc-100">{line || " "}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

function formatMessageTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatMessageDayLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  const dayDiff = Math.round((today - target) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) {
    return "Today";
  }

  if (dayDiff === 1) {
    return "Yesterday";
  }

  return parsed.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function messageDayKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function formatConversationCardTime(value: string | null) {
  if (!value) {
    return "New";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const now = new Date();
  const isSameDay = parsed.toDateString() === now.toDateString();

  if (isSameDay) {
    return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function buildPinnedMessagePreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function buildConversationAvatarLabel(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "MC";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function shouldIgnoreMessagePinToggle(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("a, button, input, textarea, select, [role='button']"));
}

function buildMessageSearchPreview(body: string, query: string) {
  if (!body) {
    return "No messages yet";
  }

  const normalizedBody = body.replace(/\s+/g, " ").trim();
  if (!query) {
    return normalizedBody;
  }

  const lowerBody = normalizedBody.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerBody.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return normalizedBody;
  }

  const start = Math.max(0, matchIndex - 24);
  const end = Math.min(normalizedBody.length, matchIndex + lowerQuery.length + 42);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedBody.length ? "..." : "";
  return `${prefix}${normalizedBody.slice(start, end)}${suffix}`;
}

function splitMessageSegments(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const fencePattern = /```([\w-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = fencePattern.exec(body)) !== null) {
    const [fullMatch, language, codeContent] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      const markdownContent = body.slice(lastIndex, matchIndex);
      if (markdownContent.trim().length > 0) {
        segments.push({ type: "markdown", content: markdownContent });
      }
    }

    segments.push({
      type: "code",
      content: codeContent.replace(/\n$/, ""),
      language: language || "text",
    });

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < body.length) {
    const trailingContent = body.slice(lastIndex);
    if (trailingContent.trim().length > 0) {
      segments.push({ type: "markdown", content: trailingContent });
    }
  }

  return segments.length > 0 ? segments : [{ type: "markdown", content: body }];
}

export function ChatInbox({ currentUserId }: ChatInboxProps) {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<ChatUserSummary[]>([]);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isPhoneViewport, setIsPhoneViewport] = useState(false);
  const [hasResolvedViewport, setHasResolvedViewport] = useState(false);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [visibleMessageLimit, setVisibleMessageLimit] = useState(MESSAGE_WINDOW_STEP);
  const [cachedMessagesByConversation, setCachedMessagesByConversation] = useState<Record<string, ChatMessageItem[]>>({});
  const [hiddenConversationIds, setHiddenConversationIds] = useState<string[]>([]);
  const [hiddenConversationBaselines, setHiddenConversationBaselines] = useState<Record<string, string>>({});
  const [isHiddenConversationsHydrated, setIsHiddenConversationsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [draft, setDraft] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("message");
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [isCacheHydrated, setIsCacheHydrated] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullVisualOffset, setPullVisualOffset] = useState(0);
  const [isPullArmed, setIsPullArmed] = useState(false);
  const [isPullingList, setIsPullingList] = useState(false);
  const [conversationSwipeVisual, setConversationSwipeVisual] = useState<{ id: string; dx: number; snapping: boolean } | null>(null);
  const [isStartingConversation, setIsStartingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pinningConversationId, setPinningConversationId] = useState<string | null>(null);
  const [pinningMessageId, setPinningMessageId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [pendingHiddenConversation, setPendingHiddenConversation] = useState<PendingHiddenConversation | null>(null);
  const [isComposerMenuOpen, setIsComposerMenuOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationListRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const statusResetTimeoutRef = useRef<number | null>(null);
  const swipeResetTimeoutRef = useRef<number | null>(null);
  const hideUndoTimeoutRef = useRef<number | null>(null);
  const usersFingerprintRef = useRef("");
  const conversationsFingerprintRef = useRef("");
  const messageFingerprintsRef = useRef<Record<string, string>>({});
  const shouldStickMessageListRef = useRef(true);
  const previousMessageConversationIdRef = useRef<string | null>(null);
  const usersEtagRef = useRef<string | null>(null);
  const conversationsEtagRef = useRef<string | null>(null);
  const messageEtagsRef = useRef<Record<string, string | null>>({});
  const selectedConversationStreamStateRef = useRef("");
  const conversationStreamSignatureRef = useRef("");
  const didBootstrapCacheRef = useRef(false);
  const conversationSwipeStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const conversationSwipeDeltaRef = useRef(0);
  const suppressedConversationOpenRef = useRef<string | null>(null);
  const activeGestureRef = useRef<null | "card-swipe" | "pull-refresh">(null);
  const activeSwipeConversationIdRef = useRef<string | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const preservePhoneConversationRef = useRef(false);
  const requestedConversationId = searchParams.get("conversation");
  const shouldHonorRequestedConversationRef = useRef(Boolean(requestedConversationId));
  const previousRequestedConversationIdRef = useRef<string | null>(requestedConversationId);

  useEffect(() => {
    if (requestedConversationId === previousRequestedConversationIdRef.current) {
      return;
    }

    previousRequestedConversationIdRef.current = requestedConversationId;
    shouldHonorRequestedConversationRef.current = Boolean(requestedConversationId);
  }, [requestedConversationId]);

  const focusDraftTextarea = useCallback((moveCursorToEnd = false) => {
    const textarea = draftTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus({ preventScroll: true });

    if (moveCursorToEnd) {
      const caretPosition = textarea.value.length;
      textarea.setSelectionRange(caretPosition, caretPosition);
    }
  }, []);

  const USERS_CACHE_KEY = useMemo(() => `ticketera.chat.users.${currentUserId}.v1`, [currentUserId]);
  const CONVERSATIONS_CACHE_KEY = useMemo(() => `ticketera.chat.conversations.${currentUserId}.v1`, [currentUserId]);
  const MESSAGES_CACHE_KEY = useMemo(() => `ticketera.chat.messages.${currentUserId}.v1`, [currentUserId]);
  const HIDDEN_CONVERSATIONS_KEY = useMemo(() => `ticketera.chat.hidden.${currentUserId}.v1`, [currentUserId]);
  const HIDDEN_CONVERSATION_BASELINES_KEY = useMemo(() => `ticketera.chat.hidden-baselines.${currentUserId}.v1`, [currentUserId]);

  const handleCopyCode = useCallback(async (key: string, value: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for mobile browsers / PWA where Clipboard API is unavailable
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedCodeKey(key);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedCodeKey((current) => (current === key ? null : current));
        copyResetTimeoutRef.current = null;
      }, 1800);
    } catch {
      setStatus({ type: "error", message: "Could not copy code block." });
    }
  }, []);

  const markdownComponents = useMemo(() => ({
    p: ({ children }: { children?: React.ReactNode }) => <p className="my-0 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4 hover:opacity-90">
        {children}
      </a>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="whitespace-pre-wrap pl-1">{children}</li>,
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="my-2 whitespace-pre-wrap border-l-2 border-white/20 pl-3 italic text-inherit/90">{children}</blockquote>
    ),
    code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
      const language = className?.replace("language-", "") || "text";
      const code = String(children ?? "").replace(/\n$/, "");
      const copyKey = `markdown:${language}:${code}`;

      if (inline) {
        return (
          <code className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono text-[0.92em] text-inherit">
            {children}
          </code>
        );
      }

      return <CodePanel code={code} language={language} copied={copiedCodeKey === copyKey} onCopy={() => void handleCopyCode(copyKey, code)} />;
    },
  }), [copiedCodeKey, handleCopyCode]);

  const removeConversationFromCache = useCallback((conversationId: string) => {
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
    setCachedMessagesByConversation((current) => {
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
    delete messageEtagsRef.current[conversationId];
  }, []);

  function pruneMessageIndex(entries: Record<string, ChatMessageIndexEntry>) {
    const cutoff = Date.now() - CHAT_MESSAGE_INDEX_MAX_AGE_MS;
    return Object.fromEntries(
      Object.entries(entries)
        .filter(([, entry]) => {
          const savedAt = Date.parse(entry.savedAt);
          return Number.isNaN(savedAt) ? false : savedAt >= cutoff;
        })
        .sort((left, right) => Date.parse(right[1].savedAt) - Date.parse(left[1].savedAt))
        .slice(0, CHAT_MESSAGE_INDEX_MAX_CONVERSATIONS)
        .map(([conversationId, entry]) => [
          conversationId,
          {
            ...entry,
            data: entry.data.slice(-CHAT_MESSAGE_INDEX_MAX_MESSAGES_PER_CONVERSATION),
          },
        ]),
    );
  }

  const updateMessageIndex = useCallback((conversationId: string, items: ChatMessageItem[], etag: string | null) => {
    const nextEntries = pruneMessageIndex({
      ...Object.fromEntries(
        Object.entries(cachedMessagesByConversation).map(([id, data]) => [id, {
          data,
          etag: messageEtagsRef.current[id] || null,
          savedAt: new Date().toISOString(),
        }]),
      ),
      [conversationId]: {
        data: items,
        etag,
        savedAt: new Date().toISOString(),
      },
    });

    messageEtagsRef.current = Object.fromEntries(
      Object.entries(nextEntries).map(([id, entry]) => [id, entry.etag]),
    );
    messageFingerprintsRef.current = Object.fromEntries(
      Object.entries(nextEntries).map(([id, entry]) => [id, getPayloadFingerprint(entry.data)]),
    );

    const nextMessageMap = Object.fromEntries(
      Object.entries(nextEntries).map(([id, entry]) => [id, entry.data]),
    );

    setCachedMessagesByConversation(nextMessageMap);
    writeCachedJson<ChatMessageIndexCache>(MESSAGES_CACHE_KEY, {
      entries: nextEntries,
      savedAt: new Date().toISOString(),
    });
  }, [MESSAGES_CACHE_KEY, cachedMessagesByConversation]);

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => !hiddenConversationIds.includes(conversation.id)),
    [conversations, hiddenConversationIds],
  );

  const currentConversation = useMemo(
    () => visibleConversations.find((conversation) => conversation.id === currentConversationId) || null,
    [visibleConversations, currentConversationId],
  );

  const currentConversationHeaderLabel = useMemo(() => {
    if (!currentConversation) {
      return "";
    }

    if (currentConversation.otherUser?.fullName) {
      return currentConversation.otherUser.fullName;
    }

    const [baseTitle] = currentConversation.title.split(" · ");
    return baseTitle?.trim() || currentConversation.title;
  }, [currentConversation]);

  const pinnedMessages = useMemo(
    () => messages
      .filter((message) => message.isPinned)
      .sort((left, right) => {
        const leftTime = left.pinnedAt ? Date.parse(left.pinnedAt) : Date.parse(left.createdAt);
        const rightTime = right.pinnedAt ? Date.parse(right.pinnedAt) : Date.parse(right.createdAt);
        return rightTime - leftTime;
      }),
    [messages],
  );

  const visibleMessages = useMemo(() => {
    if (messages.length <= visibleMessageLimit) {
      return messages;
    }

    return messages.slice(messages.length - visibleMessageLimit);
  }, [messages, visibleMessageLimit]);

  const hiddenMessageCount = messages.length - visibleMessages.length;

  const featuredPinnedMessage = pinnedMessages[0] ?? null;
  const [showPinsOverlay, setShowPinsOverlay] = useState(false);

  const composerPlaceholder = composerMode === "code"
    ? "Paste code…"
    : composerMode === "command"
      ? "Paste command…"
      : `Message ${currentConversation?.title ?? ""}…`;

  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const matchingUsers = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return users
      .map((user) => {
        const fullName = user.fullName.toLowerCase();
        const email = user.email.toLowerCase();
        const role = user.role.toLowerCase();
        const technicianLevel = user.technicianLevel.toLowerCase();
        const haystack = `${fullName} ${email} ${role} ${technicianLevel}`;

        if (!haystack.includes(query)) {
          return null;
        }

        let rank = 5;

        if (fullName === query) {
          rank = 0;
        } else if (fullName.startsWith(query)) {
          rank = 1;
        } else if (fullName.includes(query)) {
          rank = 2;
        } else if (email.startsWith(query)) {
          rank = 3;
        }

        return { user, rank };
      })
      .filter((entry): entry is { user: ChatUserSummary; rank: number } => Boolean(entry))
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }

        return left.user.fullName.localeCompare(right.user.fullName);
      })
      .map((entry) => entry.user);
  }, [deferredSearchQuery, users]);

  const conversationResults = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) {
      return visibleConversations.map((conversation) => ({
        conversation,
        preview: conversation.lastMessageBody || "No messages yet",
        rank: 0,
      }));
    }

    return visibleConversations
      .map((conversation) => {
        const title = conversation.title.toLowerCase();
        const preview = (conversation.lastMessageBody || "").toLowerCase();
        const cachedMessages = cachedMessagesByConversation[conversation.id] || [];
        let rank = 6;
        let resultPreview = conversation.lastMessageBody || "No messages yet";

        if (title === query) {
          rank = 1;
        } else if (title.startsWith(query)) {
          rank = 2;
        } else if (title.includes(query)) {
          rank = 3;
        } else if (preview.startsWith(query)) {
          rank = 4;
        } else if (preview.includes(query)) {
          rank = 5;
        } else {
          const matchedMessage = [...cachedMessages].reverse().find((message) => message.body.toLowerCase().includes(query));
          if (!matchedMessage) {
            return null;
          }

          rank = 5;
          resultPreview = buildMessageSearchPreview(matchedMessage.body, query);
        }

        if (resultPreview !== "No messages yet") {
          resultPreview = buildMessageSearchPreview(resultPreview, query);
        }

        return { conversation, rank, preview: resultPreview };
      })
      .filter((entry): entry is ConversationSearchResult => Boolean(entry))
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }

        const leftTime = left.conversation.lastMessageAt ? Date.parse(left.conversation.lastMessageAt) : 0;
        const rightTime = right.conversation.lastMessageAt ? Date.parse(right.conversation.lastMessageAt) : 0;
        return rightTime - leftTime;
      });
  }, [cachedMessagesByConversation, deferredSearchQuery, visibleConversations]);

  const showSearchResults = normalizedSearchQuery.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(PHONE_VIEWPORT_QUERY);
    const applyViewport = (matches: boolean) => {
      setIsPhoneViewport(matches);
      setHasResolvedViewport(true);
    };

    applyViewport(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyViewport(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const loadUsers = useCallback(async (options?: LoadOptions) => {
    const shouldShowLoading = !options?.background || usersFingerprintRef.current.length === 0;
    if (shouldShowLoading) {
      setIsUsersLoading(true);
    }

    try {
      const { response, data, etag, notModified } = await fetchJsonWithEtag<{ items?: ChatUserSummary[]; error?: string }>("/api/chat/users", {
        etag: usersEtagRef.current,
      });

      if (notModified) {
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load users.");
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const nextFingerprint = getPayloadFingerprint(items);
      usersEtagRef.current = etag;

      if (nextFingerprint !== usersFingerprintRef.current) {
        usersFingerprintRef.current = nextFingerprint;
        setUsers(items);
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load users.",
      });
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async (options?: LoadOptions) => {
    const shouldShowLoading = !options?.background || conversationsFingerprintRef.current.length === 0;
    if (shouldShowLoading) {
      setIsConversationsLoading(true);
    }

    try {
      const { response, data, etag, notModified } = await fetchJsonWithEtag<{ items?: ChatConversationSummary[]; error?: string }>("/api/chat/conversations", {
        etag: conversationsEtagRef.current,
      });

      if (notModified) {
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load conversations.");
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const nextFingerprint = getPayloadFingerprint(items);
      conversationsEtagRef.current = etag;

      if (nextFingerprint !== conversationsFingerprintRef.current) {
        conversationsFingerprintRef.current = nextFingerprint;
        setConversations(items);
      }

      const idsToAutoRestore = hiddenConversationIds.filter((conversationId) => {
        const conversation = items.find((item) => item.id === conversationId);
        if (!conversation?.lastMessageAt) {
          return false;
        }

        const baseline = hiddenConversationBaselines[conversationId];
        if (!baseline) {
          return false;
        }

        const lastMessageTime = Date.parse(conversation.lastMessageAt);
        const baselineTime = Date.parse(baseline);
        if (Number.isNaN(lastMessageTime) || Number.isNaN(baselineTime)) {
          return false;
        }

        return lastMessageTime > baselineTime;
      });

      if (idsToAutoRestore.length > 0) {
        const restoreSet = new Set(idsToAutoRestore);
        setHiddenConversationIds((current) => current.filter((id) => !restoreSet.has(id)));
        setHiddenConversationBaselines((current) => {
          const next = { ...current };
          for (const id of idsToAutoRestore) {
            delete next[id];
          }
          return next;
        });
      }

      const visibleItems = items.filter(
        (conversation) => !hiddenConversationIds.includes(conversation.id) && !idsToAutoRestore.includes(conversation.id),
      );
      const shouldHonorRequestedConversation = Boolean(requestedConversationId) && shouldHonorRequestedConversationRef.current;

      setCurrentConversationId((current) => {
        if (shouldHonorRequestedConversation && requestedConversationId && items.some((conversation) => conversation.id === requestedConversationId)) {
          return requestedConversationId;
        }

        if (current && visibleItems.some((conversation) => conversation.id === current)) {
          return current;
        }

        if (!hasResolvedViewport) {
          return null;
        }

        if (isPhoneViewport) {
          return null;
        }

        return visibleItems[0]?.id || null;
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load conversations.",
      });
    } finally {
      setIsConversationsLoading(false);
    }
  }, [hasResolvedViewport, hiddenConversationBaselines, hiddenConversationIds, isPhoneViewport, requestedConversationId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setIsMessagesLoading(true);
    try {
      const { response, data, etag, notModified } = await fetchJsonWithEtag<{ items?: ChatMessageItem[]; error?: string }>(`/api/chat/conversations/${conversationId}/messages`, {
        etag: messageEtagsRef.current[conversationId] || null,
      });

      if (notModified) {
        const cachedItems = cachedMessagesByConversation[conversationId] || [];
        setMessages((current) => getPayloadFingerprint(current) === getPayloadFingerprint(cachedItems) ? current : cachedItems);
        window.dispatchEvent(new CustomEvent("chat:unread-updated"));
        return cachedItems;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Failed to load messages.");
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const nextFingerprint = getPayloadFingerprint(items);
      const didChange = messageFingerprintsRef.current[conversationId] !== nextFingerprint;

      if (didChange) {
        messageFingerprintsRef.current[conversationId] = nextFingerprint;
        messageEtagsRef.current[conversationId] = etag;
        updateMessageIndex(conversationId, items, etag);
      }

      setMessages((current) => {
        const currentFingerprint = getPayloadFingerprint(current);
        return currentFingerprint === nextFingerprint ? current : items;
      });

      window.dispatchEvent(new CustomEvent("chat:unread-updated"));
      return items;
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load messages.",
      });
      return cachedMessagesByConversation[conversationId] || [];
    } finally {
      setIsMessagesLoading(false);
    }
  }, [cachedMessagesByConversation, updateMessageIndex]);

  useEffect(() => {
    didBootstrapCacheRef.current = false;
  }, [CONVERSATIONS_CACHE_KEY, MESSAGES_CACHE_KEY, USERS_CACHE_KEY]);

  useEffect(() => {
    const hidden = readCachedJson<ChatCollectionCache<string[]>>(HIDDEN_CONVERSATIONS_KEY);
    const hiddenBaselines = readCachedJson<ChatCollectionCache<Record<string, string>>>(HIDDEN_CONVERSATION_BASELINES_KEY);

    if (Array.isArray(hidden?.data)) {
      const filteredIds = hidden.data.filter((value) => typeof value === "string");
      setHiddenConversationIds(filteredIds);

      const baselineData = hiddenBaselines?.data && typeof hiddenBaselines.data === "object"
        ? hiddenBaselines.data
        : {};

      if (Object.keys(baselineData).length > 0) {
        setHiddenConversationBaselines(
          Object.fromEntries(
            Object.entries(baselineData).filter(([id, value]) => filteredIds.includes(id) && typeof value === "string"),
          ),
        );
      } else {
        const nowIso = new Date().toISOString();
        setHiddenConversationBaselines(Object.fromEntries(filteredIds.map((id) => [id, nowIso])));
      }

      setIsHiddenConversationsHydrated(true);
      return;
    }

    setHiddenConversationIds([]);
    setHiddenConversationBaselines({});
    setIsHiddenConversationsHydrated(true);
  }, [HIDDEN_CONVERSATION_BASELINES_KEY, HIDDEN_CONVERSATIONS_KEY]);

  useEffect(() => {
    if (didBootstrapCacheRef.current) {
      return;
    }
    didBootstrapCacheRef.current = true;

    const cachedUsers = readCachedJson<ChatCollectionCache<ChatUserSummary[]>>(USERS_CACHE_KEY);
    if (cachedUsers?.data) {
      usersFingerprintRef.current = getPayloadFingerprint(cachedUsers.data);
      usersEtagRef.current = cachedUsers.etag;
      setUsers(cachedUsers.data);
    }

    const cachedConversations = readCachedJson<ChatConversationCache>(CONVERSATIONS_CACHE_KEY);
    if (cachedConversations?.data) {
      conversationsFingerprintRef.current = getPayloadFingerprint(cachedConversations.data);
      conversationsEtagRef.current = cachedConversations.etag;
      setConversations(cachedConversations.data);
      setCurrentConversationId(
        requestedConversationId && shouldHonorRequestedConversationRef.current && cachedConversations.data.some((conversation) => conversation.id === requestedConversationId)
          ? requestedConversationId
          : !hasResolvedViewport
          ? null
          : cachedConversations.currentConversationId && cachedConversations.data.some((conversation) => conversation.id === cachedConversations.currentConversationId)
          ? isPhoneViewport && !requestedConversationId
            ? null
            : cachedConversations.currentConversationId
          : isPhoneViewport
          ? null
          : cachedConversations.data[0]?.id || null,
      );
    }

    const cachedMessages = readCachedJson<ChatMessageIndexCache>(MESSAGES_CACHE_KEY);
    if (cachedMessages?.entries) {
      const prunedEntries = pruneMessageIndex(cachedMessages.entries);
      messageFingerprintsRef.current = Object.fromEntries(
        Object.entries(prunedEntries).map(([conversationId, entry]) => [conversationId, getPayloadFingerprint(entry.data)]),
      );
      messageEtagsRef.current = Object.fromEntries(
        Object.entries(prunedEntries).map(([conversationId, entry]) => [conversationId, entry.etag]),
      );
      const cachedMessageMap = Object.fromEntries(Object.entries(prunedEntries).map(([conversationId, entry]) => [conversationId, entry.data]));
      setCachedMessagesByConversation(cachedMessageMap);

      if (cachedConversations?.currentConversationId && cachedMessageMap[cachedConversations.currentConversationId]) {
        setMessages(cachedMessageMap[cachedConversations.currentConversationId]);
      }
    }

    void Promise.all([
      loadUsers({ background: true }),
      loadConversations({ background: true }),
    ]);
    setIsCacheHydrated(true);
  }, [CONVERSATIONS_CACHE_KEY, MESSAGES_CACHE_KEY, USERS_CACHE_KEY, hasResolvedViewport, isPhoneViewport, loadUsers, loadConversations, requestedConversationId]);

  useEffect(() => {
    if (!isCacheHydrated) {
      return;
    }

    writeCachedJson<ChatCollectionCache<ChatUserSummary[]>>(USERS_CACHE_KEY, {
      data: users,
      etag: usersEtagRef.current,
      savedAt: new Date().toISOString(),
    });
  }, [USERS_CACHE_KEY, isCacheHydrated, users]);

  useEffect(() => {
    if (!isCacheHydrated) {
      return;
    }

    writeCachedJson<ChatConversationCache>(CONVERSATIONS_CACHE_KEY, {
      data: conversations,
      etag: conversationsEtagRef.current,
      currentConversationId,
      savedAt: new Date().toISOString(),
    });
  }, [CONVERSATIONS_CACHE_KEY, conversations, currentConversationId, isCacheHydrated]);

  useEffect(() => {
    if (!isHiddenConversationsHydrated) {
      return;
    }

    writeCachedJson<ChatCollectionCache<string[]>>(HIDDEN_CONVERSATIONS_KEY, {
      data: hiddenConversationIds,
      etag: null,
      savedAt: new Date().toISOString(),
    });
  }, [HIDDEN_CONVERSATIONS_KEY, hiddenConversationIds, isHiddenConversationsHydrated]);

  useEffect(() => {
    if (!isHiddenConversationsHydrated) {
      return;
    }

    writeCachedJson<ChatCollectionCache<Record<string, string>>>(HIDDEN_CONVERSATION_BASELINES_KEY, {
      data: hiddenConversationBaselines,
      etag: null,
      savedAt: new Date().toISOString(),
    });
  }, [HIDDEN_CONVERSATION_BASELINES_KEY, hiddenConversationBaselines, isHiddenConversationsHydrated]);

  useEffect(() => {
    if (!isCacheHydrated) {
      return;
    }

    const entries = pruneMessageIndex(
      Object.fromEntries(
        Object.entries(cachedMessagesByConversation).map(([conversationId, items]) => [conversationId, {
          data: items,
          etag: messageEtagsRef.current[conversationId] || null,
          savedAt: new Date().toISOString(),
        }]),
      ),
    );

    writeCachedJson<ChatMessageIndexCache>(MESSAGES_CACHE_KEY, {
      entries,
      savedAt: new Date().toISOString(),
    });
  }, [MESSAGES_CACHE_KEY, cachedMessagesByConversation, isCacheHydrated]);

  useEffect(() => {
    if (!currentConversationId) {
      setMessages([]);
      return;
    }

    const cachedMessages = cachedMessagesByConversation[currentConversationId];
    if (cachedMessages) {
      setMessages((current) => {
        const currentFingerprint = getPayloadFingerprint(current);
        const cachedFingerprint = messageFingerprintsRef.current[currentConversationId] || getPayloadFingerprint(cachedMessages);
        return currentFingerprint === cachedFingerprint ? current : cachedMessages;
      });
    }

  }, [cachedMessagesByConversation, currentConversationId]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    void (async () => {
      await loadMessages(currentConversationId);
      await loadConversations({ background: true });
    })();
  }, [currentConversationId, loadConversations, loadMessages]);

  useEffect(() => {
    if (!hasResolvedViewport) {
      return;
    }

    if (isPhoneViewport && !requestedConversationId) {
      setCurrentConversationId((current) => {
        if (current && conversations.some((conversation) => conversation.id === current)) {
          preservePhoneConversationRef.current = false;
          return current;
        }

        preservePhoneConversationRef.current = false;
        return null;
      });
      return;
    }

    const shouldHonorRequestedConversation = Boolean(requestedConversationId) && shouldHonorRequestedConversationRef.current;
    if (shouldHonorRequestedConversation && requestedConversationId && conversations.some((conversation) => conversation.id === requestedConversationId)) {
      setCurrentConversationId(requestedConversationId);
    }
  }, [conversations, hasResolvedViewport, isPhoneViewport, requestedConversationId]);

  useEffect(() => {
    if (!hasResolvedViewport) {
      return;
    }

    if (isPhoneViewport) {
      return;
    }

    if (currentConversationId || conversations.length === 0) {
      return;
    }

    if (requestedConversationId && shouldHonorRequestedConversationRef.current && conversations.some((conversation) => conversation.id === requestedConversationId)) {
      setCurrentConversationId(requestedConversationId);
      return;
    }

    setCurrentConversationId(conversations[0]?.id || null);
  }, [conversations, currentConversationId, hasResolvedViewport, isPhoneViewport, requestedConversationId]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusDraftTextarea(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentConversationId, focusDraftTextarea]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return undefined;
    }

    const updateStickState = () => {
      const distanceFromBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
      shouldStickMessageListRef.current = distanceFromBottom <= 48;

      if (messageList.scrollTop <= 120 && hiddenMessageCount > 0) {
        setVisibleMessageLimit((current) => Math.min(messages.length, current + MESSAGE_WINDOW_STEP));
      }
    };

    updateStickState();
    messageList.addEventListener("scroll", updateStickState, { passive: true });

    return () => {
      messageList.removeEventListener("scroll", updateStickState);
    };
  }, [currentConversationId, hiddenMessageCount, messages.length]);

  useLayoutEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    const conversationChanged = previousMessageConversationIdRef.current !== currentConversationId;

    if (conversationChanged) {
      shouldStickMessageListRef.current = true;
      previousMessageConversationIdRef.current = currentConversationId;
      messageList.scrollTop = messageList.scrollHeight;
      return;
    }

    if (shouldStickMessageListRef.current) {
      messageList.scrollTop = messageList.scrollHeight;
    }

    previousMessageConversationIdRef.current = currentConversationId;
  }, [currentConversationId, messages]);

  useEffect(() => {
    selectedConversationStreamStateRef.current = "";
  }, [currentConversationId]);

  useEffect(() => {
    setVisibleMessageLimit(MESSAGE_WINDOW_STEP);
  }, [currentConversationId]);

  useEffect(() => {
    if (typeof window === "undefined" || !("EventSource" in window)) {
      return;
    }

    const streamUrl = new URL("/api/chat/stream", window.location.origin);
    if (currentConversationId) {
      streamUrl.searchParams.set("conversationId", currentConversationId);
    }

    const source = new EventSource(streamUrl.toString());
    let refreshInFlight = false;
    let refreshQueued = false;

    const runRefresh = (shouldRefreshMessages: boolean) => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      void (async () => {
        try {
          await loadConversations({ background: true });
          if (shouldRefreshMessages && currentConversationId) {
            await loadMessages(currentConversationId);
          }
        } finally {
          refreshInFlight = false;
          if (refreshQueued) {
            refreshQueued = false;
            runRefresh(Boolean(currentConversationId));
          }
        }
      })();
    };

    const handleUpdate = (event: MessageEvent<string>) => {
      let payload:
        | {
            conversationSignature?: string;
            selectedConversationId?: string | null;
            selectedConversationState?: string;
          }
        | null = null;

      try {
        payload = JSON.parse(event.data) as {
          conversationSignature?: string;
          selectedConversationId?: string | null;
          selectedConversationState?: string;
        };
      } catch {
        payload = null;
      }

      const signature = payload?.conversationSignature || "";
      const signatureChanged = signature.length > 0 && signature !== conversationStreamSignatureRef.current;
      if (signatureChanged) {
        conversationStreamSignatureRef.current = signature;
      }

      if (!currentConversationId) {
        if (!signatureChanged) {
          return;
        }
        runRefresh(false);
        return;
      }

      const selectedId = payload?.selectedConversationId || null;
      const selectedState = payload?.selectedConversationState || "";
      const selectedChanged = selectedId === currentConversationId && selectedState.length > 0 && selectedConversationStreamStateRef.current !== selectedState;

      if (!selectedChanged && !signatureChanged) {
        return;
      }

      if (!selectedChanged) {
        runRefresh(false);
        return;
      }

      selectedConversationStreamStateRef.current = selectedState;
      runRefresh(true);
    };

    const handleFocusRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      runRefresh(Boolean(currentConversationId));
    };

    source.addEventListener("chat-update", handleUpdate as EventListener);
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleFocusRefresh);

    return () => {
      source.removeEventListener("chat-update", handleUpdate as EventListener);
      source.close();
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleFocusRefresh);
    };
  }, [currentConversationId, loadConversations, loadMessages]);

  useEffect(() => {
    if (typeof window !== "undefined" && "EventSource" in window) {
      return;
    }

    const refresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void loadConversations({ background: true });
      if (currentConversationId) {
        void loadMessages(currentConversationId);
      }
    };

    const intervalMs = currentConversationId ? OPEN_CHAT_POLL_INTERVAL_MS : IDLE_CHAT_POLL_INTERVAL_MS;
    const intervalId = window.setInterval(refresh, intervalMs);
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [currentConversationId, loadConversations, loadMessages]);

  async function handleStartConversation(userId: string) {
    setIsStartingConversation(true);
    setStatus(null);

    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const payload = (await response.json().catch(() => null)) as { item?: ChatConversationSummary; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to start conversation.");
      }

      await loadConversations({ background: true });
      if (requestedConversationId && requestedConversationId !== payload.item.id) {
        shouldHonorRequestedConversationRef.current = false;
      }
      setCurrentConversationId(payload.item.id);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to start conversation." });
    } finally {
      setIsStartingConversation(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentConversationId) {
      setStatus({ type: "info", message: "Open a conversation first." });
      return;
    }

    if (!draft.trim()) {
      setStatus({ type: "info", message: "Enter a message before sending." });
      return;
    }

    const outgoingBody = composerMode === "message"
      ? draft
      : `\`\`\`${composerMode === "command" ? "bash" : "text"}\n${draft.replace(/\s+$/, "")}\n\`\`\``;

    setIsSending(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/chat/conversations/${currentConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: outgoingBody }),
      });
      const payload = (await response.json().catch(() => null)) as { item?: ChatMessageItem; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to send message.");
      }

      setDraft("");
      setComposerMode("message");
      setIsComposerMenuOpen(false);
      preservePhoneConversationRef.current = isPhoneViewport;
      await Promise.all([loadMessages(currentConversationId), loadConversations({ background: true })]);
      window.dispatchEvent(new CustomEvent("chat:unread-updated"));
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to send message." });
    } finally {
      setIsSending(false);
    }
  }

  async function handleTogglePinned(conversationId: string, pinned: boolean) {
    setPinningConversationId(conversationId);
    setStatus(null);

    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      const payload = (await response.json().catch(() => null)) as { item?: ChatConversationSummary; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to update pin state.");
      }

      setConversations((current) => current.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, isPinned: pinned }
          : conversation
      )));
      void loadConversations({ background: true });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update pin state.",
      });
    } finally {
      setPinningConversationId(null);
    }
  }

  async function handleToggleMessagePinned(messageId: string, pinned: boolean) {
    if (!currentConversationId) {
      return;
    }

    setPinningMessageId(messageId);
    setStatus(null);

    try {
      const response = await fetch(`/api/chat/conversations/${currentConversationId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      const payload = (await response.json().catch(() => null)) as { item?: ChatMessageItem; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to update message pin.");
      }

      await loadMessages(currentConversationId);
      setStatus({ type: "info", message: pinned ? "Message pinned." : "Message unpinned." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update message pin.",
      });
    } finally {
      setPinningMessageId(null);
    }
  }

  function scrollToMessage(messageId: string) {
    const node = messageItemRefs.current[messageId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const targetIndex = messages.findIndex((message) => message.id === messageId);
    if (targetIndex === -1) {
      return;
    }

    setVisibleMessageLimit(messages.length);
    window.requestAnimationFrame(() => {
      const nextNode = messageItemRefs.current[messageId];
      nextNode?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function handleMessageSurfaceClick(event: React.MouseEvent<HTMLDivElement>, message: ChatMessageItem) {
    if (shouldIgnoreMessagePinToggle(event.target) || pinningMessageId === message.id) {
      return;
    }

    void handleToggleMessagePinned(message.id, !message.isPinned);
  }

  function handleMessageSurfaceKeyDown(event: React.KeyboardEvent<HTMLDivElement>, message: ChatMessageItem) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (shouldIgnoreMessagePinToggle(event.target) || pinningMessageId === message.id) {
      return;
    }

    event.preventDefault();
    void handleToggleMessagePinned(message.id, !message.isPinned);
  }

  function handleConversationCardClick(conversationId: string) {
    if (suppressedConversationOpenRef.current === conversationId) {
      suppressedConversationOpenRef.current = null;
      return;
    }

    if (requestedConversationId && conversationId !== requestedConversationId) {
      shouldHonorRequestedConversationRef.current = false;
    }

    setCurrentConversationId(conversationId);
  }

  function handleCardActionClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleConversationCardTouchStart(event: React.TouchEvent<HTMLButtonElement>, conversationId: string) {
    if (!isPhoneViewport || event.touches.length !== 1) {
      return;
    }

    if (activeGestureRef.current === "pull-refresh") {
      return;
    }

    if (activeGestureRef.current === "card-swipe" && activeSwipeConversationIdRef.current && activeSwipeConversationIdRef.current !== conversationId) {
      return;
    }

    if (swipeResetTimeoutRef.current !== null) {
      window.clearTimeout(swipeResetTimeoutRef.current);
      swipeResetTimeoutRef.current = null;
    }

    const touch = event.touches[0];
    conversationSwipeStartRef.current = { id: conversationId, x: touch.clientX, y: touch.clientY };
    conversationSwipeDeltaRef.current = 0;
    setConversationSwipeVisual({ id: conversationId, dx: 0, snapping: false });
  }

  function handleConversationCardTouchMove(event: React.TouchEvent<HTMLButtonElement>) {
    const start = conversationSwipeStartRef.current;
    if (!start || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    const absDx = Math.abs(dx);
    const directionLockThreshold = 12;

    if (activeGestureRef.current === null) {
      if (absDx < directionLockThreshold && dy < directionLockThreshold) {
        return;
      }

      if (absDx > dy) {
        activeGestureRef.current = "card-swipe";
        activeSwipeConversationIdRef.current = start.id;
      } else {
        return;
      }
    }

    if (activeGestureRef.current !== "card-swipe" || activeSwipeConversationIdRef.current !== start.id) {
      return;
    }

    if (dy > Math.abs(dx)) {
      conversationSwipeDeltaRef.current = 0;
      setConversationSwipeVisual((current) => current && current.id === start.id ? { ...current, dx: 0, snapping: false } : current);
      return;
    }

    const clampedDx = Math.max(-96, Math.min(96, dx));
    conversationSwipeDeltaRef.current = clampedDx;
    setConversationSwipeVisual((current) => current && current.id === start.id ? { ...current, dx: clampedDx, snapping: false } : { id: start.id, dx: clampedDx, snapping: false });
  }

  function handleConversationCardTouchEnd(conversation: ChatConversationSummary) {
    const start = conversationSwipeStartRef.current;
    const ownsSwipe = activeGestureRef.current === "card-swipe" && activeSwipeConversationIdRef.current === conversation.id;
    conversationSwipeStartRef.current = null;

    if (!ownsSwipe) {
      conversationSwipeDeltaRef.current = 0;
      setConversationSwipeVisual((current) => current?.id === conversation.id ? null : current);
      return;
    }

    const dx = conversationSwipeDeltaRef.current;
    conversationSwipeDeltaRef.current = 0;
    activeGestureRef.current = null;
    activeSwipeConversationIdRef.current = null;

    if (!isPhoneViewport || !start || start.id !== conversation.id) {
      return;
    }

    const threshold = 72;
    const snapBack = () => {
      setConversationSwipeVisual({ id: conversation.id, dx: 0, snapping: true });
      swipeResetTimeoutRef.current = window.setTimeout(() => {
        setConversationSwipeVisual((current) => current?.id === conversation.id ? null : current);
        swipeResetTimeoutRef.current = null;
      }, 260);
    };

    if (Math.abs(dx) < threshold) {
      snapBack();
      return;
    }

    suppressedConversationOpenRef.current = conversation.id;

    if (dx > 0) {
      snapBack();
      void handleTogglePinned(conversation.id, !conversation.isPinned);
      return;
    }

    snapBack();
    hideConversationForCurrentUser(conversation.id);
  }

  function hideConversationForCurrentUser(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    const baseline = conversation?.lastMessageAt || new Date().toISOString();

    if (hideUndoTimeoutRef.current !== null) {
      window.clearTimeout(hideUndoTimeoutRef.current);
      hideUndoTimeoutRef.current = null;
    }

    setHiddenConversationIds((current) => current.includes(conversationId) ? current : [...current, conversationId]);
    setHiddenConversationBaselines((current) => ({ ...current, [conversationId]: baseline }));
    removeConversationFromCache(conversationId);
    setCurrentConversationId((current) => current === conversationId ? null : current);
    setPendingHiddenConversation({
      conversationId,
      title: conversation?.title || "Conversation",
    });

    hideUndoTimeoutRef.current = window.setTimeout(() => {
      setPendingHiddenConversation((current) => current?.conversationId === conversationId ? null : current);
      hideUndoTimeoutRef.current = null;
    }, HIDE_UNDO_TIMEOUT_MS);
  }

  function handleUndoHideConversation() {
    if (!pendingHiddenConversation) {
      return;
    }

    if (hideUndoTimeoutRef.current !== null) {
      window.clearTimeout(hideUndoTimeoutRef.current);
      hideUndoTimeoutRef.current = null;
    }

    setHiddenConversationIds((current) => current.filter((id) => id !== pendingHiddenConversation.conversationId));
    setHiddenConversationBaselines((current) => {
      const next = { ...current };
      delete next[pendingHiddenConversation.conversationId];
      return next;
    });
    setCurrentConversationId(pendingHiddenConversation.conversationId);
    setPendingHiddenConversation(null);
  }

  async function handlePullToRefreshChats() {
    if (isPullRefreshing) {
      return;
    }

    setIsPullRefreshing(true);
    try {
      const tasks: Array<Promise<unknown>> = [
        loadUsers({ background: true }),
        loadConversations({ background: true }),
      ];

      if (currentConversationId) {
        tasks.push(loadMessages(currentConversationId));
      }

      await Promise.all(tasks);
    } finally {
      setIsPullRefreshing(false);
      setIsPullArmed(false);
      setPullVisualOffset(0);
    }
  }

  function handleConversationListTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (!isPhoneViewport || event.touches.length !== 1) {
      pullStartXRef.current = null;
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      setIsPullingList(false);
      return;
    }

    if (activeGestureRef.current === "card-swipe") {
      pullStartXRef.current = null;
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      setIsPullingList(false);
      return;
    }

    const list = conversationListRef.current;
    if (!list || list.scrollTop > 0) {
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      setIsPullingList(false);
      return;
    }

    pullStartXRef.current = event.touches[0].clientX;
    pullStartYRef.current = event.touches[0].clientY;
    pullDistanceRef.current = 0;
    setIsPullingList(true);
    setIsPullArmed(false);
  }

  function handleConversationListTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (!isPhoneViewport || pullStartYRef.current === null || pullStartXRef.current === null || event.touches.length !== 1) {
      return;
    }

    if (activeGestureRef.current === "card-swipe") {
      return;
    }

    const deltaX = event.touches[0].clientX - pullStartXRef.current;
    const deltaY = event.touches[0].clientY - pullStartYRef.current;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    const directionLockThreshold = 12;

    if (activeGestureRef.current === null) {
      if (absDeltaX < directionLockThreshold && absDeltaY < directionLockThreshold) {
        return;
      }

      if (deltaY > 0 && absDeltaY > absDeltaX) {
        activeGestureRef.current = "pull-refresh";
      } else {
        return;
      }
    }

    if (activeGestureRef.current !== "pull-refresh") {
      return;
    }

    const positiveDelta = deltaY > 0 ? deltaY : 0;
    const dampedDelta = Math.min(96, positiveDelta * 0.5);

    if (positiveDelta > 0) {
      event.preventDefault();
    }

    pullDistanceRef.current = dampedDelta;
    setPullVisualOffset(dampedDelta);
    setIsPullArmed(dampedDelta >= 72);
  }

  function handleConversationListTouchEnd() {
    const ownsPull = activeGestureRef.current === "pull-refresh";
    pullStartXRef.current = null;

    if (!ownsPull) {
      pullStartYRef.current = null;
      pullDistanceRef.current = 0;
      setIsPullingList(false);
      return;
    }

    const threshold = 72;
    const distance = pullDistanceRef.current;
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    activeGestureRef.current = null;
    setIsPullingList(false);

    if (!isPhoneViewport || distance < threshold) {
      setIsPullArmed(false);
      setPullVisualOffset(0);
      return;
    }

    setPullVisualOffset(56);
    void handlePullToRefreshChats();
  }

  function handleConversationListTouchCancel() {
    pullStartXRef.current = null;
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    activeGestureRef.current = null;
    activeSwipeConversationIdRef.current = null;
    setIsPullingList(false);
    setIsPullArmed(false);
    setPullVisualOffset(0);
  }

  async function handleDeleteConversation(conversationId: string) {
    if (deletingConversationId) {
      return;
    }

    const confirmed = window.confirm("Delete this conversation? This will remove the thread and its messages for everyone.");
    if (!confirmed) {
      return;
    }

    setDeletingConversationId(conversationId);
    setStatus(null);

    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to delete conversation.");
      }

      removeConversationFromCache(conversationId);
      await loadConversations({ background: true });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete conversation.",
      });
    } finally {
      setDeletingConversationId(null);
    }
  }

  const insertDraftText = useCallback((value: string) => {
    const textarea = draftTextareaRef.current;
    if (!textarea) {
      setDraft((current) => `${current}${value}`);
      return;
    }

    const textareaValue = textarea.value;
    const start = textarea.selectionStart ?? textareaValue.length;
    const end = textarea.selectionEnd ?? textareaValue.length;
    const nextDraft = `${textareaValue.slice(0, start)}${value}${textareaValue.slice(end)}`;
    const selectionStart = start + value.length;

    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      focusDraftTextarea();
      textarea.setSelectionRange(selectionStart, selectionStart);
    });
  }, [focusDraftTextarea]);

  const handleClosePhoneConversation = useCallback(() => {
    setCurrentConversationId(null);
  }, []);

  function handleSelectComposerMode(mode: Exclude<ComposerMode, "message">) {
    setComposerMode(mode);
    window.requestAnimationFrame(() => {
      focusDraftTextarea(true);
    });
    setIsComposerMenuOpen(false);
  }

  function handleResetComposerMode() {
    setComposerMode("message");
    setIsComposerMenuOpen(false);
    window.requestAnimationFrame(() => {
      focusDraftTextarea(true);
    });
  }

  function handleDraftKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!isSending && draft.trim()) {
        event.currentTarget.form?.requestSubmit();
      }

      return;
    }

    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      insertDraftText("\n");
      return;
    }

    if (event.key !== "Tab" || composerMode === "message") {
      return;
    }

    event.preventDefault();
    insertDraftText("  ");
  }

  useEffect(() => {
    if (!isComposerMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!composerMenuRef.current?.contains(event.target as Node)) {
        setIsComposerMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isComposerMenuOpen]);

  useEffect(() => {
    if (!currentConversationId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || event.key.length !== 1
      ) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target === draftTextareaRef.current
        || target?.isContentEditable
        || target?.closest("input, textarea, select, button, a, [role='button'], [role='link'], [contenteditable='true']")
      ) {
        return;
      }

      event.preventDefault();
      insertDraftText(event.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentConversationId, insertDraftText]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      if (statusResetTimeoutRef.current !== null) {
        window.clearTimeout(statusResetTimeoutRef.current);
      }

      if (swipeResetTimeoutRef.current !== null) {
        window.clearTimeout(swipeResetTimeoutRef.current);
      }

      if (hideUndoTimeoutRef.current !== null) {
        window.clearTimeout(hideUndoTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (statusResetTimeoutRef.current !== null) {
      window.clearTimeout(statusResetTimeoutRef.current);
      statusResetTimeoutRef.current = null;
    }

    if (!status) {
      return;
    }

    statusResetTimeoutRef.current = window.setTimeout(() => {
      setStatus(null);
      statusResetTimeoutRef.current = null;
    }, status.type === "error" ? 6000 : 4000);

    return () => {
      if (statusResetTimeoutRef.current !== null) {
        window.clearTimeout(statusResetTimeoutRef.current);
        statusResetTimeoutRef.current = null;
      }
    };
  }, [status]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {status ? (
        <div className={[
          "pointer-events-auto absolute inset-x-3 top-3 z-30 rounded-[20px] border px-4 py-3 pr-12 text-sm shadow-[0_18px_40px_rgba(0,0,0,0.28)] max-[767px]:top-auto max-[767px]:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]",
          status.type === "error"
            ? "border-rose-500/35 bg-rose-500/10 text-rose-200"
            : "border-zinc-700 bg-zinc-900 text-zinc-300",
        ].join(" ")}>
          <button
            type="button"
            onClick={() => setStatus(null)}
            className={[
              "absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full transition",
              status.type === "error"
                ? "text-rose-400/80 hover:bg-rose-400/10 hover:text-rose-300"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400",
            ].join(" ")}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {status.message}
        </div>
      ) : null}
      {pendingHiddenConversation ? (
        <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 rounded-[18px] border border-zinc-700 bg-zinc-900/95 px-3 py-2.5 text-sm text-zinc-200 shadow-[0_16px_36px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate">
              Conversation hidden: {pendingHiddenConversation.title}
            </div>
            <button
              type="button"
              onClick={handleUndoHideConversation}
              className="inline-flex h-8 items-center rounded-full border border-lime-300/45 bg-lime-400/10 px-3 text-xs font-medium text-lime-200 transition hover:border-lime-300/70 hover:bg-lime-400/15"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                if (hideUndoTimeoutRef.current !== null) {
                  window.clearTimeout(hideUndoTimeoutRef.current);
                  hideUndoTimeoutRef.current = null;
                }
                setPendingHiddenConversation(null);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Dismiss undo"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      <div className="relative grid h-full min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden overscroll-none bg-transparent max-[767px]:grid-cols-1 max-[767px]:bg-zinc-950">
        <aside className={cn("flex min-h-0 flex-col overflow-hidden border-r border-zinc-800 max-[767px]:border-r-0", isPhoneViewport && currentConversation ? "max-[767px]:hidden" : "") }>
          <div className="shrink-0 border-b border-zinc-800 px-3 py-3">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                aria-label="Go home"
                title="Home"
                className={buttonVariants({ variant: "outline", className: "ticket-action-btn h-12 w-12 min-h-12 min-w-12 rounded-xl border-zinc-800 bg-zinc-950/70 px-0 text-zinc-100 hover:bg-zinc-900" })}
              >
                <ArrowLeft className="h-6 w-6" />
              </Link>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search" className="h-10 pl-9" />
              </div>
            </div>
          </div>

          <div
            ref={conversationListRef}
            onTouchStart={handleConversationListTouchStart}
            onTouchMove={handleConversationListTouchMove}
            onTouchEnd={handleConversationListTouchEnd}
            onTouchCancel={handleConversationListTouchCancel}
            className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3"
          >
            {(pullVisualOffset > 0 || isPullRefreshing) ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center"
                style={{ opacity: isPullRefreshing ? 1 : Math.min(1, pullVisualOffset / 72) }}
              >
                <div className="rounded-full border border-zinc-700/80 bg-zinc-900/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 shadow-[0_8px_20px_rgba(0,0,0,0.25)]">
                  {isPullRefreshing ? "Refreshing chats" : isPullArmed ? "Release to refresh" : "Pull to refresh"}
                </div>
              </div>
            ) : null}

            <div
              className={isPullingList ? "transition-none" : "transition-transform duration-200 ease-out"}
              style={{ transform: `translateY(${pullVisualOffset}px)` }}
            >
            {showSearchResults ? (
              <section>
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Results</div>
                <div className="space-y-3">
                  <div>
                    <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">People</div>
                    <div className="space-y-1">
                      {isUsersLoading && users.length === 0 ? (
                        <div className="rounded-[18px] border border-zinc-800 bg-zinc-950/55 px-3 py-3 text-sm text-zinc-400">Loading people...</div>
                      ) : matchingUsers.length === 0 ? (
                        <div className="rounded-[16px] border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-500">No people match your search.</div>
                      ) : (
                        matchingUsers.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => void handleStartConversation(user.id)}
                            className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-zinc-800 bg-zinc-950/55 px-3 py-3 text-left transition hover:bg-zinc-900/70"
                            disabled={isStartingConversation}
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-400/25 bg-sky-400/10 text-[12px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                              {buildConversationAvatarLabel(user.fullName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-[13px] font-semibold leading-4 text-zinc-100">{user.fullName}</div>
                                <PenSquare className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                              </div>
                              <div className="truncate pt-0.5 text-[11px] leading-4 text-zinc-500">{user.email}</div>
                              <div className="truncate pt-0.5 text-[11px] leading-4 text-zinc-500">{user.role} · {user.email}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Messages</div>
                    <div className="space-y-1">
                      {isConversationsLoading && conversations.length === 0 ? (
                        <div className="rounded-[18px] border border-zinc-800 bg-zinc-950/55 px-3 py-3 text-sm text-zinc-400">Loading messages...</div>
                      ) : conversationResults.length === 0 ? (
                        <div className="rounded-[16px] border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-500">No messages match your search.</div>
                      ) : (
                        conversationResults.map(({ conversation, preview }) => {
                          const swipeDx = conversationSwipeVisual?.id === conversation.id ? conversationSwipeVisual.dx : 0;
                          const swipeProgress = Math.min(1, Math.abs(swipeDx) / 96);
                          return (
                            <div key={conversation.id} className="group relative max-[767px]:overflow-hidden rounded-[18px]">
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
                                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-400/15 text-emerald-200" style={{ opacity: swipeDx > 0 ? swipeProgress : 0 }}>
                                  <Pin className="h-4 w-4" />
                                </div>
                                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/35 bg-rose-400/15 text-rose-200" style={{ opacity: swipeDx < 0 ? swipeProgress : 0 }}>
                                  <Trash2 className="h-4 w-4" />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleConversationCardClick(conversation.id)}
                                onTouchStart={(event) => handleConversationCardTouchStart(event, conversation.id)}
                                onTouchMove={handleConversationCardTouchMove}
                                onTouchEnd={() => handleConversationCardTouchEnd(conversation)}
                                className={[
                                  "relative z-10 w-full rounded-[18px] border px-3 py-3 text-left touch-pan-y min-[768px]:pr-10",
                                  conversationSwipeVisual?.id === conversation.id && !conversationSwipeVisual.snapping
                                    ? "transition-none"
                                    : "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                  Math.abs(swipeDx) >= 72 ? "shadow-[0_16px_30px_rgba(0,0,0,0.28)]" : "",
                                  conversation.id === currentConversationId
                                    ? "border-lime-400/35 bg-lime-400/10"
                                    : "border-zinc-800 bg-zinc-950/55 hover:bg-zinc-900/70",
                                ].join(" ")}
                                style={{ transform: `translateX(${swipeDx}px) scale(${Math.abs(swipeDx) >= 72 ? 1.01 : 1})` }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-400/20 bg-lime-400/10 text-[12px] font-semibold uppercase tracking-[0.16em] text-lime-200">
                                    {buildConversationAvatarLabel(conversation.title)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-semibold leading-4 text-zinc-100">{conversation.title}</div>
                                    <div className="truncate pt-0.5 text-[11px] leading-4 text-zinc-500">{preview}</div>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1 min-[768px]:hidden">
                                    <div className="text-[10px] leading-3 text-zinc-500">{formatConversationCardTime(conversation.lastMessageAt)}</div>
                                    <div className="flex min-h-4 items-center gap-1.5">
                                      {conversation.isPinned ? <Pin className="h-3 w-3 fill-current text-amber-300" /> : null}
                                      {conversation.unreadCount > 0 ? (
                                        <span className="inline-flex"><Badge variant="success">{conversation.unreadCount}</Badge></span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </button>
                              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden min-[768px]:flex flex-col items-end justify-between px-2.5 py-2.5">
                                <div className="text-[10px] leading-3 text-zinc-500">{formatConversationCardTime(conversation.lastMessageAt)}</div>
                                <div className="flex items-center gap-1.5">
                                  {conversation.unreadCount > 0 ? (
                                    <span className="pointer-events-auto inline-flex"><Badge variant="success">{conversation.unreadCount}</Badge></span>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      handleCardActionClick(event);
                                      void handleTogglePinned(conversation.id, !conversation.isPinned);
                                    }}
                                    className={cn(
                                      "pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-150",
                                      conversation.isPinned
                                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                                        : "border-zinc-700/70 bg-zinc-900/80 text-zinc-500 opacity-0 group-hover:opacity-100 hover:border-zinc-600 hover:text-zinc-300",
                                    )}
                                    disabled={pinningConversationId === conversation.id}
                                    aria-label={conversation.isPinned ? "Unpin conversation" : "Pin conversation"}
                                    title={conversation.isPinned ? "Unpin" : "Pin"}
                                  >
                                    <Pin className={cn("h-3 w-3", conversation.isPinned ? "fill-current" : "")} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section>
                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Chats</div>
                <div className="space-y-1">
                  {isConversationsLoading ? (
                    conversations.length === 0 ? (
                      <div className="rounded-[18px] border border-zinc-800 bg-zinc-950/55 px-3 py-3 text-sm text-zinc-400">Loading chats...</div>
                    ) : null
                  ) : conversationResults.length === 0 ? (
                    <div className="rounded-[18px] border border-zinc-800 bg-zinc-950/55 px-3 py-3 text-sm text-zinc-400">Search for a person or message to start chatting.</div>
                  ) : (
                    conversationResults.map(({ conversation, preview }) => {
                      const swipeDx = conversationSwipeVisual?.id === conversation.id ? conversationSwipeVisual.dx : 0;
                      const swipeProgress = Math.min(1, Math.abs(swipeDx) / 96);
                      return (
                      <div key={conversation.id} className="group relative max-[767px]:overflow-hidden rounded-[18px]">
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
                          <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-400/15 text-emerald-200" style={{ opacity: swipeDx > 0 ? swipeProgress : 0 }}>
                            <Pin className="h-4 w-4" />
                          </div>
                          <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/35 bg-rose-400/15 text-rose-200" style={{ opacity: swipeDx < 0 ? swipeProgress : 0 }}>
                            <Trash2 className="h-4 w-4" />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConversationCardClick(conversation.id)}
                          onTouchStart={(event) => handleConversationCardTouchStart(event, conversation.id)}
                          onTouchMove={handleConversationCardTouchMove}
                          onTouchEnd={() => handleConversationCardTouchEnd(conversation)}
                          className={[
                            "relative z-10 w-full rounded-[18px] border px-3 py-3 text-left touch-pan-y min-[768px]:pr-10",
                            conversationSwipeVisual?.id === conversation.id && !conversationSwipeVisual.snapping
                              ? "transition-none"
                              : "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                            Math.abs(swipeDx) >= 72 ? "shadow-[0_16px_30px_rgba(0,0,0,0.28)]" : "",
                            conversation.id === currentConversationId
                              ? "border-lime-400/35 bg-lime-400/10"
                              : "border-zinc-800 bg-zinc-950/55 hover:bg-zinc-900/70",
                          ].join(" ")}
                          style={{ transform: `translateX(${swipeDx}px) scale(${Math.abs(swipeDx) >= 72 ? 1.01 : 1})` }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-lime-400/20 bg-lime-400/10 text-[12px] font-semibold uppercase tracking-[0.16em] text-lime-200">
                              {buildConversationAvatarLabel(conversation.title)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold leading-4 text-zinc-100">{conversation.title}</div>
                              <div className="truncate pt-0.5 text-[11px] leading-4 text-zinc-500">{preview}</div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1 min-[768px]:hidden">
                              <div className="text-[10px] leading-3 text-zinc-500">{formatConversationCardTime(conversation.lastMessageAt)}</div>
                              <div className="flex min-h-4 items-center gap-1.5">
                                {conversation.isPinned ? <Pin className="h-3 w-3 fill-current text-amber-300" /> : null}
                                {conversation.unreadCount > 0 ? (
                                  <span className="inline-flex"><Badge variant="success">{conversation.unreadCount}</Badge></span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                        <div className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden min-[768px]:flex flex-col items-end justify-between px-2.5 py-2.5">
                          <div className="text-[10px] leading-3 text-zinc-500">{formatConversationCardTime(conversation.lastMessageAt)}</div>
                          <div className="flex items-center gap-1.5">
                            {conversation.unreadCount > 0 ? (
                              <span className="pointer-events-auto inline-flex"><Badge variant="success">{conversation.unreadCount}</Badge></span>
                            ) : null}
                            <button
                              type="button"
                              onClick={(event) => {
                                handleCardActionClick(event);
                                void handleTogglePinned(conversation.id, !conversation.isPinned);
                              }}
                              className={cn(
                                "pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-150",
                                conversation.isPinned
                                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                                  : "border-zinc-700/70 bg-zinc-900/80 text-zinc-500 opacity-0 group-hover:opacity-100 hover:border-zinc-600 hover:text-zinc-300",
                              )}
                              disabled={pinningConversationId === conversation.id}
                              aria-label={conversation.isPinned ? "Unpin conversation" : "Pin conversation"}
                              title={conversation.isPinned ? "Unpin" : "Pin"}
                            >
                              <Pin className={cn("h-3 w-3", conversation.isPinned ? "fill-current" : "")} />
                            </button>
                          </div>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}
            </div>
          </div>
        </aside>

        <section className={cn("min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden overscroll-none", isPhoneViewport && !currentConversation ? "max-[767px]:hidden" : "") }>
          {currentConversation ? (
            <div className="grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden overscroll-none">
              <div className="relative z-20 shrink-0 flex min-w-0 items-center justify-between gap-2 border-b border-zinc-800 bg-transparent px-5 py-4 max-[767px]:px-3 max-[767px]:py-3">
                <div className="flex min-w-0 items-center gap-3 max-[767px]:gap-2">
                  <button
                    type="button"
                    onClick={handleClosePhoneConversation}
                    className="hidden h-9 min-h-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 text-xs text-zinc-100 transition hover:bg-zinc-900 max-[767px]:inline-flex"
                    aria-label="Back to messages"
                    title="Back"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="pointer-events-none absolute inset-x-16 flex justify-center max-[767px]:inset-x-12">
                  <div className="truncate text-center text-base font-semibold text-zinc-50 max-[767px]:text-sm">
                    {currentConversationHeaderLabel}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 max-[767px]:gap-1">
                  <button
                    type="button"
                    onClick={() => void handleTogglePinned(currentConversation.id, !currentConversation.isPinned)}
                    className={[
                      "inline-flex h-9 w-9 items-center justify-center rounded-full border px-0 text-xs font-semibold uppercase tracking-[0.16em] transition",
                      currentConversation.isPinned
                        ? "border-amber-400/35 bg-amber-400/10 text-amber-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
                    ].join(" ")}
                    disabled={pinningConversationId === currentConversation.id}
                    aria-label={pinningConversationId === currentConversation.id ? "Saving pin state" : currentConversation.isPinned ? "Unpin conversation" : "Pin conversation"}
                    title={pinningConversationId === currentConversation.id ? "Saving" : currentConversation.isPinned ? "Pinned" : "Pin"}
                  >
                    <Pin className={`h-3.5 w-3.5 ${currentConversation.isPinned ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteConversation(currentConversation.id)}
                    className="hidden min-[768px]:inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/35 bg-rose-500/10 px-0 text-rose-200 transition hover:bg-rose-500/15"
                    disabled={deletingConversationId === currentConversation.id}
                    aria-label={deletingConversationId === currentConversation.id ? "Deleting conversation" : "Delete conversation"}
                    title={deletingConversationId === currentConversation.id ? "Deleting" : "Delete"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 min-w-0 flex flex-col overflow-hidden overscroll-none bg-zinc-950">
                {pinnedMessages.length > 0 ? (
                  <div className="shrink-0 border-b border-zinc-800/80 bg-zinc-950/55 px-5 py-2 max-[767px]:pointer-events-none max-[767px]:absolute max-[767px]:inset-x-3 max-[767px]:top-3 max-[767px]:z-20 max-[767px]:border-b-0 max-[767px]:bg-transparent max-[767px]:px-0 max-[767px]:py-0">
                    {isPhoneViewport && featuredPinnedMessage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (showPinsOverlay) {
                              setShowPinsOverlay(false);
                              scrollToMessage(featuredPinnedMessage.id);
                            } else {
                              setShowPinsOverlay(true);
                            }
                          }}
                          className="group flex w-full items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-950/78 px-3 py-2 text-left shadow-[0_12px_28px_rgba(0,0,0,0.32)] backdrop-blur-md transition hover:border-amber-300/35 hover:bg-zinc-900/88 pointer-events-auto relative z-50"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/12 text-amber-200">
                            <Pin className="h-3 w-3 fill-current" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/80">
                              {featuredPinnedMessage.senderLabel}
                            </div>
                            <div className="truncate pt-0.5 text-[11px] leading-4 text-zinc-200">
                              {buildPinnedMessagePreview(featuredPinnedMessage.body)}
                            </div>
                          </div>
                          {showPinsOverlay
                            ? <div className="shrink-0 text-[10px] text-zinc-500">{formatMessageTime(featuredPinnedMessage.createdAt)}</div>
                            : pinnedMessages.length > 1
                              ? <div
                                  className="shrink-0 rounded-full border border-zinc-700/80 bg-zinc-900/90 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300"
                                  onClick={(e) => { e.stopPropagation(); setShowPinsOverlay(true); }}
                                >{pinnedMessages.length}</div>
                              : null}
                        </button>
                        {/* Fade chat background and show overlay below the pin, so the pin never fades */}
                        {showPinsOverlay && (
                          <>
                            <div
                              className="fixed inset-0 z-30 bg-black/30 transition-opacity animate-fade-in"
                              style={{ pointerEvents: 'auto' }}
                              onClick={() => setShowPinsOverlay(false)}
                              aria-label="Close pins overlay"
                            />
                            <div className="absolute left-0 right-0 z-40 mt-1 flex flex-col items-stretch" style={{ top: '100%' }}>
                              {pinnedMessages.slice(1).map((message) => (
                                <button
                                  key={`overlay-pin-${message.id}`}
                                  onClick={() => {
                                    setShowPinsOverlay(false);
                                    setTimeout(() => scrollToMessage(message.id), 250);
                                  }}
                                  className="group flex w-full items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-950/78 px-3 py-2 text-left shadow-[0_12px_28px_rgba(0,0,0,0.32)] backdrop-blur-md transition hover:border-amber-300/35 hover:bg-zinc-900/88 pointer-events-auto animate-slide-down"
                                >
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/12 text-amber-200">
                                    <Pin className="h-3 w-3 fill-current" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/80">
                                      {message.senderLabel}
                                    </div>
                                    <div className="truncate pt-0.5 text-[11px] leading-4 text-zinc-200">
                                      {buildPinnedMessagePreview(message.body)}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-[10px] text-zinc-500">{formatMessageTime(message.createdAt)}</div>
                                </button>
                              ))}
                              <style jsx>{`
                                .animate-slide-down { animation: slideDown 0.22s cubic-bezier(.4,1.4,.6,1) both; }
                                @keyframes slideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
                              `}</style>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-[767px]:gap-1.5">
                        {pinnedMessages.map((message) => (
                          <button
                            key={`pinned-${message.id}`}
                            type="button"
                            onClick={() => scrollToMessage(message.id)}
                            className="group relative w-[240px] shrink-0 overflow-hidden rounded-[18px] border border-zinc-800 bg-zinc-950/90 px-3 py-3 text-left transition hover:border-amber-300/35 hover:bg-zinc-900/95 max-[767px]:w-[148px] max-[767px]:rounded-[12px] max-[767px]:px-2 max-[767px]:py-1.5"
                          >
                            <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-300/90 via-amber-400/50 to-transparent max-[767px]:w-0.5" />
                            <div className="flex items-center justify-between gap-2 pl-1 max-[767px]:pl-0.5">
                              <div className="truncate text-[12px] font-semibold text-zinc-100 max-[767px]:text-[10px] max-[767px]:leading-4">{message.senderLabel}</div>
                              <div className="shrink-0 text-[10px] text-zinc-500 max-[767px]:text-[8px]">{formatMessageTime(message.createdAt)}</div>
                            </div>
                            <div className="min-w-0 pl-1 pt-1.5 max-[767px]:pl-0.5 max-[767px]:pt-0.5">
                              <div className="text-[12px] leading-5 text-zinc-400 max-[767px]:text-[10px] max-[767px]:leading-4">
                                <div className="max-h-10 overflow-hidden max-[767px]:line-clamp-1 max-[767px]:max-h-none">{buildPinnedMessagePreview(message.body)}</div>
                              </div>
                            </div>
                            <div className="pl-1 pt-2 text-[11px] font-medium text-zinc-500 transition group-hover:text-amber-200 max-[767px]:hidden">Jump to message</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div ref={messageListRef} className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 max-[767px]:px-3 max-[767px]:py-3 max-[767px]:pt-16">
                  {hiddenMessageCount > 0 ? (
                    <div className="flex justify-center pb-1">
                      <button
                        type="button"
                        onClick={() => setVisibleMessageLimit((current) => Math.min(messages.length, current + MESSAGE_WINDOW_STEP))}
                        className="rounded-full border border-zinc-700 bg-zinc-900/85 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                      >
                        Load {Math.min(MESSAGE_WINDOW_STEP, hiddenMessageCount)} earlier messages
                      </button>
                    </div>
                  ) : null}
                  {isMessagesLoading && messages.length === 0 ? (
                    <div className="rounded-[20px] border border-zinc-800 bg-zinc-950/55 px-4 py-4 text-sm text-zinc-400">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-[20px] border border-zinc-800 bg-zinc-950/55 px-4 py-4 text-sm text-zinc-400">No messages yet. Send the first one.</div>
                  ) : (
                    visibleMessages.map((message, index) => {
                      const isMine = message.senderUserId === currentUserId;
                      const globalIndex = hiddenMessageCount + index;
                      const previousMessage = globalIndex > 0 ? messages[globalIndex - 1] : null;
                      const currentDayKey = messageDayKey(message.createdAt);
                      const previousDayKey = previousMessage ? messageDayKey(previousMessage.createdAt) : null;
                      const showDayDivider = currentDayKey !== previousDayKey;
                      const previousMessageTime = previousMessage ? formatMessageTime(previousMessage.createdAt) : null;
                      const currentMessageTime = formatMessageTime(message.createdAt);
                      const showTimestamp = currentMessageTime !== previousMessageTime;
                      const messageSegments = splitMessageSegments(message.body);
                      const hasAnyCode = messageSegments.some((segment) => segment.type === "code");
                      const hasOnlyShellCode = hasAnyCode && messageSegments.every(
                        (segment) => segment.type !== "code" || isShellLanguage(segment.language || "text"),
                      );

                      return (
                        <div
                          key={message.id}
                          ref={(node) => {
                            messageItemRefs.current[message.id] = node;
                          }}
                          className="space-y-2 scroll-mt-32"
                        >
                          {showDayDivider ? (
                            <div className="flex items-center justify-center py-1">
                              <div className="rounded-full border border-zinc-800/80 bg-zinc-950/85 px-3 py-1 text-[11px] font-medium text-zinc-400 shadow-[0_8px_24px_rgba(0,0,0,0.22)]">
                                {formatMessageDayLabel(message.createdAt)}
                              </div>
                            </div>
                          ) : null}

                          <div className={`group/message flex items-start gap-0 ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className={cn(
                              "space-y-1",
                              hasOnlyShellCode ? "max-w-[640px]" : hasAnyCode ? "w-full max-w-[640px]" : "max-w-[82%]",
                            )}>
                              {!isMine ? (
                                <div className="px-2 text-[11px] font-medium tracking-[0.08em] text-sky-200/80">
                                  {message.senderLabel}
                                </div>
                              ) : null}

                              <div
                                onClick={(event) => handleMessageSurfaceClick(event, message)}
                                onKeyDown={(event) => handleMessageSurfaceKeyDown(event, message)}
                                className={cn(
                                  "relative rounded-[24px] transition-all duration-200",
                                  pinningMessageId === message.id ? "opacity-60" : "min-[768px]:cursor-default max-[767px]:cursor-pointer",
                                )}
                                role="button"
                                tabIndex={0}
                                aria-label={message.isPinned ? "Unpin message" : "Pin message"}
                                title={message.isPinned ? "Unpin message" : "Pin message"}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleToggleMessagePinned(message.id, !message.isPinned);
                                  }}
                                  className={cn(
                                    "absolute left-0.5 top-1/2 z-20 hidden -translate-y-1/2 cursor-pointer items-center justify-center text-amber-300 transition-colors duration-200 min-[768px]:inline-flex",
                                    pinningMessageId === message.id
                                      ? "pointer-events-none opacity-30"
                                      : "opacity-0 group-hover/message:opacity-100",
                                  )}
                                  disabled={pinningMessageId === message.id}
                                  aria-label={message.isPinned ? "Unpin message" : "Pin message"}
                                  title={message.isPinned ? "Unpin message" : "Pin message"}
                                >
                                  <Pin className={cn("h-3.5 w-3.5", message.isPinned ? "fill-current" : "")} />
                                </button>

                                <div className="relative z-10 min-w-0 space-y-1 transition-[padding] duration-200 min-[768px]:group-hover/message:pl-5">
                                  {messageSegments.map((segment, segmentIndex) => {
                                    if (segment.type === "code") {
                                      const language = segment.language || "text";
                                      const codeKey = `${message.id}:${segmentIndex}:${language}:${segment.content}`;

                                      return (
                                        <CodePanel
                                          key={`${message.id}-code-${segmentIndex}`}
                                          code={segment.content}
                                          language={language}
                                          copied={copiedCodeKey === codeKey}
                                          onCopy={() => void handleCopyCode(codeKey, segment.content)}
                                        />
                                      );
                                    }

                                    return (
                                      <div
                                        key={`${message.id}-markdown-${segmentIndex}`}
                                        className={[
                                          "relative overflow-hidden px-4 py-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.22)] transition-colors duration-200",
                                          message.isPinned
                                            ? "rounded-[22px] border border-amber-400/50 bg-amber-400/12 text-amber-50"
                                            : isMine
                                              ? "rounded-[22px] rounded-br-[8px] border border-sky-400/45 bg-sky-400/10 text-sky-50 min-[768px]:group-hover/message:border-sky-300/60 min-[768px]:group-hover/message:bg-sky-400/14"
                                              : "rounded-[22px] rounded-bl-[8px] border border-zinc-700/80 bg-[linear-gradient(180deg,rgba(39,39,42,0.96),rgba(24,24,27,0.98))] text-zinc-100",
                                        ].join(" ")}
                                      >
                                        <div className={[
                                          "pointer-events-none absolute inset-x-0 top-0 h-px opacity-70",
                                          isMine ? "bg-sky-200/45" : "bg-zinc-400/20",
                                        ].join(" ")} />
                                        <div className={[
                                          "whitespace-pre-wrap text-[15px] leading-6 max-[767px]:text-[13px] max-[767px]:leading-5",
                                          isMine ? "text-sky-50" : "text-zinc-100",
                                        ].join(" ")}>
                                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {segment.content}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex w-full items-center justify-end gap-1.5 px-2 text-right text-[11px] text-zinc-500">
                                {showTimestamp ? <span>{currentMessageTime}</span> : null}
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <form className="z-20 shrink-0 border-t border-zinc-800 bg-zinc-950/95 p-4 max-[767px]:p-3" onSubmit={handleSendMessage}>
                <div className="group/composer rounded-[22px] border border-zinc-800 bg-zinc-950/96 transition-colors duration-150 focus-within:border-lime-300/45 focus-within:bg-zinc-950">
                  {composerMode !== "message" ? (
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
                        {composerMode === "code" ? <Code2 className="h-3.5 w-3.5 text-sky-300" /> : <TerminalSquare className="h-3.5 w-3.5 text-emerald-300" />}
                        <span>{composerMode === "code" ? "Code" : "Command"}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetComposerMode}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
                        aria-label="Return to plain message composer"
                        title="Return to message mode"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Plain message</span>
                      </button>
                    </div>
                  ) : null}

                  <div className="relative">
                    {composerMode === "message" ? (
                      <div ref={composerMenuRef} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 max-[767px]:left-3">
                        <button
                          type="button"
                          onClick={() => setIsComposerMenuOpen((current) => !current)}
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/85 text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100",
                            isComposerMenuOpen ? "border-sky-300/70 text-sky-100" : "",
                          )}
                          aria-label="Open formatting options"
                          title="Formatting options"
                        >
                          {isComposerMenuOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </button>

                        {isComposerMenuOpen ? (
                          <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                            <button
                              type="button"
                              onClick={() => handleSelectComposerMode("code")}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-zinc-900"
                            >
                              <Code2 className="h-4 w-4 text-sky-300" />
                              <span>Code</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectComposerMode("command")}
                              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-zinc-900"
                            >
                              <TerminalSquare className="h-4 w-4 text-emerald-300" />
                              <span>Command Line</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={isSending || !draft.trim()}
                      className="absolute right-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full border border-lime-300/45 bg-lime-400/10 px-0 text-lime-200 shadow-none hover:border-lime-300/70 hover:bg-lime-400/15 hover:text-lime-100 disabled:border-zinc-700/70 disabled:bg-transparent disabled:text-zinc-600 max-[767px]:right-3"
                      aria-label={isSending ? "Sending message" : "Send message"}
                      title={isSending ? "Sending..." : "Send"}
                    >
                      <SendHorizonal className="h-4 w-4" />
                    </Button>

                    <Textarea
                      ref={draftTextareaRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      rows={composerMode === "message" ? 2 : 7}
                      placeholder={composerPlaceholder}
                      className={[
                        "w-full resize-none overflow-y-auto border-0 bg-transparent shadow-none outline-none focus:border-transparent focus:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none [&::-webkit-resizer]:hidden",
                        composerMode === "message"
                          ? "min-h-[84px] max-h-[220px] rounded-[22px] px-4 pb-5 pl-[4.5rem] pr-16 pt-5 text-[14px] leading-6 text-zinc-100 placeholder:text-zinc-500 max-[767px]:px-3 max-[767px]:pb-4 max-[767px]:pl-[4rem] max-[767px]:pr-14 max-[767px]:pt-4 max-[767px]:text-[13px] max-[767px]:leading-5 max-[767px]:placeholder:text-[12px]"
                          : "min-h-[208px] max-h-none rounded-b-[22px] px-4 pb-5 pr-16 pt-4 font-mono text-[13px] leading-6 text-zinc-100 placeholder:text-zinc-500",
                      ].join(" ")}
                    />
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950 px-6 py-12 text-center">
              <div className="max-w-sm space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900 text-zinc-300">
                  <MessageSquareMore className="h-6 w-6" />
                </div>
                <div className="text-lg font-semibold text-zinc-50">Pick a chat or start a new one</div>
                <div className="text-sm leading-6 text-zinc-500">Use the search box to find a teammate. Clicking their name always opens a fresh thread, so you can keep separate conversations with the same person.</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}