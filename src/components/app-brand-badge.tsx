type AppBrandBadgeProps = {
  displayName: string;
  location: string | null;
  plan: string | null;
  compact?: boolean;
  unreadCount?: number;
};

function getInitials(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "AT";
  }

  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

export function AppBrandBadge({ displayName, location, plan, compact = false, unreadCount = 0 }: AppBrandBadgeProps) {
  const unreadLabel = `${unreadCount > 99 ? "99+" : unreadCount} unread`;

  return (
    <div className={`rounded-3xl border border-zinc-800/90 bg-zinc-950/85 text-zinc-100 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-lime-400/30 bg-lime-400/10 text-sm font-semibold uppercase tracking-[0.18em] text-lime-300">
          {getInitials(displayName)}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Atera Workspace</div>
          <div className="truncate text-sm font-semibold text-zinc-50">{displayName}</div>
          <div className="truncate text-xs text-zinc-400">
            {[location, plan].filter(Boolean).join(" · ") || "Connected tenant"}
          </div>
        </div>
        <div
          className={[
            "w-[92px] shrink-0 rounded-full border border-teal-400/30 px-2.5 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] transition-opacity",
            unreadCount > 0 ? "bg-teal-400/12 text-teal-300 opacity-100" : "bg-transparent text-transparent opacity-0",
          ].join(" ")}
          aria-hidden={unreadCount === 0}
        >
          {unreadLabel}
        </div>
      </div>
    </div>
  );
}