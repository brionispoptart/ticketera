import { z } from "zod";

const REQUIRED_TEXT_MAX = 255;
const MESSAGE_MAX_LENGTH = 4000;
const PASSWORD_MAX_LENGTH = 128;

function requiredTrimmedString(label: string, maxLength = REQUIRED_TEXT_MAX) {
  return z.string().trim().min(1, `${label} is required.`).max(maxLength, `${label} must be ${maxLength} characters or fewer.`);
}

function optionalTrimmedString(maxLength = REQUIRED_TEXT_MAX) {
  return z.string().trim().max(maxLength, `Value must be ${maxLength} characters or fewer.`).optional().transform((value) => value || undefined);
}

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").max(320, "Email must be 320 characters or fewer.").email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required.").max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
}).strict();

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(PASSWORD_MAX_LENGTH, `Current password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
  newPassword: z.string().min(1, "New password is required.").max(PASSWORD_MAX_LENGTH, `New password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
  confirmPassword: z.string().min(1, "New password confirmation is required.").max(PASSWORD_MAX_LENGTH, `New password confirmation must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
}).strict();

export const setupRequestSchema = z.object({
  email: optionalTrimmedString(320),
  firstName: optionalTrimmedString(),
  lastName: optionalTrimmedString(),
  employeeId: optionalTrimmedString(64),
  password: z.string().max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`).optional().default(""),
  confirmPassword: z.string().max(PASSWORD_MAX_LENGTH, `Password confirmation must be ${PASSWORD_MAX_LENGTH} characters or fewer.`).optional().default(""),
  ateraApiKey: requiredTrimmedString("Atera API key", 512),
}).strict();

export const setupAdminFieldsSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").max(320, "Email must be 320 characters or fewer.").email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  firstName: requiredTrimmedString("First name"),
  lastName: requiredTrimmedString("Last name"),
  employeeId: requiredTrimmedString("Employee ID", 64),
  password: z.string().min(1, "Password is required.").max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
  confirmPassword: z.string().min(1, "Password confirmation is required.").max(PASSWORD_MAX_LENGTH, `Password confirmation must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
}).strict();

export const createConversationRequestSchema = z.object({
  userId: requiredTrimmedString("Recipient user", 64),
}).strict();

export const ticketCommentRequestSchema = z.object({
  message: requiredTrimmedString("Message", MESSAGE_MAX_LENGTH),
  hoursWorked: z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? Number(trimmed) : Number.NaN;
      }

      return value;
    },
    z.number({ message: "Hours worked is required." }).finite("Hours worked must be zero or greater.").min(0, "Hours worked must be zero or greater."),
  ),
  ticketTitle: optionalTrimmedString(),
}).strict();

export const managedUserRequestSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").max(320, "Email must be 320 characters or fewer.").email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  firstName: requiredTrimmedString("First name"),
  lastName: requiredTrimmedString("Last name"),
  employeeId: requiredTrimmedString("Employee ID", 64),
  avatarUrl: optionalTrimmedString(2048),
  technicianLevel: requiredTrimmedString("Technician level", 16),
  role: requiredTrimmedString("Role", 16),
  isActive: z.boolean(),
  password: optionalTrimmedString(PASSWORD_MAX_LENGTH),
}).strict();

export const resetPasswordRequestSchema = z.object({
  password: optionalTrimmedString(PASSWORD_MAX_LENGTH),
}).strict();

export function getValidationErrorMessage(error: z.ZodError) {
  return error.issues[0]?.message || "Invalid request.";
}