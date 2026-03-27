import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/api";
import { updateManagedUser } from "@/lib/auth/admin-users";
import { recordAuditLog } from "@/lib/auth/session";
import type { IdRouteContext } from "@/lib/types/api";

export async function PATCH(request: NextRequest, { params }: IdRouteContext) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const updated = await updateManagedUser(id, admin.user.id, body);

    await recordAuditLog({
      actorUserId: admin.user.id,
      action: "admin.user_updated",
      targetType: "user",
      targetId: updated.id,
      metadata: { email: updated.email, role: updated.role, isActive: updated.isActive },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
