import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/api";
import { createManagedUser, listManagedUsers } from "@/lib/auth/admin-users";
import { recordAuditLog } from "@/lib/auth/session";
import { getValidationErrorMessage, managedUserRequestSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const items = await listManagedUsers();
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const parsedBody = managedUserRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: getValidationErrorMessage(parsedBody.error) }, { status: 400 });
    }

    const created = await createManagedUser(parsedBody.data);

    await recordAuditLog({
      actorUserId: admin.user.id,
      action: "admin.user_created",
      targetType: "user",
      targetId: created.user.id,
      metadata: { email: created.user.email, role: created.user.role },
    });

    return NextResponse.json({ ok: true, item: created.user, temporaryPassword: created.temporaryPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
