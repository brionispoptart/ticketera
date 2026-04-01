"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns";
import Link from "next/link";
import { ArrowLeft, MapPinned, Plane, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DayButton, type DayButtonProps } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { DatePicker } from "@/components/date-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Ticket } from "@/lib/types/tickets";
import { getUserColor, type UserColorProfile } from "@/lib/user-color";
import { cn } from "@/lib/utils";

type CalendarUser = {
  id: string;
  label: string;
  employeeId: string;
  role: string;
  technicianLevel: string;
};

type CalendarEventItem = {
  id: string;
  technicianUserId: string;
  technicianName: string;
  technicianEmployeeId: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmployeeId: string;
  eventType: "OUT_OF_OFFICE" | "ONSITE";
  startDate: string;
  endDate: string;
  title: string | null;
  notes: string | null;
  tickets: Array<{ ticketId: number; ticketTitle: string | null }>;
  ticketId: number | null;
  ticketTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

type OnsiteTicketDraft = {
  ticketId: string;
  ticketTitle: string;
};

type TicketOption = {
  id: string;
  title: string;
  label: string;
};

function isActiveTicketStatus(status?: string) {
  const value = (status || "").trim().toLowerCase();
  if (!value) {
    return false;
  }

  if (value.includes("resolve") || value.includes("close") || value.includes("done") || value.includes("complete")) {
    return false;
  }

  return value.includes("open") || value.includes("pending") || value.includes("in progress") || value.includes("new") || value.includes("created");
}

type ApiPayload = {
  events?: CalendarEventItem[];
  users?: CalendarUser[];
  canManageAll?: boolean;
  error?: string;
};

type FormState = {
  technicianUserId: string;
  eventType: "OUT_OF_OFFICE" | "ONSITE";
  startDate?: Date;
  endDate?: Date;
  title: string;
  notes: string;
  onsiteTickets: OnsiteTicketDraft[];
};

const EMPTY_FORM: FormState = {
  technicianUserId: "",
  eventType: "OUT_OF_OFFICE",
  startDate: undefined,
  endDate: undefined,
  title: "",
  notes: "",
  onsiteTickets: [{ ticketId: "", ticketTitle: "" }],
};

type Banner = {
  type: "success" | "error";
  message: string;
};

type EventWithDates = CalendarEventItem & {
  _start: Date;
  _end: Date;
};

type DayUserMarker = {
  userId: string;
  userName: string;
  color: UserColorProfile;
};

function isEventOnDate(event: EventWithDates, day: Date) {
  const target = startOfDay(day).getTime();
  const start = startOfDay(event._start).getTime();
  const end = endOfDay(event._end).getTime();
  return target >= start && target <= end;
}

function normalizeOnsiteTickets(input: OnsiteTicketDraft[]) {
  return input
    .map((ticket) => ({
      ticketId: ticket.ticketId.trim(),
      ticketTitle: ticket.ticketTitle.trim(),
    }))
    .filter((ticket) => /^\d+$/.test(ticket.ticketId))
    .map((ticket) => ({
      ticketId: Number(ticket.ticketId),
      ticketTitle: ticket.ticketTitle || undefined,
    }));
}

function toDayKey(value: Date) {
  return format(startOfDay(value), "yyyy-MM-dd");
}

export function TeamCalendarPanel({ currentUserId }: { currentUserId: string }) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [month, setMonth] = useState<Date>(today);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [users, setUsers] = useState<CalendarUser[]>([]);
  const [canManageAll, setCanManageAll] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, technicianUserId: currentUserId });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTicketsLoading, setIsTicketsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [availableTickets, setAvailableTickets] = useState<TicketOption[]>([]);

  const normalizedEvents = useMemo<EventWithDates[]>(() => {
    return events.map((event) => ({
      ...event,
      _start: parseISO(event.startDate),
      _end: parseISO(event.endDate),
    }));
  }, [events]);

  const dayEvents = useMemo(() => {
    return normalizedEvents
      .filter((event) => isEventOnDate(event, selectedDate))
      .sort((left, right) => left._start.getTime() - right._start.getTime());
  }, [normalizedEvents, selectedDate]);

  const userColorsById = useMemo(() => {
    return new Map(users.map((user) => [user.id, getUserColor(user.label)]));
  }, [users]);

  const calendarDayData = useMemo(() => {
    const oofDays: Date[] = [];
    const onDays: Date[] = [];
    const allDays: Date[] = [];
    const markers = new Map<string, Map<string, DayUserMarker>>();

    for (const event of normalizedEvents) {
      const eventDays = eachDayOfInterval({
        start: startOfDay(event._start),
        end: startOfDay(event._end),
      });

      allDays.push(...eventDays);

      if (event.eventType === "OUT_OF_OFFICE") {
        oofDays.push(...eventDays);
      } else if (event.eventType === "ONSITE") {
        onDays.push(...eventDays);
      }

      const color = userColorsById.get(event.technicianUserId) || getUserColor(event.technicianName);
      for (const day of eventDays) {
        const key = toDayKey(day);
        const existing = markers.get(key) || new Map<string, DayUserMarker>();

        if (!existing.has(event.technicianUserId)) {
          existing.set(event.technicianUserId, {
            userId: event.technicianUserId,
            userName: event.technicianName,
            color,
          });
        }

        markers.set(key, existing);
      }
    }

    const sortedMarkers = new Map(
      Array.from(markers.entries()).map(([key, value]) => [
        key,
        Array.from(value.values()).sort((left, right) => left.userName.localeCompare(right.userName)),
      ]),
    );

    return {
      outOfOfficeDays: oofDays,
      onsiteDays: onDays,
      scheduledDays: allDays,
      dayUserMarkers: sortedMarkers,
    };
  }, [normalizedEvents, userColorsById]);

  const resolveTechnicianUserId = useCallback(
    (availableUsers: CalendarUser[], allowManageAll: boolean, currentValue?: string) => {
      if (!allowManageAll) {
        return currentUserId;
      }

      const preferred = currentValue || currentUserId;
      if (availableUsers.some((user) => user.id === preferred)) {
        return preferred;
      }

      return availableUsers[0]?.id || "";
    },
    [currentUserId],
  );

  const loadCalendarData = useCallback(async (monthDate: Date) => {
    setIsLoading(true);

    try {
      const rangeStart = startOfMonth(addMonths(monthDate, -1));
      const rangeEnd = endOfMonth(addMonths(monthDate, 1));
      const params = new URLSearchParams({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      });

      const response = await fetch(`/api/calendar/events?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load calendar events.");
      }

      const nextUsers = payload?.users || [];
      const nextCanManageAll = Boolean(payload?.canManageAll);
      setEvents(payload?.events || []);
      setUsers(nextUsers);
      setCanManageAll(nextCanManageAll);
      setForm((current) => ({
        ...current,
        technicianUserId: resolveTechnicianUserId(nextUsers, nextCanManageAll, current.technicianUserId),
      }));
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [resolveTechnicianUserId]);

  const loadTicketOptions = useCallback(async () => {
    setIsTicketsLoading(true);

    try {
      const response = await fetch("/api/tickets", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { items?: Ticket[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load ticket options.");
      }

      const options = (payload?.items || [])
        .filter((ticket) => isActiveTicketStatus(ticket.TicketStatus))
        .map((ticket) => ({
          id: String(ticket.TicketID),
          title: ticket.TicketTitle || "",
          label: `#${ticket.TicketID} - ${ticket.TicketTitle || "Untitled ticket"}`,
        }))
        .sort((left, right) => Number(right.id) - Number(left.id))
        .slice(0, 250);
      setAvailableTickets(options);
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendarData(month);
  }, [loadCalendarData, month]);

  useEffect(() => {
    if (form.eventType === "ONSITE" && availableTickets.length === 0) {
      void loadTicketOptions();
    }
  }, [form.eventType, availableTickets.length, loadTicketOptions]);

  function resetForm() {
    setEditingEventId(null);
    setForm({
      ...EMPTY_FORM,
      technicianUserId: resolveTechnicianUserId(users, canManageAll),
    });
  }

  function populateFormForEdit(event: CalendarEventItem) {
    const onsiteTickets = event.tickets.length > 0
      ? event.tickets.map((ticket) => ({
          ticketId: String(ticket.ticketId),
          ticketTitle: ticket.ticketTitle || "",
        }))
      : (event.ticketId
          ? [{ ticketId: String(event.ticketId), ticketTitle: event.ticketTitle || "" }]
          : [{ ticketId: "", ticketTitle: "" }]);

    setEditingEventId(event.id);
    setForm({
      technicianUserId: event.technicianUserId,
      eventType: event.eventType,
      startDate: parseISO(event.startDate),
      endDate: parseISO(event.endDate),
      title: event.title || "",
      notes: event.notes || "",
      onsiteTickets,
    });
  }

  function updateOnsiteTicket(index: number, patch: Partial<OnsiteTicketDraft>) {
    setForm((current) => ({
      ...current,
      onsiteTickets: current.onsiteTickets.map((ticket, ticketIndex) =>
        ticketIndex === index ? { ...ticket, ...patch } : ticket,
      ),
    }));
  }

  function addOnsiteTicketRow() {
    setForm((current) => ({
      ...current,
      onsiteTickets: [...current.onsiteTickets, { ticketId: "", ticketTitle: "" }],
    }));
  }

  function removeOnsiteTicketRow(index: number) {
    setForm((current) => {
      if (current.onsiteTickets.length <= 1) {
        return {
          ...current,
          onsiteTickets: [{ ticketId: "", ticketTitle: "" }],
        };
      }

      return {
        ...current,
        onsiteTickets: current.onsiteTickets.filter((_, ticketIndex) => ticketIndex !== index),
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setBanner(null);

    try {
      if (!form.startDate || !form.endDate) {
        throw new Error("Start date and end date are required.");
      }

      const normalizedOnsiteTickets = form.eventType === "ONSITE" ? normalizeOnsiteTickets(form.onsiteTickets) : [];

      const payload = {
        technicianUserId: form.technicianUserId,
        eventType: form.eventType,
        startDate: form.startDate.toISOString(),
        endDate: form.endDate.toISOString(),
        title: form.title,
        notes: form.notes,
        tickets: form.eventType === "ONSITE" ? normalizedOnsiteTickets : undefined,
      };

      const endpoint = editingEventId ? `/api/calendar/events/${editingEventId}` : "/api/calendar/events";
      const method = editingEventId ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(result?.error || "Failed to save event.");
      }

      setBanner({
        type: "success",
        message: editingEventId ? "Calendar event updated." : "Calendar event created.",
      });
      await loadCalendarData(month);
      resetForm();
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEventId) {
      return;
    }

    setIsDeleting(true);
    setBanner(null);

    try {
      const response = await fetch(`/api/calendar/events/${editingEventId}`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error || "Failed to delete event.");
      }

      setBanner({ type: "success", message: "Calendar event deleted." });
      await loadCalendarData(month);
      resetForm();
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  function CalendarDayMarkerButton({ day, modifiers, className, children, ...buttonProps }: DayButtonProps) {
    const markers = calendarDayData.dayUserMarkers.get(toDayKey(day.date)) || [];
    const visibleMarkers = markers.slice(0, 4);
    const overflowCount = Math.max(0, markers.length - visibleMarkers.length);

    return (
      <DayButton
        day={day}
        modifiers={modifiers}
        className={cn(className, "relative h-12 w-full rounded-md px-0 py-1")}
        {...buttonProps}
      >
        <span className="flex h-full w-full flex-col items-center justify-center">
          <span className="leading-none">{children}</span>
          <span className="mt-1 flex min-h-1.5 items-center justify-center gap-0.5">
            {visibleMarkers.map((marker) => (
              <span
                key={`${toDayKey(day.date)}-${marker.userId}`}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: marker.color.dotColor }}
                title={marker.userName}
                aria-hidden="true"
              />
            ))}
            {overflowCount > 0 ? <span className="text-[9px] text-zinc-500">+{overflowCount}</span> : null}
          </span>
        </span>
      </DayButton>
    );
  }

  return (
    <div>
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Team Calendar</div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={() => void loadCalendarData(month)} variant="outline" className="border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="space-y-6 pt-3">

      {banner ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "error" ? "border-rose-500/35 bg-rose-500/10 text-rose-100" : "border-lime-500/35 bg-lime-500/10 text-lime-100"}`}
        >
          {banner.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="text-zinc-50">Schedule View</CardTitle>
            <CardDescription>Select a day to view all technician events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              month={month}
              onMonthChange={(nextMonth) => setMonth(nextMonth)}
              onSelect={(value) => {
                if (value) {
                  const day = startOfDay(value);
                  setSelectedDate(day);
                  if (!editingEventId) {
                    setForm((current) => ({ ...current, startDate: day }));
                  }
                }
              }}
              modifiers={{
                scheduled: calendarDayData.scheduledDays,
                outOfOffice: calendarDayData.outOfOfficeDays,
                onsite: calendarDayData.onsiteDays,
              }}
              modifiersClassNames={{
                scheduled: "ring-1 ring-lime-400/30",
                outOfOffice: "ring-1 ring-violet-400/45 bg-violet-500/10",
                onsite: "ring-1 ring-teal-400/45 bg-teal-500/10",
              }}
              classNames={{
                day: "h-12 flex-1 p-0 text-center text-sm",
                day_button: "h-12 w-full rounded-md px-0 py-1 font-normal text-zinc-100 aria-selected:opacity-100 hover:bg-zinc-800 hover:text-zinc-50",
              }}
              components={{
                DayButton: CalendarDayMarkerButton,
              }}
            />

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
              <div className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-lime-400/70" />
                Scheduled activity
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-violet-400/70" />
                Out of office
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-teal-400/70" />
                Onsite visit
              </div>
            </div>

          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="text-zinc-50">{editingEventId ? "Edit event" : "Add event"}</CardTitle>
            <CardDescription>
              Track technician availability and onsite work tied to ticket IDs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-type">Event type</Label>
                  <Select
                    value={form.eventType}
                    onValueChange={(value: "OUT_OF_OFFICE" | "ONSITE") => {
                      setForm((current) => ({
                        ...current,
                        eventType: value,
                        onsiteTickets: value === "ONSITE" ? current.onsiteTickets : [{ ticketId: "", ticketTitle: "" }],
                      }));
                    }}
                  >
                    <SelectTrigger id="event-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OUT_OF_OFFICE">Out of office</SelectItem>
                      <SelectItem value="ONSITE">Onsite visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tech-user">Technician</Label>
                  <Select
                    value={form.technicianUserId}
                    onValueChange={(value) => setForm((current) => ({ ...current, technicianUserId: value }))}
                    disabled={!canManageAll}
                  >
                    <SelectTrigger id="tech-user">
                      <SelectValue placeholder="Select technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => {
                        const color = userColorsById.get(user.id) || getUserColor(user.label);

                        return (
                          <SelectItem key={user.id} value={user.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color.dotColor }} aria-hidden="true" />
                              <span>{user.label}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start date</Label>
                  <DatePicker
                    id="start-date"
                    value={form.startDate}
                    onChange={(date) => {
                      setForm((current) => ({
                        ...current,
                        startDate: date ? startOfDay(date) : undefined,
                      }));
                    }}
                    placeholder="Pick start date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End date</Label>
                  <DatePicker
                    id="end-date"
                    value={form.endDate}
                    onChange={(date) => {
                      setForm((current) => ({
                        ...current,
                        endDate: date ? endOfDay(date) : undefined,
                      }));
                    }}
                    placeholder="Pick end date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={form.title}
                  onChange={(inputEvent) => setForm((current) => ({ ...current, title: inputEvent.target.value }))}
                  placeholder={form.eventType === "ONSITE" ? "Example: Printer replacement at West Campus" : "Example: PTO"}
                />
              </div>

              {form.eventType === "ONSITE" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Attached tickets</Label>
                    <Button type="button" variant="outline" onClick={addOnsiteTicketRow} className="h-9">
                      <Plus className="mr-2 h-4 w-4" />
                      Add ticket
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {form.onsiteTickets.map((ticket, index) => (
                      <div key={`ticket-row-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                        <Select
                          value={ticket.ticketId || undefined}
                          onValueChange={(value) => {
                            const selected = availableTickets.find((option) => option.id === value);
                            updateOnsiteTicket(index, {
                              ticketId: value,
                              ticketTitle: selected?.title || "",
                            });
                          }}
                        >
                          <SelectTrigger className="min-w-0 [&>span]:truncate [&>span]:text-left">
                            <SelectValue placeholder={isTicketsLoading ? "Loading tickets..." : "Select ticket"} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableTickets.map((option) => {
                              const usedByAnotherRow = form.onsiteTickets.some((row, rowIndex) => rowIndex !== index && row.ticketId === option.id);

                              return (
                                <SelectItem key={option.id} value={option.id} disabled={usedByAnotherRow}>
                                  <span className="block max-w-[30rem] truncate">{option.label}</span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Input
                          value={ticket.ticketTitle}
                          onChange={(inputEvent) => updateOnsiteTicket(index, { ticketTitle: inputEvent.target.value })}
                          placeholder="Ticket title (optional)"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeOnsiteTicketRow(index)}
                          className="h-11 border-rose-500/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                          aria-label="Remove ticket"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-zinc-500">Use one row per attached ticket. Ticket title auto-fills from the selected ticket.</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="event-notes">Notes</Label>
                <Textarea
                  id="event-notes"
                  value={form.notes}
                  onChange={(inputEvent) => setForm((current) => ({ ...current, notes: inputEvent.target.value }))}
                  placeholder="Context for the team..."
                  rows={4}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : editingEventId ? "Save changes" : "Create event"}
                </Button>

                {editingEventId ? (
                  <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving || isDeleting}>
                    Cancel edit
                  </Button>
                ) : null}

                {editingEventId ? (
                  <Button type="button" variant="outline" onClick={() => void handleDelete()} disabled={isSaving || isDeleting} className="border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete event"}
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-950/80">
        <CardHeader>
          <CardTitle className="text-zinc-50">{format(selectedDate, "EEEE, MMM d, yyyy")}</CardTitle>
          <CardDescription>Scheduled events for the selected day.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-zinc-400">Loading events…</div>
          ) : dayEvents.length === 0 ? (
            <div className="text-sm text-zinc-400">No scheduled events for this day.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dayEvents.map((item) => {
                const c = userColorsById.get(item.technicianUserId) || getUserColor(item.technicianName);
                const isEditable = canManageAll || item.technicianUserId === currentUserId;
                return (
                  <button
                    key={`day-${item.id}`}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => isEditable && populateFormForEdit(item)}
                    className="w-full rounded-lg border px-2.5 py-2 text-left text-sm transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-100"
                    style={{ borderColor: c.badgeBorderColor, backgroundColor: c.badgeBackgroundColor, color: c.badgeTextColor }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {item.eventType === "ONSITE" ? <MapPinned className="h-3.5 w-3.5" /> : <Plane className="h-3.5 w-3.5" />}
                      <span className="font-semibold">{item.technicianName}</span>
                      <span className="text-xs opacity-85">{item.eventType === "ONSITE" ? "Onsite" : "Out of office"}</span>
                    </div>
                    {item.title ? <div className="mt-1 text-xs opacity-85">{item.title}</div> : null}
                    {item.eventType === "ONSITE" && item.tickets.length > 0 ? (
                      <div className="mt-1 space-y-0.5 text-xs opacity-85">
                        {item.tickets.map((ticket) => (
                          <div key={`day-ticket-${item.id}-${ticket.ticketId}`}>
                            Ticket #{ticket.ticketId}{ticket.ticketTitle ? ` · ${ticket.ticketTitle}` : ""}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {isEditable ? <div className="mt-1 text-[10px] opacity-60">Click to edit</div> : null}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      </div>
    </div>
  );
}
