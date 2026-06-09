import { NextResponse, type NextRequest } from "next/server";
import { requireEngine } from "@/lib/server/registry";
import { errorResponse } from "@/lib/server/respond";
import type { ColumnDefinition } from "@/lib/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** List the user tables in a database. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    return NextResponse.json({ tables: await requireEngine(id).listTables() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Create a new table. Body: `{ name, columns }`. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { name, columns } = (await request.json()) as {
      name?: string;
      columns?: ColumnDefinition[];
    };
    if (!name || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json(
        { error: "A table name and at least one column are required." },
        { status: 400 },
      );
    }
    const engine = requireEngine(id);
    await engine.createTable(name, columns);
    return NextResponse.json({ tables: await engine.listTables() });
  } catch (err) {
    return errorResponse(err);
  }
}
