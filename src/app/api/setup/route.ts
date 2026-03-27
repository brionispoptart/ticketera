import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { completeInitialSetup, getSetupStatus } from "@/lib/setup";
import { getValidationErrorMessage, setupAdminFieldsSchema, setupRequestSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit({
      scope: "app.setup",
      key: getClientIp(request),
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many setup attempts from this address. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const status = await getSetupStatus();
    if (status.isSetupComplete) {
      return NextResponse.json({ error: "Initial setup has already been completed." }, { status: 409 });
    }

    const parsedBody = setupRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const { email, firstName, lastName, employeeId, password, confirmPassword, ateraApiKey } = parsedBody.data;

    if (status.needsAdminCreation) {
      const adminFields = setupAdminFieldsSchema.safeParse({
        email,
        firstName,
        lastName,
        employeeId,
        password,
        confirmPassword,
      });
      if (!adminFields.success) {
        return NextResponse.json({ error: getValidationErrorMessage(adminFields.error) }, { status: 400 });
      }
    }

    if (status.needsAdminCreation && password !== confirmPassword) {
      return NextResponse.json({ error: "Password confirmation does not match." }, { status: 400 });
    }

    await completeInitialSetup({
      email,
      firstName,
      lastName,
      employeeId,
      password,
      ateraApiKey,
    });

    return NextResponse.json({ ok: true, redirectTo: "/login" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}