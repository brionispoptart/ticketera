import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";

export async function GET(request: NextRequest) {
  const session = await requireApiUser(request);
  if (session instanceof NextResponse) {
    return session;
  }

  return NextResponse.json({
    ok: true,
    user: session.user,
  });
}
