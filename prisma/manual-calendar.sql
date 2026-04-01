CREATE TABLE IF NOT EXISTS "ScheduleEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "technicianUserId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME NOT NULL,
  "title" TEXT,
  "notes" TEXT,
  "ticketId" INTEGER,
  "ticketTitle" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleEvent_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScheduleEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScheduleEvent_technicianUserId_startDate_idx" ON "ScheduleEvent"("technicianUserId", "startDate");
CREATE INDEX IF NOT EXISTS "ScheduleEvent_startDate_endDate_idx" ON "ScheduleEvent"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "ScheduleEvent_eventType_idx" ON "ScheduleEvent"("eventType");