import { NextResponse, type NextRequest } from "next/server";
import { openD1 } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";

// Reaching Cloudflare D1 (fetch) needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

/**
 * Open a remote Cloudflare D1 database. Body:
 * `{ accountId, databaseId, apiToken, name? }`. The connection is held in memory
 * only until the tab is closed (DELETE /api/databases/[id]).
 */
export async function POST(request: NextRequest) {
  let body: {
    accountId?: string;
    databaseId?: string;
    apiToken?: string;
    name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const accountId = body.accountId?.trim();
  const databaseId = body.databaseId?.trim();
  const apiToken = body.apiToken?.trim();
  if (!accountId || !databaseId || !apiToken) {
    return NextResponse.json(
      { error: "Account ID, database ID, and API token are all required." },
      { status: 400 },
    );
  }

  try {
    const info = await openD1(
      { accountId, databaseId, apiToken },
      body.name ?? "",
    );
    return NextResponse.json(info);
  } catch (err) {
    return errorResponse(err);
  }
}
