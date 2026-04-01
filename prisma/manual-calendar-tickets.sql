CREATE TABLE IF NOT EXISTS "ScheduleEventTicket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scheduleEventId" TEXT NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "ticketTitle" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleEventTicket_scheduleEventId_fkey" FOREIGN KEY ("scheduleEventId") REFERENCES "ScheduleEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleEventTicket_scheduleEventId_ticketId_key" ON "ScheduleEventTicket"("scheduleEventId", "ticketId");
CREATE INDEX IF NOT EXISTS "ScheduleEventTicket_scheduleEventId_idx" ON "ScheduleEventTicket"("scheduleEventId");
CREATE INDEX IF NOT EXISTS "ScheduleEventTicket_ticketId_idx" ON "ScheduleEventTicket"("ticketId");