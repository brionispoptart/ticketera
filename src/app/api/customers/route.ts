import { NextRequest, NextResponse } from "next/server";

import { ateraJson } from "@/lib/atera";
import { requireApiUser } from "@/lib/auth/api";

type AteraCustomer = {
  CustomerID: number;
  CustomerName: string;
};

type AteraCustomersResponse = {
  items?: AteraCustomer[];
  totalItemCount?: number;
  nextLink?: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const allNames: string[] = [];
    let page = 1;
    const itemsInPage = 50;

    // Paginate through all customers
    for (;;) {
      const data = await ateraJson<AteraCustomersResponse>(
        `/customers?page=${page}&itemsInPage=${itemsInPage}`,
      );
      if (Array.isArray(data.items)) {
        for (const c of data.items) {
          if (c.CustomerName) allNames.push(c.CustomerName);
        }
      }
      if (!data.nextLink || !data.items?.length) break;
      page++;
    }

    allNames.sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ items: allNames });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
