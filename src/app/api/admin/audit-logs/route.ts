import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/api";
import { listAuditLogsPage } from "@/lib/auth/audit-logs";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser(request);
  if (admin instanceof NextResponse) {
    return admin;
  }

  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || "1");
    const limit = Number(url.searchParams.get("limit") || "20");
    const result = await listAuditLogsPage(page, limit);
    return NextResponse.json({
      items: result.items,
      pageInfo: {
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrevious: result.hasPrevious,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
