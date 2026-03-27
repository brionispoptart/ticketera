import type { AuthUser } from "@/lib/auth/session";

export type TicketNoteKind = "work" | "resolve";

function noteKindLabel(kind: TicketNoteKind) {
  return kind === "resolve" ? "[Resolve Note]" : "[Work Note]";
}

function buildNoteSignature(firstName?: string, lastName?: string) {
  const safeFirstName = (firstName || "").trim();
  const safeLastInitial = (lastName || "").trim().charAt(0).toUpperCase();

  if (safeFirstName && safeLastInitial) {
    return `- ${safeFirstName} ${safeLastInitial}.`;
  }

  if (safeFirstName) {
    return `- ${safeFirstName}`;
  }

  return "- Operator";
}

export function formatOperatorLabel(user: Pick<AuthUser, "firstName" | "lastName">) {
  const safeFirstName = (user.firstName || "").trim();
  const safeLastInitial = (user.lastName || "").trim().charAt(0).toUpperCase();

  if (safeFirstName && safeLastInitial) {
    return `${safeFirstName} ${safeLastInitial}.`;
  }

  if (safeFirstName) {
    return safeFirstName;
  }

  return "Operator";
}

export function formatTicketNote(
  message: string,
  user: Pick<AuthUser, "firstName" | "lastName">,
  kind: TicketNoteKind,
  hoursWorked?: number | string | null,
) {
  void hoursWorked;
  return `${noteKindLabel(kind)} ${message.trim()}\n\n${buildNoteSignature(user.firstName, user.lastName)}`;
}

export function formatTicketActionComment(message: string, user: Pick<AuthUser, "firstName" | "lastName">) {
  return `${message} by ${formatOperatorLabel(user)}`;
}