"use client";

import { useEffect, useMemo, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AuditLogResponse = {
  items: AuditLogItem[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  error?: string;
};

const PAGE_SIZE = 20;

function formatAction(action: string) {
  return action
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminAuditLogsPanel() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAuditLogs(page);
  }, [page]);

  async function loadAuditLogs(nextPage: number) {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as AuditLogResponse | null;

      if (!response.ok || !payload?.pageInfo) {
        throw new Error(payload?.error || "Failed to load audit logs.");
      }

      setItems(payload.items || []);
      setPage(payload.pageInfo.page);
      setTotalCount(payload.pageInfo.totalCount);
      setTotalPages(payload.pageInfo.totalPages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return "No events";
    }

    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, totalCount);
    return `Showing ${start}-${end} of ${totalCount}`;
  }, [page, totalCount]);

  return (
    <div>
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Admin Control</div>
        <AdminSectionNav current="logs" />
      </div>

      <div className="space-y-6 pt-3">
      {error ? (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">{error}</div>
      ) : null}

      <Card className="border-zinc-800 bg-zinc-950/80">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-zinc-50">
              <History className="h-5 w-5 text-fuchsia-300" />
              Recent audit activity
            </CardTitle>
            <CardDescription>{rangeLabel}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" onClick={() => void loadAuditLogs(page)} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" variant="outline" className="border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={isLoading || page <= 1}>
              Previous
            </Button>
            <Button type="button" variant="outline" className="border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={isLoading || page >= totalPages}>
              Next
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-zinc-400">Loading audit log...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-400">No audit events found yet.</div>
          ) : (
            <div className="space-y-3">
              {items.map((log) => (
                <div key={log.id} className="rounded-[20px] border border-zinc-800 bg-black/30 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-100">{formatAction(log.action)}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">Actor: {log.actorLabel}</div>
                  <div className="text-sm text-zinc-400">Target: {log.targetLabel}</div>
                  {log.metadata ? (
                    <pre className="mt-3 overflow-x-auto break-all whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-400">{JSON.stringify(log.metadata, null, 2)}</pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}