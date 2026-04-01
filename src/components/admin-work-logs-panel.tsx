"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { UserColorChip } from "@/components/user-color-chip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CurrentUser = {
  id: string;
  role: string;
  technicianLevel: string;
};

type WorkLogReportUser = {
  id: string;
  label: string;
  employeeId: string;
  role: string;
  technicianLevel: string;
};

type WorkLogEntry = {
  id: string;
  createdAt: string;
  ticketId: number;
  ticketTitle: string;
  entryType: string;
  hoursWorked: number;
  noteText: string | null;
  ateraCommentSync: string;
  user: WorkLogReportUser;
};

type WorkLogTicketSummary = {
  ticketId: number;
  ticketTitle: string;
  totalHours: number;
  entriesCount: number;
  lastLoggedAt: string;
};

type WorkLogUserSummary = {
  user: WorkLogReportUser;
  totalHours: number;
  entriesCount: number;
  ticketCount: number;
};

type WorkLogResponse = {
  users: WorkLogReportUser[];
  warning?: string | null;
  canViewAll?: boolean;
  filters: {
    userId: string | null;
    from: string | null;
    to: string | null;
  };
  report: {
    summary: {
      totalHours: number;
      totalEntries: number;
      totalTickets: number;
    };
    tickets: WorkLogTicketSummary[];
    users: WorkLogUserSummary[];
    entries: WorkLogEntry[];
  };
};

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseDateInput(value: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function entryTypeLabel(value: string) {
  return value === "resolve_note" ? "Resolve" : "Work";
}

export function AdminWorkLogsPanel({ currentUser, canViewAll }: { currentUser: CurrentUser; canViewAll: boolean }) {
  const [users, setUsers] = useState<WorkLogReportUser[]>([]);
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [ticketSummaries, setTicketSummaries] = useState<WorkLogTicketSummary[]>([]);
  const [userSummaries, setUserSummaries] = useState<WorkLogUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(canViewAll ? "all" : currentUser.id);
  const [fromDate, setFromDate] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() - 13);
    return formatDateInput(value);
  });
  const [toDate, setToDate] = useState(() => formatDateInput(new Date()));
  const [summary, setSummary] = useState({ totalHours: 0, totalEntries: 0, totalTickets: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users],
  );

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setWarning(null);

    try {
      const params = new URLSearchParams();
      if (selectedUserId !== "all") {
        params.set("userId", selectedUserId);
      }
      params.set("from", fromDate);
      params.set("to", toDate);

      const response = await fetch(`/api/admin/work-logs?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as WorkLogResponse | { error?: string } | null;

      if (!response.ok || !payload || !("report" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error || "Failed to load work logs." : "Failed to load work logs.");
      }

      setUsers(payload.users);
      setEntries(payload.report.entries);
      setTicketSummaries(payload.report.tickets);
      setUserSummaries(payload.report.users);
      setSummary(payload.report.summary);
      setWarning(payload.warning || null);

      if (!canViewAll && payload.filters.userId && payload.filters.userId !== selectedUserId) {
        setSelectedUserId(payload.filters.userId);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [canViewAll, fromDate, selectedUserId, toDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const isAdmin = currentUser.role === "ADMIN";
  const backHref = "/";
  const backLabel = "Back to dashboard";

  return (
    <div>
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{isAdmin ? "Admin Control" : "Hours Reporting"}</div>
        {isAdmin ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <AdminSectionNav current="hours" />
            </div>
            <Button onClick={() => void loadReport()} variant="outline" className="shrink-0 border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" disabled={isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button onClick={() => void loadReport()} variant="outline" className="border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" disabled={isLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link href={backHref} className={buttonVariants({ variant: "outline", className: "border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backLabel}
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-6 pt-3">
      <Card className="border-zinc-800 bg-zinc-950/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-50">
            <ShieldCheck className="h-5 w-5 text-lime-300" />
            Report filters
          </CardTitle>
          <CardDescription>
            {canViewAll
              ? "Choose a technician and date range to inspect logged hours and ticket attribution."
              : "Your technician filter is locked to your account. Adjust the date range to inspect your hours."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.7fr))] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="hours-user-filter">Technician</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="hours-user-filter" disabled={!canViewAll}>
                <SelectValue placeholder="All technicians" />
              </SelectTrigger>
              <SelectContent>
                {canViewAll ? <SelectItem value="all">All technicians</SelectItem> : null}
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.label} · {user.employeeId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours-from-date">From</Label>
            <DatePicker
              id="hours-from-date"
              value={parseDateInput(fromDate)}
              onChange={(date) => {
                if (!date) {
                  return;
                }

                setFromDate(formatDateInput(date));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours-to-date">To</Label>
            <DatePicker
              id="hours-to-date"
              value={parseDateInput(toDate)}
              onChange={(date) => {
                if (!date) {
                  return;
                }

                setToDate(formatDateInput(date));
              }}
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      {warning ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{warning}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardDescription>Total hours in range</CardDescription>
            <CardTitle>{summary.totalHours.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardDescription>Logged entries</CardDescription>
            <CardTitle>{summary.totalEntries}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardDescription>Tickets attributed</CardDescription>
            <CardTitle>{summary.totalTickets}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-50">
              <Clock3 className="h-5 w-5 text-teal-300" />
              Ticket attribution
            </CardTitle>
            <CardDescription>
              {selectedUser ? `Tickets attributed to ${selectedUser.label} in the selected period.` : "Tickets attributed across the selected period."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ticketSummaries.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 text-sm text-zinc-400">No ticket hours recorded for this filter.</div>
            ) : (
              <div className="space-y-3">
                {ticketSummaries.map((ticket) => (
                  <div key={ticket.ticketId} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-50">Ticket #{ticket.ticketId}</div>
                        <div className="mt-1 text-sm text-zinc-400">{ticket.ticketTitle}</div>
                      </div>
                      <Badge variant="success">{ticket.totalHours.toFixed(2)} h</Badge>
                    </div>
                    <div className="mt-3 text-xs text-zinc-500">{ticket.entriesCount} entr{ticket.entriesCount === 1 ? "y" : "ies"} · last logged {formatDateTime(ticket.lastLoggedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-50">
              <BarChart3 className="h-5 w-5 text-lime-300" />
              Logged entries
            </CardTitle>
            <CardDescription>Every internal hour log captured from work-note and resolve-note flows.</CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 text-sm text-zinc-400">No hours have been logged for this filter.</div>
            ) : (
              <div className="space-y-3">
                {!selectedUser && userSummaries.length > 0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4">
                    <div className="mb-3 text-sm font-semibold text-zinc-50">Team overview</div>
                    <div className="space-y-2">
                      {userSummaries.map((userSummary) => (
                        <div key={userSummary.user.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserColorChip label={userSummary.user.label} seed={userSummary.user.label} size="sm" />
                            <span>{userSummary.user.employeeId}</span>
                          </div>
                          <div>{userSummary.totalHours.toFixed(2)} h · {userSummary.ticketCount} ticket{userSummary.ticketCount === 1 ? "" : "s"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-50">Ticket #{entry.ticketId} · {entry.ticketTitle}</div>
                        <div className="mt-1 text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="success">{entry.hoursWorked.toFixed(2)} h</Badge>
                        <Badge variant="secondary">{entryTypeLabel(entry.entryType)}</Badge>
                        <Badge variant={entry.ateraCommentSync === "synced" ? "success" : "secondary"}>{entry.ateraCommentSync === "synced" ? "Atera synced" : "Internal only"}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                      <UserColorChip label={entry.user.label} seed={entry.user.label} size="sm" />
                      <span>{entry.user.employeeId}</span>
                    </div>
                    {entry.noteText ? (
                      <div className="mt-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-3 text-sm text-zinc-300">{entry.noteText}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}