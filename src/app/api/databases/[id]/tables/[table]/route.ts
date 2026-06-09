import { NextResponse, type NextRequest } from "next/server";
import { requireEngine } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import type { EditColumn } from "@/lib/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; table: string }> };

/** Get a table's column schema and current row count (for the table editor). */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    return NextResponse.json(await requireEngine(id).describeTable(table));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Rebuild a table (rename / change columns). Body: `{ name, columns }`. */
export async function PUT(request: NextRequest, { params }: Params) {
  const { id, table } = await params;
  try {
    const { name, columns } = (await request.json()) as {
      name?: string;
      columns?: EditColumn[];
    };
    if (!name || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: "A table name and at least one column are required." },
        { status: 400 },
      );
    }
    const engine = requireEngine(id);
    await engine.rebuildTable(table, name, columns);
    return NextResponse.json({ tables: await engine.listTables() });
  } catch (err) {
    return errorResponse(err);
  }
}
