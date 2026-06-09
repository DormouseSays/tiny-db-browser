import { NextResponse, type NextRequest } from "next/server";
import { requireEngine } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import { encodeRow } from "@/lib/wire";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Run ad-hoc SQL. The local engine writes any changes through to the file
 * immediately; the D1 engine sends them to Cloudflare — either way a read-only
 * query just returns its rows.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { sql } = (await request.json()) as { sql?: string };
    if (typeof sql !== "string") {
      return NextResponse.json({ error: "Missing SQL." }, { status: 400 });
    }
    const result = await requireEngine(id).runQuery(sql);
    return NextResponse.json({
      columns: result.columns,
      rows: result.rows.map(encodeRow),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
