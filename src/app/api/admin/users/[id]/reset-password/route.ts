import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/api";
import { resetManagedUserPassword } from "@/lib/auth/admin-users";
import { recordAuditLog } from "@/lib/auth/session";
import type { IdRouteContext } from "@/lib/types/api";
import { getValidationErrorMessage, resetPasswordRequestSchema } from "@/lib/validation";

export async function POST(request: NextRequest, { params }: IdRouteContext) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const { id } = await params;
    const parsedBody = resetPasswordRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const reset = await resetManagedUserPassword(
      id,
      admin.user.id,
      parsedBody.data.password,
    );

    await recordAuditLog({
      actorUserId: admin.user.id,
      action: "admin.user_password_reset",
      targetType: "user",
      targetId: id,
    });

    return NextResponse.json({ ok: true, temporaryPassword: reset.temporaryPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
