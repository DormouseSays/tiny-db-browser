import { NextResponse, type NextRequest } from "next/server";
import { withDatabase } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import { runQuery } from "@/lib/sqlite";
import { encodeRow } from "@/lib/wire";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Run ad-hoc SQL. better-sqlite3 writes any changes through to the file
 * immediately, so a read-only query does no disk writes at all.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { sql } = (await request.json()) as { sql?: string };
    if (typeof sql !== "string") {
      return NextResponse.json({ error: "Missing SQL." }, { status: 400 });
    }
    const result = withDatabase(id, (db) => runQuery(db, sql));
    return NextResponse.json({
      columns: result.columns,
      rows: result.rows.map(encodeRow),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
